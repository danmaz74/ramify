import { readSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { API } from 'typescript/unstable/sync';
import { buildCatalog } from './catalog.js';
import { createDescriptionSet } from './descriptions.js';
import { AccessInterpretation } from './accesses.js';
import { behaviorRuns, classifyDependencyBehavior } from './behavior-classifier.js';
import type { AccessInterpreter, CatalogExport, SourceAccess, SourceCatalog } from './interfaces/source.js';
import { referencesOnly, syntheticCandidate, syntheticInputs } from './synthetic.js';
import { CHUNK_BYTES, FRAME_BYTES, READ_RESPONSE_BYTES, RESULT_BYTES, SourceFailure, decodeChunk, encode } from './wire.js';
import type { HelperInputs, Operation } from './wire.js';

// Only this finite helper blocks on synchronous pipe and native compiler calls.
// The calling process owns all captured bytes, cancellation and deadlines.
const sleeper = new Int32Array(new SharedArrayBuffer(4));
// receive() is synchronous; retrying an empty pipe needs no new allocation.
const readBuffer = Buffer.alloc(64 * 1024);
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
    try {
      const size = readSync(0, readBuffer, 0, readBuffer.length, null);
      if (!size) throw new SourceFailure('read-failure', 'Source parent closed input');
      if (buffered.length + size > FRAME_BYTES) throw new SourceFailure('resource-limit', 'Source reply frame exceeds 1 MiB');
      buffered = Buffer.concat([buffered, readBuffer.subarray(0, size)]);
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

/** Every result reports this helper's classifier runs, so a lifetime that never classified shows zero. */
function result(operation: Operation, value: unknown, budget = RESULT_BYTES): void {
  const bytes = encode(value, Math.min(budget, RESULT_BYTES));
  for (let offset = 0; offset < bytes.length; offset += CHUNK_BYTES) {
    const id = ++sequence;
    send({ kind: 'result', operation, id, chunk: bytes.subarray(offset, offset + CHUNK_BYTES).toString('base64'),
      more: offset + CHUNK_BYTES < bytes.length, behaviorRuns: behaviorRuns() });
    if (receive().id !== id) throw new SourceFailure('protocol-error', 'Unexpected source result acknowledgement');
  }
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
    const { configuration: configPath, witness: witnessPath } = syntheticCandidate(configuration, candidate);
    if (request('absent', configPath) && request('absent', witnessPath)) {
      synthetic = configPath; resourceWitness = witnessPath; break;
    }
  }
  if (!synthetic || !resourceWitness) throw new SourceFailure('resource-limit', 'No unoccupied synthetic compiler input paths were available');

  const generated = syntheticInputs(inputs.inventory, configuration, parsed.fileNames, resourceWitness);
  virtual.set(synthetic, generated.configuration);
  virtual.set(resourceWitness, generated.witness);
  request('derived', synthetic, generated.configurationBytes);
  request('derived', resourceWitness, generated.witnessBytes);
  snapshot = api.updateSnapshot({ openProjects: [synthetic] });
  const project = snapshot.getProject(synthetic);
  if (!project) throw new SourceFailure('unavailable', 'The compiler could not create the selected project');
  let catalog: SourceCatalog | undefined;
  // Private export-path facts stay with this compiler/catalog lifetime. They
  // neither change original identities nor extend the public catalog contract.
  const runtime = new Map<CatalogExport, boolean>();
  const host = { fileExists, readFile, resourceWitness };
  const currentCatalog = (): SourceCatalog => catalog ??= buildCatalog(project, inputs, host, runtime);
  let interpreter: AccessInterpretation | undefined;
  const currentInterpreter = (): AccessInterpretation => interpreter ??= new AccessInterpretation(
    project, inputs, host, currentCatalog(), runtime);
  // The last whole-project accesses, which an explicit behavior request classifies.
  let collected: Pick<ReturnType<AccessInterpretation['interpret']>, 'accesses' | 'coverage'> | undefined;
  const collectAccesses = () => {
    const current = currentInterpreter();
    const { accesses, coverage } = current.interpret(current.ordered);
    return collected = { accesses, coverage };
  };
  result('ready', null);
  for (;;) {
    const command = receive();
    if (command.kind !== 'command') throw new SourceFailure('protocol-error', 'Expected source operation command');
    if (command.command === 'catalog') {
      result('catalog', currentCatalog());
    } else if (command.command === 'describe') {
      const data = request('describe-inputs', root) as { files: string[] };
      // Descriptions own their own export-path facts within this lifetime.
      result('describe', createDescriptionSet().describe(project, inputs, host, new Map<CatalogExport, boolean>(), data.files).descriptions);
    } else if (command.command === 'accesses') {
      result('accesses', collectAccesses());
    } else if (command.command === 'behavior' && command.supplied === true) {
      // Supplied accesses are classified without the catalog or interpretation;
      // the parent serves them as this command's inputs.
      const data = request('behavior-inputs', root) as { accesses: SourceAccess[]; maxFactBytes: number } | null;
      if (!data || !Array.isArray(data.accesses) || !Number.isSafeInteger(data.maxFactBytes) || data.maxFactBytes <= 0) {
        throw new SourceFailure('protocol-error', 'Invalid supplied behavior inputs');
      }
      result('behavior', classifyDependencyBehavior(project, inputs, data.accesses), data.maxFactBytes);
    } else if (command.command === 'behavior') {
      result('behavior', classifyDependencyBehavior(project, inputs, (collected ?? collectAccesses()).accesses));
    } else if (command.command === 'interpreter') {
      currentInterpreter(); result('interpreter', null);
    } else if (command.command === 'interpret') {
      const data = request('interpret-inputs', root) as { files: string[]; replacements: {
        descriptions: Parameters<AccessInterpreter['replaceDescriptions']>[0]; removed: string[];
      }[] };
      const current = currentInterpreter();
      for (const replacement of data.replacements) current.replaceDescriptions(replacement.descriptions, replacement.removed);
      result('interpret', current.interpret(data.files));
    } else if (command.command === 'dispose') {
      interpreter?.dispose(); interpreter = undefined;
      snapshot.dispose(); snapshot = undefined;
      api.close(); api = undefined;
      virtual.clear(); runtime.clear(); catalog = undefined; collected = undefined;
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
