import { spawn } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, Cancelled } from './data.js';
import { FRAME_BYTES, CHUNK_BYTES } from './configuration-data.js';
import type { ConfigurationData } from './configuration-data.js';

/** Configuration-only supervised process. One callback operation is in flight. */
export async function readConfiguration(capture: Capture, config: string): Promise<ConfigurationData> {
  capture.check();
  const source = import.meta.url.endsWith('.ts');
  const helper = fileURLToPath(new URL(`./configuration-helper.${source ? 'ts' : 'js'}`, import.meta.url));
  const budget = Math.floor(capture.limits.maxInputBytes / 4);
  const child = spawn(process.execPath, [...(source ? ['--import', import.meta.resolve('tsx')] : []), helper,
    capture.root, config, String(budget)], { detached: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let failure: unknown;
  let terminal = false;
  let stderr = '';
  let buffer = Buffer.alloc(0);
  let pending: { id: number; bytes: Buffer; offset: number } | undefined;
  let busy = false;
  let lastId = 0;
  let resultSize = 0;
  let resultComplete = false;
  const resultChunks: Buffer[] = [];
  let escalation: ReturnType<typeof setTimeout> | undefined;
  const kill = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') failure ??= error; }
  };
  const stop = (error: unknown) => {
    if (terminal) return;
    terminal = true; failure = error;
    kill('SIGTERM');
    escalation = setTimeout(() => kill('SIGKILL'), 500);
  };
  const abort = () => stop(new Cancelled());
  const timer = setTimeout(() => stop(new AcquisitionError('resource-limit', config, 'Configuration helper deadline exceeded')),
    Math.max(1, capture.deadline - performance.now()));
  capture.signal?.addEventListener('abort', abort, { once: true });
  if (capture.signal?.aborted) abort();
  const write = (value: unknown) => {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
    if (bytes.length > FRAME_BYTES) throw new AcquisitionError('resource-limit', config, 'Configuration frame byte limit exceeded');
    child.stdin.write(bytes);
  };
  const reply = () => {
    if (!pending) throw new Error('No pending configuration response');
    const { id, bytes, offset } = pending;
    const end = Math.min(bytes.length, offset + CHUNK_BYTES);
    write({ id, chunk: bytes.subarray(offset, end).toString('base64'), more: end < bytes.length });
    if (end === bytes.length) pending = undefined;
    else pending.offset = end;
  };
  let operation: Promise<void> = Promise.resolve();
  const message = async (frame: { kind: string; id: number; method?: string; path?: string; chunk?: string; more?: boolean }) => {
    if (terminal) return;
    capture.check();
    if (frame.kind === 'next') {
      if (!pending || pending.id !== frame.id) throw new Error('Unexpected configuration continuation');
      reply(); return;
    }
    if (!Number.isSafeInteger(frame.id) || frame.id !== lastId + 1 || pending || resultComplete) throw new Error('Invalid configuration sequence');
    lastId = frame.id;
    if (frame.kind === 'result') {
      if (typeof frame.chunk !== 'string') throw new Error('Invalid configuration result');
      const bytes = Buffer.from(frame.chunk, 'base64');
      resultSize += bytes.length;
      if (resultSize > budget) throw new AcquisitionError('resource-limit', config, 'Configuration result byte limit exceeded');
      resultChunks.push(bytes); resultComplete = !frame.more; write({ id: frame.id }); return;
    }
    if (frame.kind !== 'request' || typeof frame.path !== 'string' || resultChunks.length) throw new Error('Invalid configuration request');
    let value: unknown;
    switch (frame.method) {
      case 'readFile': value = await capture.readFile(frame.path, basename(frame.path) === 'package.json' ? 'dependency' : 'configuration') ?? null; break;
      case 'fileExists': value = await capture.fileExists(frame.path); break;
      case 'directoryExists': value = await capture.directoryExists(frame.path); break;
      case 'realPath': value = await capture.realPath(frame.path) ?? capture.path(frame.path); break;
      case 'readDirectory': {
        const files: string[] = [], directories: string[] = [];
        for (const path of await capture.readDirectory(frame.path)) {
          // Compiler file selection cannot use symlinks to invent owned roots.
          const kind = await capture.kind(path);
          if (kind === 'file') files.push(basename(path));
          if (kind === 'directory') directories.push(basename(path));
        }
        value = { files, directories }; break;
      }
      default: throw new Error('Unknown configuration filesystem method');
    }
    if (terminal) return;
    const bytes = Buffer.from(JSON.stringify(value));
    if (bytes.length > budget) throw new AcquisitionError('resource-limit', frame.path, 'Configuration response byte limit exceeded');
    pending = { id: frame.id, bytes, offset: 0 }; reply();
  };
  child.stdout.on('data', (bytes: Buffer) => {
    if (terminal) return;
    if (buffer.length + bytes.length > FRAME_BYTES) { stop(new AcquisitionError('resource-limit', config, 'Configuration frame byte limit exceeded')); return; }
    buffer = Buffer.concat([buffer, bytes]);
    const end = buffer.indexOf(10);
    if (end < 0) return;
    if (busy || buffer.indexOf(10, end + 1) >= 0) { stop(new Error('Concurrent configuration frames')); return; }
    const line = buffer.subarray(0, end).toString('utf8'); buffer = buffer.subarray(end + 1);
    busy = true;
    operation = (async () => { try { await message(JSON.parse(line)); } catch (error) { stop(error); } finally { busy = false; } })();
  });
  child.stderr.on('data', (bytes: Buffer) => { stderr = (stderr + bytes.toString('utf8')).slice(-8192); });
  child.stdin.on('error', error => { if (!terminal) stop(error); });
  try {
    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject); child.once('close', resolve);
    });
    await operation;
    if (failure) throw failure;
    if (code !== 0 || !resultComplete || buffer.length) throw new AcquisitionError('read-failure', config, `Configuration helper failed: ${stderr || `exit ${code}`}`);
    capture.check();
    return JSON.parse(Buffer.concat(resultChunks, resultSize).toString('utf8')) as ConfigurationData;
  } finally {
    terminal = true; clearTimeout(timer); clearTimeout(escalation);
    capture.signal?.removeEventListener('abort', abort);
    kill('SIGKILL');
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    pending = undefined; resultChunks.length = 0;
  }
}
