import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { AffectedLimits } from '../affected-query.js';
import type { AffectedQuery, AffectedSelection, SessionAffectedOutcome } from '../interfaces/affected.js';
import type { RetainedSession, SessionInputs, SessionRevision } from '../interfaces/session.js';
import type { SessionState } from '../session-revision.js';
import { formDependentsOfP, formFiles, formModules, formPaths } from './affected-fixtures.js';
import { fixture, instrumentCompiler, instrumentObserver, opened, put, revised, timeout } from './session-test-fixture.js';

/** Test-only limits for the session's projection, and counted disk reads while `counting`. */
const seams = vi.hoisted(() => ({ limits: null as AffectedLimits | null, counting: false, reads: [] as string[] }));
vi.mock('../affected-query.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../affected-query.js')>();
  return { ...actual, projectAffected: (...args: Parameters<typeof actual.projectAffected>) =>
    actual.projectAffected(args[0], args[1], seams.limits ?? args[2], args[3]) };
});
vi.mock('node:fs/promises', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  const counted = <K extends 'readFile' | 'open' | 'opendir' | 'readdir' | 'lstat' | 'stat' | 'realpath' | 'readlink'>(name: K) =>
    ((...args: unknown[]) => { if (seams.counting) seams.reads.push(`${name} ${String(args[0])}`);
      return (actual[name] as (...values: unknown[]) => unknown)(...args); }) as (typeof actual)[K];
  return { ...actual, readFile: counted('readFile'), open: counted('open'), opendir: counted('opendir'), readdir: counted('readdir'),
    lstat: counted('lstat'), stat: counted('stat'), realpath: counted('realpath'), readlink: counted('readlink') };
});
vi.mock('node:fs', async importOriginal => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const counted = <K extends 'readFileSync' | 'readSync' | 'statSync' | 'lstatSync' | 'readdirSync' | 'realpathSync'>(name: K) =>
    Object.assign((...args: unknown[]) => { if (seams.counting) seams.reads.push(`${name} ${String(args[0])}`);
      return (actual[name] as (...values: unknown[]) => unknown)(...args); }, actual[name]) as (typeof actual)[K];
  return { ...actual, readFileSync: counted('readFileSync'), readSync: counted('readSync'), statSync: counted('statSync'),
    lstatSync: counted('lstatSync'), readdirSync: counted('readdirSync'), realpathSync: counted('realpathSync') };
});

interface Opened { readonly root: string; readonly inputs: SessionInputs; readonly handle: RetainedSession;
  readonly revision: SessionRevision; readonly state: SessionState }
/** Open one session over the source-form project for a whole describe block. */
function sharedSession(overrides: Record<string, string> = {}): { readonly get: () => Opened } {
  let session: Opened | undefined;
  let release: () => void = () => undefined;
  let done: Promise<void> = Promise.resolve();
  beforeAll(async () => {
    session = await new Promise<Opened>((resolve, reject) => {
      done = fixture(async (root, inputs) => {
        const value = await opened(inputs);
        try {
          resolve({ root, inputs, ...value });
          await new Promise<void>(finish => { release = finish; });
        } finally { await value.handle.dispose(); }
      }, { ...formFiles, ...overrides }).catch(error => { reject(error); });
    });
  }, timeout);
  afterAll(async () => { release(); await done; }, timeout);
  return { get: () => session! };
}

const query = (handle: RetainedSession, value: AffectedQuery): Promise<SessionAffectedOutcome> => handle.affected!(value);
async function answer(handle: RetainedSession, value: Omit<AffectedQuery, 'sequence'>): Promise<AffectedSelection> {
  const outcome = await query(handle, { sequence: handle.current!.sequence, ...value });
  expect(outcome.status, JSON.stringify(outcome)).toBe('answered');
  if (outcome.status !== 'answered') throw new Error(JSON.stringify(outcome));
  expect(outcome.sequence).toBe(handle.current!.sequence);
  return outcome.result;
}
const ids = (list: readonly { readonly id: string }[]): string[] => list.map(module => module.id);

