import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHUNK_BYTES, DISPOSAL_MS, FILE_BYTES, FRAME_BYTES, INPUT_BYTES, READ_RESPONSE_BYTES,
  RESULT_BYTES, SourceFailure, decodeChunk, encode, freezeData } from './wire.js';
import type { Operation } from './wire.js';
import type { SourceAnalysisInputs, SourceCatalog } from './interfaces/source.js';

interface PendingOperation {
  name: Operation;
  promise: Promise<unknown>;
  resolve(value: unknown): void;
  reject(error: unknown): void;
  timer: ReturnType<typeof setTimeout>;
  signal?: AbortSignal;
  abort?: () => void;
  chunks: Buffer[];
  size: number;
}

/** Parent-served filesystem calls, with one outstanding command and callback. */
export class CompilerBridge {
  #inputs: SourceAnalysisInputs | undefined;
  #child: ChildProcessWithoutNullStreams;
  #closed: Promise<void>;
  #ready: Promise<unknown>;
  #operation: PendingOperation | undefined;
  #disposePromise: Promise<void> | undefined;
  #terminal = false;
  #failure: unknown;
  #buffer = Buffer.alloc(0);
  #busy = false;
  #lastId = 0;
  #pending: { id: number; bytes: Buffer; offset: number } | undefined;
  #stderr = '';
  #derivedBytes = 0;
  #derivedCount = 0;
  #capturedBytes = 0;
  #readPaths = new Set<string>();
  #lifetime: AbortSignal | undefined;
  #abortLifetime = () => this.#fail(new SourceFailure('cancelled', 'Source analysis lifetime was cancelled'));

