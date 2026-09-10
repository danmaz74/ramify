import assert from 'node:assert/strict';
import { readSync, writeSync } from 'node:fs';
import { resolve } from 'node:path';
import { StringDecoder } from 'node:string_decoder';
import { API } from 'typescript/unstable/sync';

// A probe-only single-flight protocol. Only this code reads stdin; stdout
// contains framed requests/results, never application or compiler log text.
const root = process.argv[2];
const mode = process.argv[3];
assert.ok(root && (mode === 'normal' || mode === 'stall'));
let sequence = 0;
let buffered = '';
const waitCell = new Int32Array(new SharedArrayBuffer(4));
const decoder = new StringDecoder('utf8');

function send(value: unknown): void {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  let offset = 0;
  while (offset < bytes.length) {
    try { offset += writeSync(1, bytes, offset, bytes.length - offset); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      Atomics.wait(waitCell, 0, 0, 1);
    }
  }
}

function request(method: string, path: string): unknown {
  const id = ++sequence;
  const stall = mode === 'stall' && method === 'readFile' && path.endsWith('/src/originals.ts');
  send({ kind: 'request', id, method, path, stall });
  while (!buffered.includes('\n')) {
    const bytes = Buffer.alloc(64 * 1024);
    try {
      const size = readSync(0, bytes, 0, bytes.length, null);
      assert.ok(size > 0, 'parent input closed');
      buffered += decoder.write(bytes.subarray(0, size));
      assert.ok(Buffer.byteLength(buffered) <= 8 * 1024 * 1024, 'bounded probe reply');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EAGAIN') throw error;
      Atomics.wait(waitCell, 0, 0, 1);
    }
  }
  const end = buffered.indexOf('\n');
  const reply = JSON.parse(buffered.slice(0, end)) as { id: number; result: unknown };
  buffered = buffered.slice(end + 1);
  assert.equal(reply.id, id);
  return reply.result;
}

const api = new API({
  cwd: root,
  fs: {
    readFile: path => request('readFile', path) as string | null,
    fileExists: path => request('fileExists', path) as boolean,
    directoryExists: path => request('directoryExists', path) as boolean,
    getAccessibleEntries: path => request('readDirectory', path) as { files: string[]; directories: string[] },
    realpath: path => request('realPath', path) as string,
  },
});
let snapshot: ReturnType<API['updateSnapshot']> | undefined;
try {
  const parsed = api.parseConfigFile(resolve(root, 'tsconfig.json'));
  assert.equal(parsed.fileNames.length, 5);
  snapshot = api.updateSnapshot({ openProjects: [resolve(root, 'tsconfig.json')] });
  const project = snapshot.getProject(resolve(root, 'tsconfig.json'));
  assert.ok(project);
  const source = project.program.getSourceFile(resolve(root, 'src/interfaces/public.ts'));
  assert.ok(source);
  const module = project.checker.getSymbolAtLocation(source);
  assert.ok(module);
  const names = project.checker.getExportsOfModule(module).map(symbol => symbol.name).sort();
  assert.deepEqual(names, ['Contract', 'default', 'ownAlias', 'ownValue', 'unselectedExport']);
  snapshot.dispose();
  api.close();
  send({ kind: 'result', selectedFiles: parsed.fileNames.length, exportNames: names, snapshotDisposed: snapshot.isDisposed() });
} finally {
  if (snapshot && !snapshot.isDisposed()) snapshot.dispose();
  api.close();
}
