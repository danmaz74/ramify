import { describe, expect, it } from 'vitest';
import { projectFileFacts } from '../file-facts-query.js';
import type { AffectedQuery, AffectedSelection } from '../interfaces/affected.js';
import { fixture, instrumentCompiler, opened } from './session-test-fixture.js';

const empty = 'src/tests/empty.test.ts', type = 'src/tests/type.test.ts', missing = 'src/tests/missing.test.ts';
const scripts = {
  [empty]: 'const local = 1; void local; export {};\n',
  [type]: 'export type Token = number;\n',
  'src/tests/load.ts': "import './empty.test.js';\nexport {};\n",
  'src/tests/reexport.ts': "export type { Token } from './type.test.js';\n",
  'src/tests/incomplete.test.ts': "export * from './absent.js';\n",
  'src/tests/plain.test.ts': 'export {};\n',
  'src/tests/unknown.ts': 'declare const name: string; void import(name);\nexport {};\n',
};
async function answer(handle: Awaited<ReturnType<typeof opened>>['handle'], paths: readonly string[], fileFacts = true): Promise<AffectedSelection> {
  const result = await handle.affected({ sequence: handle.current!.sequence, paths, ...(fileFacts ? { fileFacts: true } : {}) });
  if (result.status !== 'answered') throw new Error(JSON.stringify(result));
  return result.result;
}

describe('per-file structural facts', () => {
  it('counts type exports, keeps export {} empty, and records side-effect and type-reexport importers', () => fixture(async (_root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const compiler = instrumentCompiler(state);
      const result = await answer(handle, [type, empty, empty]);
      expect(result.fileFacts).toEqual({ schemaVersion: 'ramify.file-facts/1', files: [
        { path: empty, status: 'owned', module: 'fixture', exclusion: null, existence: 'present',
          exports: { state: 'complete', hasExports: false, names: [] },
          incoming: { state: 'partial', paths: ['src/tests/load.ts'] }, limits: [] },
        { path: type, status: 'owned', module: 'fixture', exclusion: null, existence: 'present',
          exports: { state: 'complete', hasExports: true, names: ['Token'] },
          incoming: { state: 'partial', paths: ['src/tests/reexport.ts'] }, limits: [] },
      ] });
      expect(compiler.describe).not.toHaveBeenCalled();
      expect(compiler.interpret).not.toHaveBeenCalled();
      expect(compiler.update).not.toHaveBeenCalled();
      const ordinary = await answer(handle, [empty, type], false);
      const { fileFacts, ...selection } = result;
      expect(fileFacts).toBeDefined();
      expect(selection).toEqual(ordinary);
      expect(ordinary).not.toHaveProperty('fileFacts');
    } finally { await handle.dispose(); }
  }, scripts), 60_000);

  it('keeps nested-owner originals separate from colliding project-relative source paths', () => fixture(async (_root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const result = await answer(handle, ['provider.ts', 'subs/branch/src/provider.ts']);
      expect(result.fileFacts!.files[0]).toMatchObject({ path: 'provider.ts', incoming: { state: 'complete', paths: [] } });
      expect(result.fileFacts!.files[1]).toMatchObject({ path: 'subs/branch/src/provider.ts', incoming: { state: 'complete',
        paths: ['src/main.ts', 'subs/branch/subs/leaf/src/probe.ts'] } });
    } finally { await handle.dispose(); }
  }, { 'provider.ts': 'export {};\n' }), 60_000);

  it('reports complete known incoming facts when supported source has no hidden-target limits', () => fixture(async (_root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const result = await answer(handle, [empty]);
      expect(result.fileFacts!.files[0]).toMatchObject({ exports: { state: 'complete', hasExports: false },
        incoming: { state: 'complete', paths: [] }, limits: [] });
    } finally { await handle.dispose(); }
  }, { [empty]: scripts[empty] }), 60_000);

  it('keeps incomplete descriptions inconclusive and scopes limits to relevant files', () => fixture(async (_root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const result = await answer(handle, ['src/tests/incomplete.test.ts', 'src/tests/plain.test.ts']);
      const [incomplete, plain] = result.fileFacts!.files;
      expect(incomplete!.exports).toMatchObject({ state: 'incomplete', hasExports: null, names: [] });
      expect(incomplete!.limits.some(note => note.code === 'incomplete-exports')).toBe(true);
      expect(plain).toMatchObject({ exports: { state: 'complete', hasExports: false, names: [] },
        incoming: { state: 'partial', paths: [] }, limits: [] });
      expect(result.coverage.notes.some(note => note.code === 'nonliteral-target')).toBe(true);
    } finally { await handle.dispose(); }
  }, scripts), 60_000);

  it('reports missing, excluded, outside and unobserved inert paths explicitly', () => fixture(async (_root, inputs) => {
    const { handle } = await opened(inputs);
    try {
      const result = await answer(handle, [missing, 'src/tmp/ignored.ts', 'node_modules/ignored.ts', '../other.ts', 'notes.txt']);
      const byPath = new Map(result.fileFacts!.files.map(file => [file.path, file]));
      expect(byPath.get(missing)).toMatchObject({ status: 'owned', module: 'fixture', existence: 'missing',
        exports: { state: 'unavailable', hasExports: null, names: null, reason: 'missing-file' },
        incoming: { state: 'unavailable', paths: null } });
      expect(byPath.get('src/tmp/ignored.ts')).toMatchObject({ status: 'owned', exclusion: { kind: 'scratch' }, existence: 'unknown',
        exports: { state: 'unavailable', reason: 'excluded' } });
      expect(byPath.get('node_modules/ignored.ts')).toMatchObject({ status: 'excluded', module: null,
        exports: { state: 'unavailable', reason: 'excluded' } });
      expect(byPath.get('../other.ts')).toMatchObject({ status: 'outside-project', exports: { state: 'unavailable', reason: 'outside-project' } });
      expect(byPath.get('notes.txt')).toMatchObject({ existence: 'unknown', exports: { state: 'unavailable', reason: 'not-analyzed' } });
    } finally { await handle.dispose(); }
  }, scripts), 60_000);

  it('does not turn unavailable retained facts or ambiguous empty exports into complete empty facts', () => fixture(async (_root, inputs) => {
    const { handle, state } = await opened(inputs);
    try {
      const ordinary = await answer(handle, [empty]);
      const facts = state.facts!;
      const removed = { ...facts.files }; delete removed[empty];
      const unavailable = projectFileFacts({ ...facts, files: removed }, ordinary.paths, handle.current!.inputs, () => false);
      expect(unavailable.files[0]!.exports).toEqual({ state: 'unavailable', hasExports: null, names: null, reason: 'not-analyzed' });
      const retained = facts.files[empty]!;
      const ambiguous = projectFileFacts({ ...facts, files: { ...facts.files, [empty]: { ...retained,
        description: { ...retained.description, exports: { ...retained.description.exports, state: 'ambiguous' } } } } },
      ordinary.paths, handle.current!.inputs, () => false);
      expect(ambiguous.files[0]!.exports).toEqual({ state: 'ambiguous', hasExports: null, names: [] });
      expect(await handle.affected({ sequence: handle.current!.sequence - 1, paths: [empty], fileFacts: true }))
        .toMatchObject({ status: 'unavailable', reason: 'invalid-revision' });
      expect(await handle.affected({ sequence: handle.current!.sequence, paths: [empty], fileFacts: false } as unknown as AffectedQuery))
        .toMatchObject({ status: 'unavailable', reason: 'invalid-query' });
    } finally { await handle.dispose(); }
  }, scripts), 60_000);
});
