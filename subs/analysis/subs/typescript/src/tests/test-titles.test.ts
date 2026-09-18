import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { API, type Project } from 'typescript/unstable/sync';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TestFileTitles, TestTitleLimits } from '../interfaces/source.js';
import { describeTestTitles, testTitleRuns } from '../test-titles.js';
import { fixture, titlesFixture } from './fixtures.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

const limits: TestTitleLimits = { maxTitleBytes: 240, maxTitlesPerRecord: 40, maxResultBytes: 16 * 1024 * 1024 };

/** An in-process compiler over the fixture's own configuration. */
async function withProject<T>(files: Readonly<Record<string, string>>,
  run: (project: Project, root: string) => T | Promise<T>): Promise<T> {
  const root = await fixture(files);
  roots.push(root);
  const api = new API({ cwd: root });
  try {
    const configuration = join(root, 'tsconfig.json');
    const project = api.updateSnapshot({ openProjects: [configuration] }).getProject(configuration);
    if (!project) throw new Error('The compiler could not create the fixture project');
    return await run(project, root);
  } finally { api.close(); }
}

const described = (file: string, suites: readonly (readonly [readonly string[], readonly string[]])[], dynamic = 0, cut = 0): TestFileTitles =>
  ({ file, state: 'described', suites: suites.map(([suite, tests]) => ({ suite, tests })), dynamic, cut });

const numbered = (from: number, to: number): string[] => Array.from({ length: to - from + 1 }, (_, index) => `test ${from + index}`);

