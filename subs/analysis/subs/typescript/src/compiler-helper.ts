import { readSync, writeSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { buildCatalog } from './catalog.js';
import { collectAccesses } from './accesses.js';
import type { CatalogExport, SourceCatalog } from './interfaces/source.js';
import { CHUNK_BYTES, FILE_BYTES, FRAME_BYTES, READ_RESPONSE_BYTES, RESULT_BYTES, SourceFailure, decodeChunk, encode } from './wire.js';
import type { HelperInputs, Operation } from './wire.js';

// Only this finite helper blocks on synchronous pipe and native compiler calls.
// The calling process owns all captured bytes, cancellation and deadlines.
const sleeper = new Int32Array(new SharedArrayBuffer(4));
let buffered = Buffer.alloc(0);
let sequence = 0;

function send(value: unknown): void {
  const bytes = Buffer.concat([encode(value, FRAME_BYTES - 1), Buffer.from('\n')]);
  let offset = 0;
  while (offset < bytes.length) {
    try { offset += writeSync(1, bytes, offset, bytes.length - offset); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      Atomics.wait(sleeper, 0, 0, 1);
    }
  }
}

function receive(): Record<string, unknown> {
  while (buffered.indexOf(10) < 0) {
    const bytes = Buffer.alloc(64 * 1024);
    try {
      const size = readSync(0, bytes, 0, bytes.length, null);
      if (!size) throw new SourceFailure('read-failure', 'Source parent closed input');
      if (buffered.length + size > FRAME_BYTES) throw new SourceFailure('resource-limit', 'Source reply frame exceeds 1 MiB');
      buffered = Buffer.concat([buffered, bytes.subarray(0, size)]);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      Atomics.wait(sleeper, 0, 0, 1);
    }
  }
  const end = buffered.indexOf(10);
  const result: unknown = JSON.parse(buffered.subarray(0, end).toString('utf8'));
  buffered = buffered.subarray(end + 1);
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new SourceFailure('protocol-error', 'Invalid source reply');
  return result as Record<string, unknown>;
}

function request(method: string, path: string, data?: unknown): unknown {
  const id = ++sequence;
  send({ kind: 'request', id, method, path, data });
  const chunks: Buffer[] = [];
  let size = 0;
  for (;;) {
    const reply = receive();
    if (reply.id !== id || typeof reply.more !== 'boolean') throw new SourceFailure('protocol-error', 'Unexpected source reply sequence');
    const chunk = decodeChunk(reply.chunk);
    if (size + chunk.length > (method === 'readFile' ? READ_RESPONSE_BYTES : RESULT_BYTES)) {
      throw new SourceFailure('resource-limit', 'Source response byte limit exceeded');
    }
    size += chunk.length; chunks.push(chunk);
    if (!reply.more) break;
    send({ kind: 'next', id });
  }
  return JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
}

function result(operation: Operation, value: unknown): void {
  const bytes = encode(value, RESULT_BYTES);
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    const id = ++sequence;
    send({ kind: 'result', operation, id, chunk: bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64'), more: offset + CHUNK_BYTES < bytes.length });
    if (receive().id !== id) throw new SourceFailure('protocol-error', 'Unexpected source result acknowledgement');
  }
}

// Inspect only solution-style metadata. The compiler owns option/configuration
// inheritance and file selection; this never interprets compiler settings.
function referencesOnly(text: string, selectedFiles: readonly string[]): boolean {
  const clean = text.replace(/^\uFEFF/, '').replace(/("(?:[^"\\]|\\.)*")|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g,
    (match, string: string | undefined) => string ?? match.replace(/[^\r\n]/g, ' '));
  let metadata: Record<string, unknown>;
  try { metadata = JSON.parse(clean.replace(/("(?:[^"\\]|\\.)*")|,\s*(?=[}\]])/g, (_match, string: string | undefined) => string ?? '')); }
  catch { throw new SourceFailure('unavailable', 'The selected compiler configuration could not be parsed'); }
  return !!(Array.isArray(metadata.references) && metadata.references.length && !selectedFiles.length);
}

let api: API | undefined;
let snapshot: ReturnType<API['updateSnapshot']> | undefined;
try {
  const inputs = request('inputs', '') as HelperInputs;
  const root = inputs.inventory.scope.root;
  const configuration = inputs.inventory.scope.configuration;
  const virtual = new Map<string, string>();
  const fileExists = (path: string): boolean => virtual.has(resolve(path)) || request('fileExists', path) as boolean;
  const readFile = (path: string): string | null => virtual.get(resolve(path)) ?? request('readFile', path) as string | null;
  api = new API({ cwd: root, fs: {
    readFile,
    fileExists,
    directoryExists: path => request('directoryExists', path) as boolean,
    getAccessibleEntries: path => request('readDirectory', path) as { files: string[]; directories: string[] },
    realpath: path => virtual.has(resolve(path)) ? resolve(path) : request('realPath', path) as string,
  } });
  const parsed = api.parseConfigFile(configuration);
  const configurationText = readFile(configuration);
  if (configurationText === null) throw new SourceFailure('unavailable', 'The selected compiler configuration is missing');
  if (referencesOnly(configurationText, parsed.fileNames)) throw new SourceFailure('unavailable', 'Solution-style compiler configurations are unavailable');

  let synthetic: string | undefined;
  let resourceWitness: string | undefined;
  for (let candidate = 0; candidate < 1000; candidate++) {
    const configPath = resolve(dirname(configuration), `.ramify-source-inputs-${candidate}.json`);
    const witnessPath = resolve(dirname(configuration), `.ramify-source-inputs-${candidate}.ts`);
    if (request('absent', configPath) && request('absent', witnessPath)) {
      synthetic = configPath; resourceWitness = witnessPath; break;
    }
  }
  if (!synthetic || !resourceWitness) throw new SourceFailure('resource-limit', 'No unoccupied synthetic compiler input paths were available');

  const roots = new Set(parsed.fileNames);
  for (const file of inputs.inventory.files) if (file.kind === 'source') roots.add(resolve(root, file.path));
  roots.add(resourceWitness);
  const configurationBytes = encode({ extends: configuration, files: [...roots].sort(), include: [], exclude: [] }, FILE_BYTES);
  const imports: string[] = [];
  let witnessBytes = 0;
  for (const file of inputs.inventory.files) {
    if (file.kind !== 'resource') continue;
    let specifier = relative(dirname(resourceWitness), resolve(root, file.path));
    if (!specifier.startsWith('.')) specifier = `./${specifier}`;
    const statement = `import * as ramifyResource${imports.length} from ${JSON.stringify(specifier)};\n`;
    if (witnessBytes + Buffer.byteLength(statement) > FILE_BYTES) throw new SourceFailure('resource-limit', 'Resource witness exceeds the source file byte limit');
    witnessBytes += Buffer.byteLength(statement); imports.push(statement);
  }
  // A module marker also keeps an empty witness independent of shared globals.
  if (witnessBytes + 11 > FILE_BYTES) throw new SourceFailure('resource-limit', 'Resource witness exceeds the source file byte limit');
  virtual.set(synthetic, configurationBytes.toString('utf8'));
  virtual.set(resourceWitness, `${imports.join('')}export {};\n`);
  request('derived', synthetic, configurationBytes.length);
  request('derived', resourceWitness, witnessBytes + 11);
  snapshot = api.updateSnapshot({ openProjects: [synthetic] });
  const project = snapshot.getProject(synthetic);
  if (!project) throw new SourceFailure('unavailable', 'The compiler could not create the selected project');
  let catalog: SourceCatalog | undefined;
  // Private export-path facts stay with this compiler/catalog lifetime. They
  // neither change original identities nor extend the public catalog contract.
  const runtime = new Map<CatalogExport, boolean>();
  const currentCatalog = (): SourceCatalog => catalog ??= buildCatalog(project, inputs, { fileExists, readFile, resourceWitness }, runtime);
  result('ready', null);
  for (;;) {
    const command = receive();
    if (command.kind !== 'command') throw new SourceFailure('protocol-error', 'Expected source operation command');
    if (command.command === 'catalog') {
      result('catalog', currentCatalog());
    } else if (command.command === 'accesses') {
      result('accesses', collectAccesses(project, inputs, { fileExists, readFile, resourceWitness }, currentCatalog(), runtime));
    } else if (command.command === 'dispose') {
      snapshot.dispose(); snapshot = undefined;
      api.close(); api = undefined;
      virtual.clear(); runtime.clear(); catalog = undefined;
      result('dispose', null); break;
    } else throw new SourceFailure('unavailable', `Source capability ${String(command.command)} is unavailable`);
  }
} catch (error) {
  send({ kind: 'failure', id: ++sequence, code: error instanceof SourceFailure ? error.code : 'read-failure',
    message: error instanceof Error ? error.message : String(error) });
} finally {
  if (snapshot && !snapshot.isDisposed()) snapshot.dispose();
  api?.close();
}
