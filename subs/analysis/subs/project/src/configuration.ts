import { createHash } from 'node:crypto';
import type { CapturedInput, RetainedConfiguration } from './interfaces/project.js';
import { freeze } from './data.js';
import { spawn } from 'node:child_process';
import { basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Capture } from './capture.js';
import { AcquisitionError, Cancelled, byteOrder, within } from './data.js';
import { FRAME_BYTES, CHUNK_BYTES } from './configuration-data.js';
import type { ConfigurationData } from './configuration-data.js';

/** A helper run's product and the filesystem requests it made, each `[method, path]` as JSON, sorted and unique. */
export interface ConfigurationRead {
  readonly data: ConfigurationData;
  readonly requests: readonly string[];
}
/**
 * Configuration-only supervised process. One callback operation is in flight.
 * A capture that finished its acquisition answers from its recorded
 * observations, so `control` supplies the deadline and signal of the operation
 * that reads the configuration again.
 */
export async function readConfiguration(capture: Capture, config: string,
  control: { readonly deadline?: number; readonly signal?: AbortSignal } = {}): Promise<ConfigurationRead> {
  capture.check();
  if (control.signal?.aborted) throw new Cancelled();
  const requests = new Set<string>();
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
    Math.max(1, (control.deadline ?? capture.deadline) - performance.now()));
  for (const signal of [capture.signal, control.signal]) {
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
  }
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
    requests.add(JSON.stringify([frame.method, frame.path]));
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
    return { data: JSON.parse(Buffer.concat(resultChunks, resultSize).toString('utf8')) as ConfigurationData,
      requests: [...requests].sort(byteOrder) };
  } finally {
    terminal = true; clearTimeout(timer); clearTimeout(escalation);
    capture.signal?.removeEventListener('abort', abort);
    control.signal?.removeEventListener('abort', abort);
    kill('SIGKILL');
    child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
    pending = undefined; resultChunks.length = 0;
  }
}

/** A rejected recipe must be retried with an empty capture: obsolete dependencies
 * must never leak into the next batch-compatible input identity. */
export class ConfigurationChanged extends Error {}

/** What a retained configuration records; `RetainedConfiguration.product` is opaque outside this owner. */
interface ConfigurationProduct {
  readonly root: string;
  readonly config: string;
  readonly data: ConfigurationData;
  readonly observations: ReturnType<Capture['observations']>;
  readonly requests: readonly string[];
  /** The selection projection over the inventory the product was last acquired or read again with. */
  readonly selection?: string;
}
const configurationKey = (root: string, config: string, dependencies: RetainedConfiguration['dependencies']): string => createHash('sha256')
  .update(JSON.stringify([root, config, dependencies.map(({ path, role, sha256 }) => [path, role, sha256])])).digest('hex');
/** The refusal of a configuration that selects no file and only references others. */
export const solutionStyle = (config: string, data: ConfigurationData): AcquisitionError | null => data.references.length && !data.files.length
  ? new AcquisitionError('references-only-configuration', config,
    `Solution-style configurations are unavailable; referenced configurations: ${data.references.join(', ')}`)
  : null;

export async function acquireConfiguration(capture: Capture, config: string, previous?: RetainedConfiguration | null): Promise<{
  data: ConfigurationData; retained: RetainedConfiguration; reused: boolean;
}> {
  const key = (dependencies: RetainedConfiguration['dependencies']): string => configurationKey(capture.root, config, dependencies);
  if (previous?.key && previous.product.root === capture.root && previous.product.config === config) {
    await capture.replay(previous.product.observations as ReturnType<Capture['observations']>);
    const fresh = new Map(capture.inputs.map(input => [input.path, input]));
    const dependencies = previous.dependencies.map(input => fresh.get(input.path));
    if (dependencies.every((input, i) => input && input.role === previous.dependencies[i]!.role
      && input.sha256 === previous.dependencies[i]!.sha256) && key(previous.dependencies) === previous.key) {
      return { data: previous.product.data as unknown as ConfigurationData, retained: previous, reused: true };
    }
    throw new ConfigurationChanged();
  }
  const { data, requests } = await readConfiguration(capture, config);
  const dependencies = capture.inputs.filter(input => input.role === 'configuration' || input.role === 'directory'
    || input.role === 'absent' || input.role === 'dependency' && input.bytes > 0);
  const product: ConfigurationProduct = { root: capture.root, config, data, observations: capture.observations(), requests };
  return { data, reused: false, retained: freeze({ key: key(dependencies), dependencies,
    bytes: Buffer.byteLength(JSON.stringify(product)), product: product as unknown as RetainedConfiguration['product'] }) };
}