describe('test titles', () => {
  it('reads suites, direct tests, modifiers, tables and dynamic titles, and skips a file\'s own names (AV04)', () => withProject(titlesFixture,
    (project, root) => {
      const files = ['src/tests/suites.test.ts', 'src/tests/tables.test.ts', 'src/tests/own-bindings.test.ts',
        'src/tests/local-bindings.test.ts', 'src/tests/no-tests.test.ts'];
      const titles = describeTestTitles(project, root, files, limits);
      expect(titles).toEqual([
        described('src/tests/suites.test.ts', [
          [[], ['runs outside any suite', 'second outside']],
          [['outer'], ['outer first', 'outer after inner']],
          [['outer', 'inner'], ['inner first', 'inner second']],
          // `only nested` has only a nested suite, so it has no entry of its own.
          [['only nested', 'leaf'], ['leaf test']],
          [['empty suite'], []],
          [['skipped suite'], ['focused test', 'skipped table %i']],
        ]),
        described('src/tests/tables.test.ts', [
          [[], ['case %s']],
          [['table suite %s'], ['adds %i and %i', 'tagged table $value']],
          [['template suite %i'], ['template without substitution', '(dynamic)', '(dynamic)', '(dynamic)']],
        ], 3),
        // The file's own `describe` and `test` are not suites or tests; its imported `it` is.
        described('src/tests/own-bindings.test.ts', [[[], ['kept test']]]),
        // A parameter, loop, catch or block binding hides its name only inside its own scope.
        described('src/tests/local-bindings.test.ts', [[['scoped'], ['after the loop']], [['scoped', 'still a suite'], ['nested']]]),
        // A file without suites or tests has no entry for the file itself.
        described('src/tests/no-tests.test.ts', []),
      ]);
      expect(Object.isFrozen(titles) && Object.isFrozen(titles[0])).toBe(true);
      expect(JSON.parse(JSON.stringify(titles))).toEqual(titles);
    }), 60_000);

  it('cuts long titles, continues long lists with the same chain and bounds the result (AV05)', () => withProject(titlesFixture,
    (project, root) => {
      const file = 'src/tests/limits.test.ts';
      const [titles] = describeTestTitles(project, root, [file], limits);
      const cutTest = `${'a'.repeat(240)}…`;
      // 240 bytes would split the 120th two-byte character, so the cut keeps 239.
      const cutSuite = `x${'é'.repeat(119)}…`;
      expect(titles).toEqual(described(file, [
        [['limits'], [cutTest]],
        [[cutSuite], ['under a cut suite']],
        [['forty-five'], numbered(1, 40)],
        [['forty-five'], numbered(41, 45)],
      ], 0, 2));
      expect(Buffer.byteLength(cutTest.slice(0, -1))).toBe(240);
      expect(Buffer.byteLength(cutSuite.slice(0, -1))).toBe(239);

      // The whole result's encoded bytes are the bound: exactly enough passes, one byte fewer refuses.
      const exact = Buffer.byteLength(JSON.stringify([titles]));
      expect(describeTestTitles(project, root, [file], { ...limits, maxResultBytes: exact })).toEqual([titles]);
      expect(() => describeTestTitles(project, root, [file], { ...limits, maxResultBytes: exact - 1 }))
        .toThrow(expect.objectContaining({ name: 'SourceAnalysisError', code: 'resource-limit' }));
      const pair = Buffer.byteLength(JSON.stringify([titles, titles]));
      expect(describeTestTitles(project, root, [file, file], { ...limits, maxResultBytes: pair })).toHaveLength(2);
      expect(() => describeTestTitles(project, root, [file, file], { ...limits, maxResultBytes: pair - 1 }))
        .toThrow(expect.objectContaining({ code: 'resource-limit' }));
      // Other bounds apply as given.
      const [narrow] = describeTestTitles(project, root, [file], { ...limits, maxTitleBytes: 5, maxTitlesPerRecord: 20 });
      // Every title here is longer than five bytes: three suites, two tests and the 45 numbered tests.
      expect(narrow).toMatchObject({ state: 'described', dynamic: 0, cut: 50 });
      expect((narrow as Extract<TestFileTitles, { state: 'described' }>).suites.map(entry => [entry.suite, entry.tests.length])).toEqual([
        [['limit…'], 1], [[`x${'é'.repeat(2)}…`], 1], [['forty…'], 20], [['forty…'], 20], [['forty…'], 5],
      ]);
    }), 60_000);

  it('rejects invalid requests and limits, and a cancelled call, with no partial result, counting every call (AV05)',
    () => withProject(titlesFixture, (project, root) => {
      const file = 'src/tests/suites.test.ts';
      const before = testTitleRuns();
      for (const invalid of ['', '/abs/suites.test.ts', 'src/../src/tests/suites.test.ts', 'src/./tests/suites.test.ts',
        'src//tests/suites.test.ts', 'src/tests/', 'src/tests/steps.feature', 'src\\tests\\suites.test.ts']) {
        expect(() => describeTestTitles(project, root, [file, invalid], limits)).toThrow(expect.objectContaining({ code: 'protocol-error' }));
      }
      for (const invalid of [{ maxTitleBytes: 0 }, { maxTitlesPerRecord: 1.5 }, { maxResultBytes: Number.NaN }]) {
        expect(() => describeTestTitles(project, root, [file], { ...limits, ...invalid })).toThrow(expect.objectContaining({ code: 'resource-limit' }));
      }
      expect(() => describeTestTitles(project, root, [file], limits, AbortSignal.abort())).toThrow(expect.objectContaining({ code: 'cancelled' }));
      // Cancellation while the first file is read answers nothing.
      const controller = new AbortController();
      const read = project.program.getSourceFile.bind(project.program);
      vi.spyOn(project.program, 'getSourceFile').mockImplementation(path => { controller.abort(); return read(path); });
      expect(() => describeTestTitles(project, root, [file, file], limits, controller.signal)).toThrow(expect.objectContaining({ code: 'cancelled' }));
      vi.restoreAllMocks();
      expect(describeTestTitles(project, root, [file], limits)).toHaveLength(1);
      expect(testTitleRuns() - before).toBe(14);
    }), 60_000);

  it('answers one entry per request in request order, unavailable outside the program (AV07)', () => withProject(titlesFixture,
    (project, root) => {
      const files = ['tests/outside.test.ts', 'src/tests/own-bindings.test.ts', 'src/tests/plain.test.js', 'src/tests/absent.test.ts',
        'src/tests/own-bindings.test.ts'];
      const own = described('src/tests/own-bindings.test.ts', [[[], ['kept test']]]);
      expect(describeTestTitles(project, root, files, limits)).toEqual([
        // Outside the configuration's `include`, left out without `allowJs`, and absent.
        { file: 'tests/outside.test.ts', state: 'unavailable', reason: 'not-in-program' },
        own,
        { file: 'src/tests/plain.test.js', state: 'unavailable', reason: 'not-in-program' },
        { file: 'src/tests/absent.test.ts', state: 'unavailable', reason: 'not-in-program' },
        own,
      ]);
      expect(describeTestTitles(project, root, [], limits)).toEqual([]);
      // A tree that cannot be read is that file's failure alone.
      const read = project.program.getSourceFile.bind(project.program);
      vi.spyOn(project.program, 'getSourceFile').mockImplementationOnce(() => new Proxy(read(join(root, files[1]!))!, {
        get(target, key) { if (key === 'statements') throw new Error('Unreadable tree'); return Reflect.get(target, key) as unknown; },
      }));
      expect(describeTestTitles(project, root, [files[1]!, files[1]!], limits)).toEqual([
        { file: files[1], state: 'unavailable', reason: 'compiler-failure' }, own,
      ]);
    }), 60_000);

  it('reads a JavaScript test file the compiler options admit', () => withProject({
    ...titlesFixture,
    'tsconfig.json': JSON.stringify({ compilerOptions: { module: 'ESNext', moduleResolution: 'bundler', types: [], allowJs: true },
      include: ['src'] }),
  }, (project, root) => {
    expect(describeTestTitles(project, root, ['src/tests/plain.test.js'], limits)).toEqual([
      described('src/tests/plain.test.js', [[[], ['left out by the compiler options']]]),
    ]);
  }), 60_000);
});
