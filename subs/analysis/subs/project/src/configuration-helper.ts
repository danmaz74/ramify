import { readSync, writeSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { FRAME_BYTES, CHUNK_BYTES } from './configuration-data.js';
import type { ConfigurationData } from './configuration-data.js';

const [root, config, budgetText] = process.argv.slice(2);
if (!root || !config || !budgetText) throw new Error('Missing private configuration helper arguments');
const budget = Number(budgetText);
const sleeper = new Int32Array(new SharedArrayBuffer(4));
let buffered = Buffer.alloc(0);
let sequence = 0;
function send(value: unknown): void {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  if (bytes.length > FRAME_BYTES) throw new Error('Configuration frame byte limit exceeded');
  let offset = 0;
  while (offset < bytes.length) {
    try { offset += writeSync(1, bytes, offset, bytes.length - offset); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      Atomics.wait(sleeper, 0, 0, 1);
    }
  }
}
function receive(): { id: number; chunk?: string; more?: boolean; error?: string } {
  while (buffered.indexOf(10) < 0) {
    const bytes = Buffer.alloc(64 * 1024);
    try {
      const size = readSync(0, bytes, 0, bytes.length, null);
      if (!size) throw new Error('Configuration parent closed input');
      if (buffered.length + size > FRAME_BYTES) throw new Error('Configuration reply byte limit exceeded');
      buffered = Buffer.concat([buffered, bytes.subarray(0, size)]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      Atomics.wait(sleeper, 0, 0, 1);
    }
  }
  const end = buffered.indexOf(10);
  const result = JSON.parse(buffered.subarray(0, end).toString('utf8'));
  buffered = buffered.subarray(end + 1);
  return result;
}
function request(method: string, path: string): unknown {
  const id = ++sequence;
  send({ kind: 'request', id, method, path });
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const reply = receive();
    if (reply.id !== id || reply.error || typeof reply.chunk !== 'string') throw new Error(reply.error ?? 'Invalid configuration reply');
    const chunk = Buffer.from(reply.chunk, 'base64');
    size += chunk.length;
    if (size > budget) throw new Error('Configuration transfer byte limit exceeded');
    chunks.push(chunk);
    if (!reply.more) break;
    send({ kind: 'next', id });
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}
// JSONC metadata only. The installed compiler alone performs options/inheritance
// and file selection. Quoted strings are preserved when removing comments/commas.
function metadata(text: string): Record<string, unknown> {
  const clean = text.replace(/^\uFEFF/, '').replace(/("(?:[^"\\]|\\.)*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (match, string: string | undefined) => string ?? match.replace(/[^\r\n]/g, ' '));
  return JSON.parse(clean.replace(/("(?:[^"\\]|\\.)*")|,\s*(?=[}\]])/g, (_match, string: string | undefined) => string ?? ''));
}
const configurations = new Map<string, Record<string, unknown>>();
const api = new API({ cwd: root, fs: {
  readFile: path => {
    const text = request('readFile', path) as string | null;
    if (path.endsWith('.json') && basename(path) !== 'package.json') {
      if (text === null) throw new Error(`Missing influencing configuration: ${path}`);
      configurations.set(path, metadata(text));
    }
    return text;
  },
  fileExists: path => request('fileExists', path) as boolean,
  directoryExists: path => request('directoryExists', path) as boolean,
  getAccessibleEntries: path => request('readDirectory', path) as { files: string[]; directories: string[] },
  realpath: path => request('realPath', path) as string,
} });
try {
  const parsed = api.parseConfigFile(config);
  const raw = configurations.get(config);
  if (!raw) throw new Error('Compiler did not read the requested configuration');
  const references = Array.isArray(raw.references) ? raw.references.map(ref => {
    if (!ref || typeof ref.path !== 'string') throw new Error('Invalid referenced configuration');
    return ref.path as string;
  }) : [];
  const result: ConfigurationData = {
    options: parsed.options, files: parsed.fileNames, references,
    exclusions: [...configurations].flatMap(([path, doc]) => Array.isArray(doc.exclude)
      ? [{ directory: dirname(path), patterns: doc.exclude.filter((value): value is string => typeof value === 'string') }] : []),
  };
  api.close();
  const bytes = Buffer.from(JSON.stringify(result));
  if (bytes.length > budget) throw new Error('Configuration result byte limit exceeded');
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    const id = ++sequence;
    send({ kind: 'result', id, chunk: bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64'), more: offset + CHUNK_BYTES < bytes.length });
    if (receive().id !== id) throw new Error('Invalid configuration result acknowledgement');
  }
} finally { api.close(); }