/**
 * The selection projection: every configuration field acquisition reads, as
 * the inventory reads it. The inventory reads the selected files beneath the
 * root that it does not own, each `exclude` list with its directory, and the
 * `outDir` and `declarationDir` options; acquisition and resolution read the
 * references. No other field reaches the inventory. Owned files are left out
 * because selecting one changes neither the outside-module files nor an
 * independent scope, so a created or deleted owned file leaves it equal.
 * `owned` holds root-relative inventory paths.
 */
export function selectionProjection(root: string, data: ConfigurationData, owned: ReadonlySet<string>): string {
  const selected = [...new Set(data.files.filter(path => within(root, path)).map(path => relative(root, path)))]
    .filter(path => !owned.has(path)).sort(byteOrder);
  const { outDir, declarationDir } = data.options;
  return JSON.stringify([selected, data.references, data.exclusions, outDir ?? null, declarationDir ?? null]);
}

export type ConfigurationReread =
  | { readonly status: 'kept'; readonly data: ConfigurationData; readonly retained: RetainedConfiguration }
  | { readonly status: 'changed'; readonly reason: 'product' | 'projection' | 'requests' | 'dependencies' };

/**
 * Read the configuration of a retained acquisition again through the helper,
 * on the capture that holds it, after the edited configuration files named by
 * `refreshed` (input labels) were re-observed. A solution-style configuration is
 * refused. The acquisition is kept only when the selection projection over the
 * currently `owned` files equals the recorded one and the helper made exactly
 * the requests it made before, so the capture holds the queries a fresh
 * acquisition makes. The retained configuration then carries the new data,
 * projection and refreshed files' identities, so a later acquisition can reuse
 * it. Anything else is `changed`: the caller acquires again.
 */
export async function rereadConfiguration(capture: Capture, previous: RetainedConfiguration, owned: ReadonlySet<string>, refreshed: readonly string[],
  control: { readonly deadline?: number; readonly signal?: AbortSignal } = {}): Promise<ConfigurationReread> {
  const product = previous.product as unknown as ConfigurationProduct;
  const { data, requests } = await readConfiguration(capture, product.config, control);
  const refusal = solutionStyle(product.config, data);
  if (refusal) throw refusal;
  if (product.root !== capture.root || !Array.isArray(product.requests) || product.selection === undefined) return { status: 'changed', reason: 'product' };
  const selection = selectionProjection(product.root, data, owned);
  if (selection !== product.selection) return { status: 'changed', reason: 'projection' };
  if (JSON.stringify(requests) !== JSON.stringify(product.requests)) return { status: 'changed', reason: 'requests' };
  const current = new Map(capture.inputs.map(input => [input.path, input]));
  const names = new Set(refreshed);
  const dependencies = previous.dependencies.map(input => {
    if (!names.delete(input.path)) return input;
    const now = current.get(input.path);
    return now?.role === input.role ? now : undefined;
  });
  if (names.size || dependencies.some(input => !input)) return { status: 'changed', reason: 'dependencies' };
  const next = { ...previous.product, data, selection } as RetainedConfiguration['product'];
  return { status: 'kept', data, retained: freeze({ key: configurationKey(product.root, product.config, dependencies as CapturedInput[]),
    dependencies: dependencies as CapturedInput[], bytes: Buffer.byteLength(JSON.stringify(next)), product: next }) };
}