  constructor(inputs: SourceAnalysisInputs) {
    this.#inputs = inputs;
    // ProjectInputView.inputs computes content identities. Read it at stage
    // boundaries, never for every compiler callback (which would rehash the
    // complete captured dependency set quadratically).
    for (const input of inputs.view.inputs) {
      this.#capturedBytes += input.bytes;
      if (input.bytes && !input.path.startsWith('external:')) this.#readPaths.add(resolve(inputs.inventory.scope.root, input.path));
    }
    const source = import.meta.url.endsWith('.ts');
    const helper = fileURLToPath(new URL(`./compiler-helper.${source ? 'ts' : 'js'}`, import.meta.url));
    this.#child = spawn(process.execPath, [...(source ? ['--import', import.meta.resolve('tsx')] : []), helper], {
      detached: true, stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.#closed = new Promise<void>(done => {
      this.#child.once('error', error => { this.#fail(error); done(); });
      this.#child.once('close', code => {
        if (!this.#terminal) {
          this.#fail(new SourceFailure('read-failure', `Source helper exited ${code}: ${this.#stderr}`));
        }
        done();
      });
    });
    this.#child.stdout.on('data', (bytes: Buffer) => this.#receive(bytes));
    this.#child.stderr.on('data', (bytes: Buffer) => { this.#stderr = (this.#stderr + bytes.toString('utf8')).slice(-8192); });
    this.#child.stdin.on('error', error => { if (!this.#terminal) this.#fail(error); });
    this.#ready = this.#begin('ready', inputs.limits.deadlineMs);
    this.#lifetime = inputs.signal;
    this.#lifetime?.addEventListener('abort', this.#abortLifetime, { once: true });
    if (this.#lifetime?.aborted) this.#abortLifetime();
  }

  ready(): Promise<unknown> { return this.#ready; }

  async catalog(signal?: AbortSignal): Promise<SourceCatalog> {
    if (this.#terminal) await this.#cleanup();
    this.#check();
    if (this.#operation) throw new SourceFailure('concurrent-operation', 'A source operation is already running');
    if (signal?.aborted) {
      const error = new SourceFailure('cancelled', 'Source catalog was cancelled before execution');
      this.#fail(error); await this.#cleanup(); throw error;
    }
    const result = this.#begin('catalog', this.#inputs!.limits.deadlineMs, signal);
    try { this.#write({ kind: 'command', command: 'catalog' }); }
    catch (error) { this.#fail(error); }
    try { return freezeData(await result as SourceCatalog); }
    catch (error) { await this.dispose(); throw error; }
  }

  dispose(): Promise<void> {
    if (this.#disposePromise) return this.#disposePromise;
    if (this.#terminal) return this.#cleanup();
    if (this.#operation) {
      this.#fail(new SourceFailure('disposed', 'Source analysis was disposed during an operation'));
      return this.#disposePromise!;
    }
    const result = this.#begin('dispose', DISPOSAL_MS - 500);
    this.#disposePromise = Promise.resolve().then(async () => {
      try { this.#write({ kind: 'command', command: 'dispose' }); await result; }
      catch (error) { if (!this.#terminal) this.#fail(error); }
      await this.#release();
    });
    return this.#disposePromise;
  }

  #check(): void {
    if (this.#terminal) throw this.#failure ?? new SourceFailure('disposed', 'Source analysis has been disposed');
  }

  #begin(name: Operation, milliseconds: number, signal?: AbortSignal): Promise<unknown> {
    let resolveResult!: (value: unknown) => void;
    let rejectResult!: (error: unknown) => void;
    const promise = new Promise<unknown>((resolve, reject) => { resolveResult = resolve; rejectResult = reject; });
    const timer = setTimeout(() => this.#fail(new SourceFailure('resource-limit', `Source ${name} deadline exceeded`)), Math.min(milliseconds, 90_000));
    const abort = signal ? () => this.#fail(new SourceFailure('cancelled', `Source ${name} was cancelled`)) : undefined;
    this.#operation = { name, promise, resolve: resolveResult, reject: rejectResult, timer, signal, abort, chunks: [], size: 0 };
    if (abort) signal!.addEventListener('abort', abort, { once: true });
    return promise;
  }

  #clearOperation(): PendingOperation | undefined {
    const operation = this.#operation;
    if (operation) {
      clearTimeout(operation.timer);
      if (operation.abort) operation.signal!.removeEventListener('abort', operation.abort);
      this.#operation = undefined;
    }
    return operation;
  }

  #kill(signal: NodeJS.Signals): void {
    if (!this.#child.pid) return;
    try { process.kill(-this.#child.pid, signal); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') this.#failure ??= error; }
  }

  #fail(error: unknown): void {
    if (this.#terminal) return;
    if (!(error instanceof SourceFailure)) {
      const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
      error = new SourceFailure(['resource-limit', 'changed-input', 'cancelled'].includes(code) ? code : 'read-failure',
        error instanceof Error ? error.message : String(error));
    }
    this.#terminal = true;
    this.#failure = error;
    const operation = this.#clearOperation();
    operation?.reject(error);
    operation?.chunks.splice(0);
    this.#kill('SIGTERM');
    void this.#cleanup().catch(() => { /* Report cleanup failure from explicit dispose. */ });
  }

  #cleanup(): Promise<void> {
    this.#disposePromise ??= this.#release();
    return this.#disposePromise;
  }

  async #release(): Promise<void> {
    this.#terminal = true;
    const escalation = setTimeout(() => this.#kill('SIGKILL'), 500);
    let deadline: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([this.#closed, new Promise<never>((_resolve, reject) => {
        deadline = setTimeout(() => reject(new SourceFailure('resource-limit', 'Source helper exceeded its disposal deadline')), DISPOSAL_MS);
      })]);
    } finally {
      clearTimeout(escalation); clearTimeout(deadline);
      this.#kill('SIGKILL');
      this.#child.stdin.destroy(); this.#child.stdout.destroy(); this.#child.stderr.destroy();
      this.#lifetime?.removeEventListener('abort', this.#abortLifetime);
      this.#lifetime = undefined; this.#inputs = undefined;
      this.#pending = undefined; this.#buffer = Buffer.alloc(0); this.#stderr = '';
      this.#readPaths.clear(); this.#capturedBytes = 0;
    }
  }

  #write(value: unknown): void {
    const bytes = encode(value, FRAME_BYTES - 1);
    this.#child.stdin.write(Buffer.concat([bytes, Buffer.from('\n')]));
  }

  #reply(): void {
    if (!this.#pending) throw new SourceFailure('protocol-error', 'Source response has no pending bytes');
    const { id, bytes, offset } = this.#pending;
    const end = Math.min(bytes.length, offset + CHUNK_BYTES);
    this.#write({ id, chunk: bytes.subarray(offset, end).toString('base64'), more: end < bytes.length });
    if (end === bytes.length) this.#pending = undefined;
    else this.#pending.offset = end;
  }

  #receive(bytes: Buffer): void {
    if (this.#terminal) return;
    if (this.#buffer.length + bytes.length > FRAME_BYTES) {
      this.#fail(new SourceFailure('resource-limit', 'Source frame byte limit exceeded')); return;
    }
    this.#buffer = Buffer.concat([this.#buffer, bytes]);
    const end = this.#buffer.indexOf(10);
    if (end < 0) return;
    if (this.#busy || this.#buffer.indexOf(10, end + 1) >= 0) {
      this.#fail(new SourceFailure('protocol-error', 'Concurrent source helper frames')); return;
    }
    const line = this.#buffer.subarray(0, end).toString('utf8');
    this.#buffer = this.#buffer.subarray(end + 1);
    this.#busy = true;
    void (async () => {
      try { await this.#message(JSON.parse(line) as Record<string, unknown>); }
      catch (error) { this.#fail(error); }
      finally { this.#busy = false; }
    })();
  }

  async #message(frame: Record<string, unknown>): Promise<void> {
    this.#check();
    if (!frame || typeof frame !== 'object' || Array.isArray(frame)) throw new SourceFailure('protocol-error', 'Invalid source frame');
    if (frame.kind === 'next') {
      if (!this.#pending || this.#pending.id !== frame.id) throw new SourceFailure('protocol-error', 'Unexpected source continuation');
      this.#reply(); return;
    }
    if (!Number.isSafeInteger(frame.id) || frame.id !== this.#lastId + 1 || this.#pending || !this.#operation) {
      throw new SourceFailure('protocol-error', 'Invalid source request sequence');
    }
    this.#lastId = frame.id as number;
    if (frame.kind === 'failure') {
      if (typeof frame.code !== 'string' || typeof frame.message !== 'string') throw new SourceFailure('protocol-error', 'Invalid source failure');
      throw new SourceFailure(frame.code, frame.message);
    }
    if (frame.kind === 'result') {
      const operation = this.#operation;
      if (frame.operation !== operation.name || typeof frame.more !== 'boolean') throw new SourceFailure('protocol-error', 'Unexpected source result');
      if (!operation.size) this.#capturedBytes = this.#inputs!.view.inputs.reduce((total, input) => total + input.bytes, 0);
      const bytes = decodeChunk(frame.chunk);
      if (operation.size + bytes.length > RESULT_BYTES) throw new SourceFailure('resource-limit', 'Source result byte limit exceeded');
      operation.size += bytes.length; operation.chunks.push(bytes);
      this.#admitInFlight(operation.size * 3);
      if (frame.more) { this.#write({ id: frame.id }); return; }
      const value: unknown = JSON.parse(Buffer.concat(operation.chunks, operation.size).toString('utf8'));
      this.#write({ id: frame.id });
      this.#clearOperation();
      operation.chunks.length = 0;
      // dispose completes before the helper exits, so no late result is accepted.
      if (operation.name === 'dispose') this.#terminal = true;
      operation.resolve(value); return;
    }
    if (frame.kind !== 'request' || typeof frame.method !== 'string' || typeof frame.path !== 'string' || this.#operation.chunks.length) {
      throw new SourceFailure('protocol-error', 'Invalid source filesystem request');
    }
    const value = await this.#read(frame.method, frame.path, frame.data);
    if (this.#terminal) return;
    const bytes = encode(value, frame.method === 'readFile' ? READ_RESPONSE_BYTES : RESULT_BYTES);
    this.#admitInFlight(bytes.length * 4);
    this.#pending = { id: frame.id as number, bytes, offset: 0 }; this.#reply();
  }

  #admitInFlight(bytes: number): void {
    if (this.#capturedBytes + this.#derivedBytes * 4 + bytes > INPUT_BYTES) throw new SourceFailure('resource-limit', 'Captured and in-flight source bytes exceed 256 MiB');
  }

  async #read(method: string, requestedPath: string, data: unknown): Promise<unknown> {
    const inputs = this.#inputs!;
    const view = inputs.view;
    const path = resolve(inputs.inventory.scope.root, requestedPath);
    switch (method) {
      case 'derived': {
        if (!Number.isSafeInteger(data) || (data as number) < 0 || (data as number) > FILE_BYTES || ++this.#derivedCount > 2) {
          throw new SourceFailure('resource-limit', 'Invalid derived compiler input size');
        }
        this.#derivedBytes += data as number;
        this.#admitInFlight(0);
        return null;
      }
      case 'inputs': return { inventory: inputs.inventory, areas: inputs.areas, limits: inputs.limits };
      case 'readFile': {
        const text = await view.readFile(path) ?? null;
        if (this.#terminal) return null;
        if (text !== null) {
          const bytes = Buffer.byteLength(text);
          if (bytes > FILE_BYTES) throw new SourceFailure('resource-limit', 'Source read exceeds 8 MiB');
          const canonical = await view.realPath(path) ?? path;
          if (!this.#readPaths.has(canonical)) {
            this.#readPaths.add(canonical); this.#capturedBytes += bytes;
          }
          this.#admitInFlight(bytes * 4);
        }
        return text;
      }
      case 'fileExists': return view.fileExists(path);
      case 'directoryExists': return view.directoryExists(path);
      case 'realPath': return await view.realPath(path) ?? path;
      case 'absent': return !(await view.readDirectory(dirname(path))).some(entry => basename(entry) === basename(path));
      case 'readDirectory': {
        const files: string[] = [], directories: string[] = [];
        for (const entry of await view.readDirectory(path)) {
          if (this.#terminal) return null;
          if (await view.fileExists(entry)) files.push(basename(entry));
          else if (await view.directoryExists(entry)) directories.push(basename(entry));
        }
        return { files, directories };
      }
      default: throw new SourceFailure('protocol-error', `Unknown source filesystem method ${method}`);
    }
  }
}