describe('RetainedSession.affected: source forms (A7-03)', () => {
  const shared = sharedSession();

  it('A7-03:star: export * from p makes star a dependent of p', async () => {
    const { handle, revision } = shared.get();
    expect(revision.outcome).toMatchObject({ execution: 'completed', check: 'passed' });
    const result = await answer(handle, { modules: ['fixture/p'] });
    expect(result).toMatchObject({ schemaVersion: 'ramify.affected/2', inputId: revision.inputId, paths: [],
      changedModules: [{ id: 'fixture/p', directory: 'subs/p' }], selection: 'dependency-closure', widening: [],
      coverage: { status: 'complete', notes: [] }, analysisCheck: 'passed' });
    // Each dependent of p reaches it through one form; star is among them.
    expect(ids(result.affectedModules)).toEqual(formDependentsOfP);
    expect(ids(result.testModules)).toEqual([...formDependentsOfP, 'fixture/p'].sort());
  }, timeout);

  it('A7-03:barrel-original: a barrel re-export makes the importer depend on the barrel owner and the original owner', async () => {
    const { handle } = shared.get();
    expect(ids((await answer(handle, { modules: ['fixture/barrel'] })).affectedModules)).toEqual(['fixture/viabarrel']);
    expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).toContain('fixture/viabarrel');
  }, timeout);

  it('A7-03:namespace: import * as ns makes ns a dependent of p', async () => {
    const { handle } = shared.get();
    expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).toContain('fixture/ns');
    expect((await answer(handle, { modules: ['fixture/ns'] })).affectedModules).toEqual([]);
  }, timeout);

  it('A7-03:type-only: import type is an edge, so a change to the type\'s file selects the importer', async () => {
    const { handle } = shared.get();
    const result = await answer(handle, { paths: [formPaths.api] });
    expect(result.paths).toEqual([{ path: formPaths.api, module: 'fixture/p', basis: 'inventory' }]);
    expect(ids(result.changedModules)).toEqual(['fixture/p']);
    expect(ids(result.affectedModules)).toContain('fixture/typeonly');
  }, timeout);

  it('A7-03:literal-dynamic: a literal dynamic import makes dyn a dependent of p', async () => {
    const { handle } = shared.get();
    expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).toContain('fixture/dyn');
  }, timeout);

  it('A7-03:side-effect: a side-effect import without selections makes effect a dependent of p', async () => {
    const { handle } = shared.get();
    expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).toContain('fixture/effect');
  }, timeout);

  it('A7-03:shim: a resource depends on the module owning its declaration shim', async () => {
    const { handle, state } = shared.get();
    // Precondition: the retained description of the resource names the shim.
    expect(state.facts!.files[formPaths.theme]!.description.dependencies.shims).toEqual([formPaths.shim]);
    expect((await answer(handle, { modules: ['fixture/shims'] })).affectedModules).toEqual([{ id: 'fixture/styles', directory: 'subs/styles' }]);
    expect((await answer(handle, { modules: ['fixture/styles'] })).affectedModules).toEqual([]);
  }, timeout);

  it('A7-03:no-invented-edges: exposure declarations, ancestry and resolution candidates add no edges', async () => {
    const { handle, state } = shared.get();
    // Precondition: cand's resolution probed a candidate in lonely before resolving into p.
    expect(state.facts!.files[formPaths.candidate]!.candidates.some(path => path.startsWith('subs/lonely/'))).toBe(true);
    const fromP = ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules);
    // The root re-exposes p to its descendants and is p's parent, yet imports nothing from p.
    expect(fromP).not.toContain('fixture');
    expect(ids((await answer(handle, { modules: ['fixture/lonely'] })).affectedModules)).toEqual([]);
    // The branch exposes to its parent and descendants; only the root and leaf import it, and whatever depends on them.
    expect(ids((await answer(handle, { modules: ['fixture/branch'] })).affectedModules))
      .toEqual(['fixture', 'fixture/branch/leaf', 'fixture/sibling']);
  }, timeout);

  it('A7-03:testing-module: a separately declared testing module is its own node and a dependent of the code it imports', async () => {
    const { handle } = shared.get();
    expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).toContain('fixture/ptests');
    const own = await answer(handle, { paths: ['subs/ptests/src/check.ts'] });
    expect(own.changedModules).toEqual([{ id: 'fixture/ptests', directory: 'subs/ptests' }]);
    expect(own.affectedModules).toEqual([]);
  }, timeout);

  it('A7-04:resource-limit (session): the session answers resource-limit when the projection exceeds its bounds', async () => {
    const { handle } = shared.get();
    try {
      seams.limits = { maxModules: 4096, maxEdges: 3 };
      expect(await query(handle, { sequence: handle.current!.sequence, modules: ['fixture/p'] })).toEqual({
        status: 'unavailable', reason: 'resource-limit', message: expect.any(String), unknownModules: [] });
      seams.limits = { maxModules: formModules.length - 1, maxEdges: 100_000 };
      expect(await query(handle, { sequence: handle.current!.sequence, modules: ['fixture/p'] }))
        .toMatchObject({ status: 'unavailable', reason: 'resource-limit' });
      seams.limits = { maxModules: formModules.length, maxEdges: 100_000 };
      expect((await query(handle, { sequence: handle.current!.sequence, modules: ['fixture/p'] })).status).toBe('answered');
    } finally { seams.limits = null; }
  }, timeout);

  it('A7-01:unknown-module (session): unknown IDs fail the whole query and invalid seeds are invalid-query', async () => {
    const { handle } = shared.get();
    const sequence = handle.current!.sequence;
    expect(await query(handle, { sequence, modules: ['fixture/p', 'p', 'fixture/zz'] })).toEqual({
      status: 'unavailable', reason: 'unknown-module', message: expect.any(String), unknownModules: ['fixture/zz', 'p'] });
    expect(await query(handle, { sequence, paths: ['/abs/path.ts'] })).toMatchObject({ status: 'unavailable', reason: 'invalid-query' });
    expect(await query(handle, { sequence, modules: null as unknown as string[] }))
      .toMatchObject({ status: 'unavailable', reason: 'invalid-query' });
    expect(await answer(handle, {})).toMatchObject({ changedModules: [], affectedModules: [], testModules: [],
      selection: 'dependency-closure' });
  }, timeout);

  it('A7-03:denied: a denied import still adds an edge and the answer carries the failed check', async () => {
    const { root, handle } = shared.get();
    expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).not.toContain('fixture/intruder');
    await put(root, formPaths.take, "import { hidden } from '../../p/src/internal.js';\nexport const idle: number = hidden;\n");
    const revision = await revised(handle, [formPaths.take]);
    expect(revision.outcome.check).toBe('failed');
    expect(revision.diagnostics.some(item => item.category === 'import')).toBe(true);
    const result = await answer(handle, { modules: ['fixture/p'] });
    expect(ids(result.affectedModules)).toEqual([...formDependentsOfP, 'fixture/intruder'].sort());
    expect(result.analysisCheck).toBe('failed');
  }, timeout);
});

