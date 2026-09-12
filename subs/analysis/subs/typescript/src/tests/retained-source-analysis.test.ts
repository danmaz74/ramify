import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { ObservationSink } from '../../../project/src/interfaces/project.js';
import { createRetainedSourceAnalysis, retainedCompilerEvidence } from '../retained-source-analysis.js';
import { createSourceAnalysis } from '../source-analysis.js';
import type { RetainedSourceAnalysis, RetainedSourceInputs, SourceChangeSet } from '../interfaces/source.js';
import { acquire, areasFor, drop, fixture, put, sourceLimits } from './fixtures.js';
import { retainedMembershipWitness } from './retained-membership.js';

const roots: string[] = [];
const opened: RetainedSourceAnalysis[] = [];
afterEach(async () => {
  for (const analysis of opened.splice(0)) await analysis.dispose();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

interface Recorded {
  readonly shape: 'file' | 'directory' | 'absent' | 'probe';
  readonly path: string;
  readonly role?: string;
  readonly sha256?: string | null;
  readonly bytes?: number;
  readonly entries?: readonly string[];
  readonly operation?: string;
}
/** A sink of project's shape that keeps what it was told, in order. */
function recording(): { readonly sink: ObservationSink; readonly events: Recorded[] } {
  const events: Recorded[] = [];
  return { events, sink: {
    file: (path, sha256, bytes, role) => { events.push({ shape: 'file', path, sha256, bytes, role }); },
    directory: (path, entries) => { events.push({ shape: 'directory', path, entries }); },
    absent: path => { events.push({ shape: 'absent', path }); },
    probe: (path, operation) => { events.push({ shape: 'probe', path, operation }); },
  } };
}

async function start(files: Readonly<Record<string, string>>): Promise<string> {
  const root = await fixture(files);
  roots.push(root);
  return root;
}
async function inputsOf(root: string, sink: ObservationSink = recording().sink): Promise<RetainedSourceInputs> {
  const view = await acquire(root);
  return { root, configuration: join(root, 'tsconfig.json'), inventory: view.inventory, areas: areasFor(view), limits: sourceLimits, sink };
}
async function open(root: string, sink?: ObservationSink): Promise<RetainedSourceAnalysis> {
  const analysis = await createRetainedSourceAnalysis(await inputsOf(root, sink));
  opened.push(analysis);
  return analysis;
}
const none: SourceChangeSet = { changed: [], created: [], deleted: [], inventory: null, invalidateAll: false };
const owned = (inputs: RetainedSourceInputs): readonly string[] => inputs.inventory.files.map(file => file.path);

/** Everything an adapter says about its described state, as comparable JSON. */
async function state(analysis: RetainedSourceAnalysis): Promise<{ catalog: string; accesses: string }> {
  const catalog = analysis.catalog();
  const accesses = await analysis.interpreter().interpret(catalog.files.map(file => file.file));
  return { catalog: JSON.stringify(catalog), accesses: JSON.stringify(accesses) };
}
/** A second adapter opened cold over the same disk state, then disposed. */
async function fresh(root: string): Promise<{ catalog: string; accesses: string; descriptions: string }> {
  const inputs = await inputsOf(root);
  const analysis = await createRetainedSourceAnalysis(inputs);
  try {
    const { descriptions } = await analysis.describe(owned(inputs));
    return { ...await state(analysis), descriptions: JSON.stringify(descriptions) };
  } finally { await analysis.dispose(); }
}
async function equalsFresh(analysis: RetainedSourceAnalysis, root: string): Promise<void> {
  const compared = await fresh(root);
  expect(await state(analysis)).toEqual({ catalog: compared.catalog, accesses: compared.accesses });
}
async function batch(root: string): Promise<{ catalog: string; accesses: string }> {
  const view = await acquire(root);
  const analysis = await createSourceAnalysis({ view, inventory: view.inventory, areas: areasFor(view), limits: sourceLimits });
  try {
    return { catalog: JSON.stringify(await analysis.catalog()), accesses: JSON.stringify(await analysis.accesses()) };
  } finally { await analysis.dispose(); }
}
function alive(pid: number | undefined): boolean {
  if (pid === undefined) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ESRCH'; }
}
async function gone(pid: number | undefined): Promise<boolean> {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (!alive(pid)) return true;
    await new Promise<void>(done => setTimeout(done, 25));
  }
  return false;
}

const project = {
  'src/api.ts': 'export const value = 1;\nexport interface Shape { readonly value: number }\n',
  'src/consumer.ts': 'import { value, type Shape } from "./api.js";\nexport function inspect(shape: Shape): number {\n  return shape.value + value;\n}\n',
  'src/hub.ts': 'export * as api from "./api.js";\nexport { inspect } from "./consumer.js";\n',
  'src/style.css': '.value {}\n',
  'src/style.d.ts': 'declare module "*.css" { const styles: Record<string, string>; export default styles; }\n',
  'src/theme.ts': 'import styles from "./style.css";\nexport const theme = styles;\n',
};

describe('retained source analysis', () => {
  it('removes a configured source that existed at cold open from the synthetic roots', retainedMembershipWitness, 60_000);
  it('opens one warm compiler whose cold facts equal the finite helper and a fresh adapter', async () => {
    const root = await start(project);
    const inputs = await inputsOf(root);
    const analysis = await open(root);
    const evidence = retainedCompilerEvidence(analysis);
    expect([analysis.hot, evidence.liveSnapshots, alive(evidence.serverPid)]).toEqual([true, 1, true]);
    expect(() => analysis.catalog()).toThrow(expect.objectContaining({ code: 'unavailable' }));
    const { descriptions } = await analysis.describe([]);
    expect(descriptions.map(entry => entry.file)).toEqual([...owned(inputs)].sort());
    const cold = await state(analysis);
    expect({ ...cold, descriptions: JSON.stringify(descriptions) }).toEqual(await fresh(root));
    const helper = await batch(root);
    expect(cold.catalog).toBe(helper.catalog);
    expect(JSON.parse(cold.accesses).accesses).toEqual(JSON.parse(helper.accesses).accesses);
    expect(Object.isFrozen(analysis.catalog())).toBe(true);
  }, 60_000);

  it('keeps exactly one live snapshot across twenty body edits and equals a fresh adapter after each', async () => {
    const root = await start(project);
    const analysis = await open(root);
    await analysis.describe([]);
    const original = project['src/consumer.ts'];
    const sequences: number[] = [];
    for (let edit = 1; edit <= 20; edit++) {
      await put(root, 'src/consumer.ts', original.replace('  return', `  void ${edit};\n  return`));
      const update = await analysis.update({ ...none, changed: ['src/consumer.ts'] });
      sequences.push(update.snapshot);
      const evidence = retainedCompilerEvidence(analysis);
      expect([evidence.liveSnapshots, evidence.peakLiveSnapshots, evidence.previousDisposed]).toEqual([1, 2, true]);
      const { delta } = await analysis.describe(['src/consumer.ts']);
      // The moved declaration reaches its forwarding importer in the fixed point;
      // nothing changes by value.
      expect([delta.recomputed.includes('src/consumer.ts'), delta.changed, delta.moved.filter(file => file !== 'src/consumer.ts')])
        .toEqual([true, [], []]);
    }
    expect(sequences).toEqual(Array.from({ length: 20 }, (_, index) => index + 2));
    await equalsFresh(analysis, root);
  }, 90_000);

  it('records declaration moves with the positions a fresh adapter reports', async () => {
    const root = await start(project);
    const analysis = await open(root);
    await analysis.describe([]);
    await put(root, 'src/api.ts', `// A leading comment moves every declaration below it.\n${project['src/api.ts']}`);
    await analysis.update({ ...none, changed: ['src/api.ts'] });
    const { delta, descriptions } = await analysis.describe(['src/api.ts']);
    expect([delta.recomputed.includes('src/api.ts'), delta.changed, delta.moved]).toEqual([true, [], ['src/api.ts']]);
    const compared = await fresh(root);
    const freshApi = JSON.parse(compared.descriptions).find((entry: { file: string }) => entry.file === 'src/api.ts');
    expect(JSON.parse(JSON.stringify(descriptions[0]))).toEqual(freshApi);
    const value = descriptions.find(entry => entry.file === 'src/api.ts')!.originals.find(original => original.id.binding === 'value')!;
    expect(value.declarations[0]!.line).toBe(2);
  }, 60_000);

  it('follows a created and a deleted owned file through the regenerated configuration', async () => {
    const root = await start(project);
    const analysis = await open(root);
    await analysis.describe([]);
    await put(root, 'src/extra.ts', 'import { value } from "./api.js";\nexport const extra = value + 1;\n');
    const created = await inputsOf(root);
    expect(owned(created)).toContain('src/extra.ts');
    await analysis.update({ ...none, created: ['src/extra.ts'], inventory: created.inventory });
    let evidence = retainedCompilerEvidence(analysis);
    expect(evidence.syntheticConfiguration).toContain(resolve(root, 'src/extra.ts'));
    expect(evidence.programHas('src/extra.ts')).toBe(true);
    const { delta } = await analysis.describe(['src/extra.ts']);
    expect(delta.recomputed).toEqual(['src/extra.ts']);
    await equalsFresh(analysis, root);

    await drop(root, 'src/extra.ts');
    const deleted = await inputsOf(root);
    expect(owned(deleted)).not.toContain('src/extra.ts');
    await analysis.update({ ...none, deleted: ['src/extra.ts'], inventory: deleted.inventory });
    evidence = retainedCompilerEvidence(analysis);
    expect(evidence.syntheticConfiguration).not.toContain('extra.ts');
    expect(evidence.programHas('src/extra.ts')).toBe(false);
    const after = await analysis.describe(['src/extra.ts']);
    expect(after.delta.removedOriginals).toEqual([{ kind: 'code', owner: 'fixture', file: 'extra.ts', binding: 'extra' }]);
    expect(analysis.catalog().files.map(file => file.file)).not.toContain('src/extra.ts');
    await equalsFresh(analysis, root);
  }, 90_000);

  it('describes every owned file afresh after invalidateAll and equals the whole build', async () => {
    const root = await start(project);
    const inputs = await inputsOf(root);
    const analysis = await open(root);
    await analysis.describe([]);
    const cold = await state(analysis);
    await put(root, 'src/style.d.ts', 'declare module "*.css" { const styles: Record<string, string>; export default styles; export const names: string[]; }\n');
    await analysis.update({ ...none, changed: ['src/style.d.ts'], invalidateAll: true });
    const { delta } = await analysis.describe(['src/style.d.ts']);
    expect(delta.recomputed).toEqual([...owned(inputs)].sort());
    expect(delta.changed).toContain('src/style.css');
    const invalidated = await state(analysis);
    expect(invalidated.catalog).not.toBe(cold.catalog);
    expect(invalidated.catalog).toBe((await batch(root)).catalog);
  }, 60_000);

  it('reports every read, probe, listing and absence to the sink with the capture roles', async () => {
    const root = await start({ ...project, 'src/probe.ts': 'export type { Absent } from "./absent.js";\nexport const own = 1;\n' });
    const { sink, events } = recording();
    const analysis = await open(root, sink);
    await analysis.describe([]);
    await state(analysis);
    const reads = events.filter(event => event.shape === 'file');
    const configuration = reads.find(event => event.path === join(root, 'tsconfig.json'));
    expect(configuration?.role).toBe('configuration');
    for (const file of ['src/api.ts', 'src/consumer.ts', 'src/hub.ts', 'src/theme.ts', 'src/style.d.ts']) {
      const read = reads.find(event => event.path === join(root, file));
      expect(read, file).toMatchObject({ role: 'source', bytes: Buffer.byteLength(project[file as keyof typeof project]) });
      expect(read?.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
    // The root listing is the occupancy check of the synthetic names.
    const listing = events.find(event => event.shape === 'directory' && event.path === root);
    expect(listing?.entries).toContain(join(root, 'tsconfig.json'));
    expect(events.some(event => event.shape === 'probe' && event.path === join(root, 'src/style.css') && event.operation === 'fileExists')).toBe(true);
    expect(events.some(event => event.shape === 'probe' && event.path === join(root, 'src/absent.ts'))).toBe(true);
    expect(events.every(event => !event.path.includes('.ramify-source-inputs-'))).toBe(true);
    const before = events.length;
    await put(root, 'src/consumer.ts', project['src/consumer.ts'].replace('  return', '  void 0;\n  return'));
    await analysis.update({ ...none, changed: ['src/consumer.ts'] });
    await analysis.describe(['src/consumer.ts']);
    const reread = events.slice(before).find(event => event.shape === 'file' && event.path === join(root, 'src/consumer.ts'));
    expect(reread).toMatchObject({ role: 'source', bytes: Buffer.byteLength((await readFile(join(root, 'src/consumer.ts'))).toString()) });
  }, 60_000);

  it('rejects the next call with read-failure when the server is lost, then rebuilds on a later update', async () => {
    const root = await start(project);
    const analysis = await open(root);
    await analysis.describe([]);
    const pid = retainedCompilerEvidence(analysis).serverPid;
    expect(pid).toBeDefined();
    process.kill(pid!, 'SIGKILL');
    expect(await gone(pid)).toBe(true);
    await expect(analysis.update({ ...none, changed: ['src/consumer.ts'] })).rejects.toMatchObject({ code: 'read-failure' });
    expect(analysis.hot).toBe(false);
    await expect(analysis.describe(['src/consumer.ts'])).rejects.toMatchObject({ code: 'unavailable' });
    expect(() => analysis.interpreter()).toThrow(expect.objectContaining({ code: 'unavailable' }));
    const recovered = await analysis.update(none);
    expect([analysis.hot, recovered.snapshot]).toEqual([true, 2]);
    expect(retainedCompilerEvidence(analysis).serverPid).not.toBe(pid);
    const { delta } = await analysis.describe([]);
    expect(delta.recomputed).toHaveLength(6);
    await equalsFresh(analysis, root);
  }, 60_000);

  it('fails a call that races the loss instead of answering from the dead server', async () => {
    const root = await start(project);
    const analysis = await open(root);
    await analysis.describe([]);
    const pid = retainedCompilerEvidence(analysis).serverPid!;
    process.kill(pid, 'SIGKILL');
    // No turn of the event loop: the exit is not yet delivered when the request goes out.
    await expect(analysis.interpreter().interpret(['src/consumer.ts'])).rejects.toMatchObject({ code: 'read-failure' });
    expect(analysis.hot).toBe(false);
    expect(await gone(pid)).toBe(true);
  }, 60_000);

  it('releases the compiler while keeping facts, and rebuilds equal facts on the next update', async () => {
    const root = await start(project);
    const analysis = await open(root);
    await analysis.describe([]);
    const cold = await state(analysis);
    const pid = retainedCompilerEvidence(analysis).serverPid;
    await analysis.releaseCompiler();
    expect([analysis.hot, retainedCompilerEvidence(analysis).liveSnapshots, await gone(pid)]).toEqual([false, 0, true]);
    expect(JSON.stringify(analysis.catalog())).toBe(cold.catalog);
    await expect(analysis.describe(['src/consumer.ts'])).rejects.toMatchObject({ code: 'unavailable' });
    expect(() => analysis.interpreter()).toThrow(expect.objectContaining({ code: 'unavailable' }));
    await put(root, 'src/consumer.ts', project['src/consumer.ts'].replace('  return', '  void 0;\n  return'));
    await analysis.update({ ...none, changed: ['src/consumer.ts'] });
    expect([analysis.hot, alive(retainedCompilerEvidence(analysis).serverPid)]).toEqual([true, true]);
    const { delta } = await analysis.describe(['src/consumer.ts']);
    expect(delta.recomputed).toHaveLength(6);
    await equalsFresh(analysis, root);
  }, 60_000);

  it('disposes the server, the snapshot and the facts, and stays disposed', async () => {
    const root = await start(project);
    const analysis = await open(root);
    await analysis.describe([]);
    const pid = retainedCompilerEvidence(analysis).serverPid;
    await Promise.all([analysis.dispose(), analysis.dispose()]);
    expect([analysis.hot, retainedCompilerEvidence(analysis).liveSnapshots, await gone(pid)]).toEqual([false, 0, true]);
    await expect(analysis.update(none)).rejects.toMatchObject({ code: 'disposed' });
    expect(() => analysis.catalog()).toThrow(expect.objectContaining({ code: 'disposed' }));
  }, 60_000);

  it('cancels through the lifetime signal and refuses to open with invalid limits', async () => {
    const root = await start(project);
    const inputs = await inputsOf(root);
    await expect(createRetainedSourceAnalysis({ ...inputs, limits: { ...sourceLimits, maxExports: 0 } }))
      .rejects.toMatchObject({ code: 'resource-limit' });
    const controller = new AbortController();
    const analysis = await createRetainedSourceAnalysis({ ...inputs, signal: controller.signal });
    opened.push(analysis);
    await analysis.describe([]);
    const pid = retainedCompilerEvidence(analysis).serverPid;
    controller.abort();
    expect(await gone(pid)).toBe(true);
    await expect(analysis.describe([])).rejects.toMatchObject({ code: 'cancelled' });
    expect(analysis.hot).toBe(false);
  }, 60_000);

  it('reports a solution-style configuration as unavailable and leaves no server behind', async () => {
    const root = await start({ ...project, 'tsconfig.json': '{"files":[],"references":[{"path":"./unavailable"}]}' });
    const inputs = await inputsOf(root);
    await expect(createRetainedSourceAnalysis(inputs)).rejects.toMatchObject({ code: 'unavailable', message: expect.stringContaining('Solution-style') });
  }, 30_000);
});