describe('RetainedSession.affected: coverage (A7-04)', () => {
  it('A7-04:signature-only-complete: signature notes keep coverage complete and the closure selection', () => fixture(async (_root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const result = await answer(handle, { modules: ['fixture/p'] });
      expect(result.coverage.status).toBe('complete');
      expect(result.coverage.notes.map(note => note.code)).toEqual(['signature-inferred']);
      expect(result.selection).toBe('dependency-closure');
      expect(ids(result.affectedModules)).toEqual(formDependentsOfP);
    } finally { await handle.dispose(); }
  }, { ...formFiles, [formPaths.api]: 'export const pValue = 1;\nexport interface PType { readonly n: number }\n' }), timeout);

  it('A7-04:nonliteral-dynamic: a nonliteral dynamic import anywhere widens to every module', () => fixture(async (_root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const result = await answer(handle, { modules: ['fixture/p'] });
      expect(result.coverage.status).toBe('partial');
      expect(result.coverage.notes.map(note => note.code)).toEqual(['nonliteral-target']);
      expect(result).toMatchObject({ selection: 'all-modules', widening: ['partial-coverage'] });
      expect(ids(result.affectedModules)).toEqual(formDependentsOfP);
      expect(ids(result.testModules)).toEqual(formModules);
    } finally { await handle.dispose(); }
  }, { ...formFiles, [formPaths.alone]: "const name: string = String(Date.now());\nexport const later = import(name);\n" }), timeout);

  it('A7-04:unresolved-target: deleting an imported file leaves an unresolved target that widens', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      expect((await answer(handle, { modules: ['fixture/p'] })).selection).toBe('dependency-closure');
      await rm(join(root, 'subs/lonely/src/extra.ts'));
      await revised(handle, ['subs/lonely/src/extra.ts'], 'deleted');
      const result = await answer(handle, { paths: ['subs/lonely/src/extra.ts'] });
      // The deleted file resolves by area; the importer's unresolved target widens.
      expect(result.paths).toEqual([{ path: 'subs/lonely/src/extra.ts', module: 'fixture/lonely', basis: 'area' }]);
      expect(result.coverage.notes.map(note => note.code)).toEqual(['unresolved-target']);
      expect(result).toMatchObject({ selection: 'all-modules', widening: ['partial-coverage'] });
      expect(ids(result.testModules)).toEqual(formModules);
    } finally { await handle.dispose(); }
  }, { ...formFiles, 'subs/lonely/src/extra.ts': 'export const extra: number = 1;\n',
    [formPaths.alone]: "import { extra } from './extra.js';\nexport const alone: number = extra;\n" }), timeout);

  it('A7-04:outside-module-target: an import of a file outside every module widens', () => fixture(async (_root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const result = await answer(handle, { modules: ['fixture/lonely'] });
      expect(result.coverage.notes.map(note => note.code)).toEqual(['outside-module-target']);
      expect(result).toMatchObject({ changedModules: [{ id: 'fixture/lonely', directory: 'subs/lonely' }], affectedModules: [],
        selection: 'all-modules', widening: ['partial-coverage'] });
      expect(ids(result.testModules)).toEqual(formModules);
    } finally { await handle.dispose(); }
  }, { ...formFiles, 'lib/helper.ts': 'export const helper: number = 1;\n',
    [formPaths.alone]: "import { helper } from '../../../lib/helper.js';\nexport const alone: number = helper;\n" }), timeout);
});

describe('RetainedSession.affected: revisions and readiness (A7-05)', () => {
  it('A7-05:edit-changes-answer: an import added by an edit selects the new dependent only after its revision', () => fixture(async (root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).not.toContain('fixture/lonely');
      await put(root, formPaths.alone, "import { pValue } from '../../p/src/interfaces/api.js';\nexport const alone: number = pValue;\n");
      // Until the revision publishes, the answer describes the old inputs.
      expect(ids((await answer(handle, { modules: ['fixture/p'] })).affectedModules)).not.toContain('fixture/lonely');
      const next = await revised(handle, [formPaths.alone]);
      const result = await answer(handle, { modules: ['fixture/p'] });
      expect(ids(result.affectedModules)).toEqual([...formDependentsOfP, 'fixture/lonely'].sort());
      expect(result.inputId).toBe(next.inputId);
      expect(result.inputId).not.toBe(revision.inputId);
    } finally { await handle.dispose(); }
  }, formFiles), timeout);

  it('A7-05:stale-sequence: any sequence other than the current one is invalid-revision', () => fixture(async (root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      const stale = { status: 'unavailable', reason: 'invalid-revision', message: expect.any(String), unknownModules: [] };
      expect(await query(handle, { sequence: revision.sequence + 1, modules: ['fixture/p'] })).toEqual(stale);
      await put(root, formPaths.alone, 'export const alone: number = 2;\n');
      await revised(handle, [formPaths.alone]);
      expect(await query(handle, { sequence: revision.sequence, modules: ['fixture/p'] })).toEqual(stale);
      expect((await query(handle, { sequence: handle.current!.sequence, modules: ['fixture/p'] })).status).toBe('answered');
    } finally { await handle.dispose(); }
    expect(await query(handle, { sequence: revision.sequence + 1 })).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
  }, formFiles), timeout);

  it('A7-05:invalid-current: an invalid current revision is invalid-current, never the previous valid answer', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      expect((await answer(handle, { modules: ['fixture/p'] })).affectedModules).not.toEqual([]);
      const valid = handle.current!.sequence;
      await put(root, formPaths.pDescription, 'ramify 1\nmodule p\nexpose-src pValue from\n');
      const invalid = await revised(handle, [formPaths.pDescription]);
      expect(invalid.outcome.execution).toBe('invalid');
      expect(await query(handle, { sequence: invalid.sequence, modules: ['fixture/p'] })).toEqual({
        status: 'unavailable', reason: 'invalid-current', message: expect.any(String), unknownModules: [] });
      expect(await query(handle, { sequence: valid, modules: ['fixture/p'] })).toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
    } finally { await handle.dispose(); }
  }, formFiles), timeout);

  it('A7-05:missing-facts: a revision whose access interpretation is blocked answers missing-facts', () => fixture(async (root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      expect((await query(handle, { sequence: handle.current!.sequence, modules: ['fixture/p'] })).status).toBe('answered');
      // An exposure naming an absent export is a link error; the access stage is blocked.
      await put(root, formPaths.pDescription, 'ramify 1\nmodule p\nexpose-src * from "interfaces/api.ts" to parent\n'
        + 'expose-src nothing from "internal.ts" to parent\n');
      const blocked = await revised(handle, [formPaths.pDescription]);
      expect(blocked.outcome).toMatchObject({ execution: 'invalid', coverage: 'not-run' });
      expect(await query(handle, { sequence: blocked.sequence, modules: ['fixture/p'] })).toEqual({
        status: 'unavailable', reason: 'missing-facts', message: expect.any(String), unknownModules: [] });
    } finally { await handle.dispose(); }
  }, formFiles), timeout);

  it('A7-05:missing-facts (cold): a session opened over a blocked access stage answers missing-facts', () => fixture(async (_root, inputs) => {
    const { handle, revision } = await opened(inputs);
    try {
      expect(revision.outcome.execution).toBe('invalid');
      expect(await query(handle, { sequence: revision.sequence, paths: [formPaths.api] }))
        .toMatchObject({ status: 'unavailable', reason: 'missing-facts', unknownModules: [] });
    } finally { await handle.dispose(); }
  }, { ...formFiles, [formPaths.pDescription]: 'ramify 1\nmodule p\nexpose-src nothing from "internal.ts" to parent\n' }), timeout);

  it('A7-05:warm-after-release: after releaseCompiler the query answers from retained facts without recreating a compiler', () =>
    fixture(async (_root, inputs) => {
      const { handle, state } = await opened(inputs);
      try {
        const hot = await answer(handle, { modules: ['fixture/p'], paths: [formPaths.theme] });
        await handle.releaseCompiler();
        expect(handle.status().level).toBe('warm');
        // A released adapter has no interpreter to instrument; spy on its entry points instead.
        const adapter = state.adapter! as unknown as Record<string, () => unknown>;
        const calls = ['update', 'describe', 'interpreter', 'catalog', 'details', 'shapes', 'testTitles'].map(name => vi.spyOn(adapter, name));
        const warm = await answer(handle, { modules: ['fixture/p'], paths: [formPaths.theme] });
        expect(warm).toEqual(hot);
        expect(ids(warm.affectedModules)).toEqual(formDependentsOfP);
        for (const spy of calls) expect(spy).not.toHaveBeenCalled();
        expect(handle.status().level).toBe('warm');
      } finally { await handle.dispose(); }
    }, formFiles), timeout);

  it('A7-05:no-disk-or-report: a ready query reads no source, calls no compiler and projects no report', () => fixture(async (root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const observer = instrumentObserver(state);
      const adapter = state.adapter!;
      const queries = ['catalog', 'details', 'shapes', 'testTitles', 'releaseCompiler'].map(name =>
        vi.spyOn(adapter as unknown as Record<string, () => unknown>, name));
      const descriptions = vi.spyOn(state.observer!, 'readDescription');
      const readmes = vi.spyOn(state.observer!, 'readReadme');
      const report = vi.spyOn(handle, 'report');
      seams.reads.length = 0; seams.counting = true;
      let result: AffectedSelection;
      try { result = await answer(handle, { modules: ['fixture/p'], paths: [formPaths.api, 'package.json'] }); }
      finally { seams.counting = false; }
      expect(result.selection).toBe('all-modules');
      expect(seams.reads).toEqual([]);
      for (const spy of [compiler.update, compiler.describe, compiler.interpret, compiler.dispose, observer.apply, observer.reobserve,
        observer.retire, descriptions, readmes, report, ...queries]) expect(spy).not.toHaveBeenCalled();
      // Control: the same seams observe the reads and compiler calls of a real update.
      await put(root, formPaths.alone, 'export const alone: number = 2;\n');
      seams.counting = true;
      try { await revised(handle, [formPaths.alone]); }
      finally { seams.counting = false; }
      expect(seams.reads.length).toBeGreaterThan(0);
      expect(compiler.update).toHaveBeenCalled();
      expect(observer.apply).toHaveBeenCalled();
    } finally { seams.counting = false; await handle.dispose(); }
  }, formFiles), timeout);
});
