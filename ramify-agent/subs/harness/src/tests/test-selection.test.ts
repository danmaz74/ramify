import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveTestSelection, testArea } from '../checks/selection.js';
import { checkCommand } from '../checks/records.js';
import type { TestSelectionPolicy } from '../checks/records.js';
import { scopedChecks } from '../checks/checkpoint.js';
import { verifyChecks } from '../checks/verify.js';
import { copyFixture } from './helpers/fixture.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

/*
 * Resolving a test-selection policy against the current tree.
 *
 * The tree is the real fixture project, copied; the owner-to-directory
 * mapping is what the architect view records. Every file the resolver
 * answers with is a file that is there, and a file it added while the
 * iteration ran is selected by the next resolution.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** The fixture's modules as the architect view records them. */
const fixtureIndex = architectIndex([
  moduleEntry('collection-review', '', null),
  moduleEntry('collection-review/integration-tests', 'subs/integration-tests', 'collection-review', { tags: ['testing', 'dispatch'], areas: ['src'] }),
  moduleEntry('collection-review/workspace', 'subs/workspace', 'collection-review'),
  moduleEntry('collection-review/workspace/catalog', 'subs/workspace/subs/catalog', 'collection-review/workspace'),
  moduleEntry('collection-review/workspace/catalog/core', 'subs/workspace/subs/catalog/subs/core', 'collection-review/workspace/catalog'),
  moduleEntry('collection-review/workspace/catalog/ui', 'subs/workspace/subs/catalog/subs/ui', 'collection-review/workspace/catalog'),
  moduleEntry('collection-review/workspace/contracts', 'subs/workspace/subs/contracts', 'collection-review/workspace'),
  moduleEntry('collection-review/workspace/reviews', 'subs/workspace/subs/reviews', 'collection-review/workspace'),
  moduleEntry('collection-review/workspace/reviews/core', 'subs/workspace/subs/reviews/subs/core', 'collection-review/workspace/reviews'),
  moduleEntry('collection-review/workspace/reviews/core/controller', 'subs/workspace/subs/reviews/subs/core/subs/controller', 'collection-review/workspace/reviews/core'),
  moduleEntry('collection-review/workspace/reviews/core/tasks', 'subs/workspace/subs/reviews/subs/core/subs/tasks', 'collection-review/workspace/reviews/core'),
  moduleEntry('collection-review/workspace/reviews/ui', 'subs/workspace/subs/reviews/subs/ui', 'collection-review/workspace/reviews'),
  moduleEntry('collection-review/workspace/reviews/ui/pure-ui', 'subs/workspace/subs/reviews/subs/ui/subs/pure-ui', 'collection-review/workspace/reviews/ui'),
  moduleEntry('collection-review/workspace/reviews/validation', 'subs/workspace/subs/reviews/subs/validation', 'collection-review/workspace/reviews'),
  moduleEntry('collection-review/workspace/shared-ui', 'subs/workspace/subs/shared-ui', 'collection-review/workspace'),
]);

async function fixture() {
  const copy = await copyFixture();
  cleanups.push(copy.remove);
  return copy.root;
}

function policy(exactOwners: readonly string[], subtrees: readonly string[] = [], extraSuites: readonly string[] = []): TestSelectionPolicy {
  return { policy: 'owned-by-scope', exactOwners: [...exactOwners], subtrees: [...subtrees], extraSuites: [...extraSuites] };
}

describe('K3: an exact owner and an included child subtree', () => {
  test('the two selections differ by exactly the subtree\'s test files', async () => {
    const root = await fixture();
    const exact = await resolveTestSelection({ projectRoot: root, index: fixtureIndex, policy: policy(['collection-review/workspace/reviews']) });
    const withCore = await resolveTestSelection({
      projectRoot: root,
      index: fixtureIndex,
      policy: policy(['collection-review/workspace/reviews'], ['collection-review/workspace/reviews/core']),
    });

    expect(exact.failure).toBeNull();
    expect(withCore.failure).toBeNull();
    expect(exact.selection.resolved).toEqual([
      'subs/workspace/subs/reviews/src/tests/router.test.ts',
      'subs/workspace/subs/reviews/src/tests/sessions.test.ts',
      'subs/workspace/subs/reviews/src/tests/typing.test.ts',
    ]);
    // The subtree is whole: the child, and every owner beneath it.
    const added = withCore.selection.resolved.filter(file => !exact.selection.resolved.includes(file));
    expect(added).toEqual([
      'subs/workspace/subs/reviews/subs/core/src/tests/runtime.test.ts',
      'subs/workspace/subs/reviews/subs/core/subs/controller/src/tests/controller.test.ts',
      'subs/workspace/subs/reviews/subs/core/subs/tasks/src/tests/inspection-task.test.ts',
      'subs/workspace/subs/reviews/subs/core/subs/tasks/src/tests/result.test.ts',
    ]);
    // A sibling subtree nobody included contributes nothing.
    expect(withCore.selection.resolved.some(file => file.includes('subs/reviews/subs/ui/'))).toBe(false);
    expect(withCore.selection.resolved.some(file => file.includes('subs/reviews/subs/validation/'))).toBe(false);
  });

  test('an empty selection is visible rather than absent, and the resolved list is what the attempt records', async () => {
    const root = await fixture();
    await mkdir(join(root, 'subs', 'workspace', 'subs', 'empty', 'src'), { recursive: true });
    const index = architectIndex([
      ...fixtureIndex.modules.values(),
      moduleEntry('collection-review/workspace/empty', 'subs/workspace/subs/empty', 'collection-review/workspace'),
    ]);
    const resolved = await resolveTestSelection({ projectRoot: root, index, policy: policy(['collection-review/workspace/empty']) });
    expect(resolved.failure).toBeNull();
    expect(resolved.selection.resolved).toEqual([]);
    expect(resolved.selection.exactOwners).toEqual(['collection-review/workspace/empty']);
  });
});

describe('K8: every resolution reads the tree as it stands', () => {
  test('scoped selection skips scratch in a testing module source area', async () => {
    const root = await fixture();
    await mkdir(join(root, 'subs/integration-tests/src/tmp'), { recursive: true });
    await writeFile(join(root, 'subs/integration-tests/src/tmp/ignored.test.ts'), '');
    await writeFile(join(root, 'subs/integration-tests/src/kept.test.ts'), '');
    const result = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex, policy: policy(['collection-review/integration-tests']),
    });
    expect(result.failure).toBeNull();
    expect(result.selection.resolved).toContain('subs/integration-tests/src/kept.test.ts');
    expect(result.selection.resolved).not.toContain('subs/integration-tests/src/tmp/ignored.test.ts');
  });

  test('a test file written after the policy was captured is selected by the next resolution', async () => {
    const root = await fixture();
    const owner = policy(['collection-review/workspace/reviews/validation']);
    const before = await resolveTestSelection({ projectRoot: root, index: fixtureIndex, policy: owner });
    expect(before.selection.resolved).toEqual(['subs/workspace/subs/reviews/subs/validation/src/tests/validate.test.ts']);

    await writeFile(join(root, 'subs/workspace/subs/reviews/subs/validation/src/tests/notes.test.ts'), 'export const written = true;\n');
    const after = await resolveTestSelection({ projectRoot: root, index: fixtureIndex, policy: owner });
    expect(after.selection.resolved).toEqual([
      'subs/workspace/subs/reviews/subs/validation/src/tests/notes.test.ts',
      'subs/workspace/subs/reviews/subs/validation/src/tests/validate.test.ts',
    ]);
  });

  test('a view that could not be refreshed is a discovery error, never a stale list', async () => {
    const root = await fixture();
    const resolved = await resolveTestSelection({ projectRoot: root, index: null, policy: policy(['collection-review/workspace/reviews']) });
    expect(resolved.failure).toMatchObject({ failed: 'discovery-error' });
    expect(resolved.selection.resolved).toEqual([]);
  });

  test('an owner the refreshed view no longer has is a discovery error', async () => {
    const root = await fixture();
    const resolved = await resolveTestSelection({ projectRoot: root, index: fixtureIndex, policy: policy(['collection-review/workspace/gone']) });
    expect(resolved.failure).toMatchObject({ failed: 'discovery-error' });
    expect(resolved.failure?.detail).toContain('collection-review/workspace/gone');
  });

  test('a required suite that is not in the tree cannot disappear through rediscovery', async () => {
    const root = await fixture();
    const required = 'subs/workspace/subs/contracts/src/tests/conformance.test.ts';
    const missing = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex,
      policy: policy(['collection-review/workspace/reviews'], [], [required]),
    });
    expect(missing.failure).toMatchObject({ failed: 'required-suite-missing' });

    await writeFile(join(root, required), 'export const conformed = true;\n');
    const present = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex,
      policy: policy(['collection-review/workspace/reviews'], [], [required]),
    });
    expect(present.failure).toBeNull();
    expect(present.selection.resolved).toContain(required);
  });

  test('a discovery failure and an empty required selection each stop the checkpoint before a command runs', async () => {
    const root = await fixture();
    const commands = {
      typeCheck: checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 1000 }),
      allTests: checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 1000 }),
      scopedTests: checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 1000 }),
      ramifyCheck: checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 1000 }),
      nestedPackages: [],
    };
    const discovery = await resolveTestSelection({ projectRoot: root, index: null, policy: policy(['collection-review/workspace/reviews']) });
    const [failure] = await verifyChecks(scopedChecks(commands, discovery));
    expect(failure).toMatchObject({ notVerified: 'discovery-error' });

    await mkdir(join(root, 'subs', 'workspace', 'subs', 'empty', 'src'), { recursive: true });
    const index = architectIndex([
      ...fixtureIndex.modules.values(),
      moduleEntry('collection-review/workspace/empty', 'subs/workspace/subs/empty', 'collection-review/workspace'),
    ]);
    const empty = await resolveTestSelection({ projectRoot: root, index, policy: policy(['collection-review/workspace/empty']) });
    const [emptyFailure] = await verifyChecks(scopedChecks(commands, empty));
    expect(emptyFailure).toMatchObject({ notVerified: 'empty-selection' });
  });
});

describe('where an owner keeps the tests a gate runs', () => {
  test('ordinary source keeps them in src/tests; a testing module\'s whole source area is test code', async () => {
    const root = await fixture();
    const ordinary = fixtureIndex.modules.get('collection-review/workspace/reviews')!;
    const testing = fixtureIndex.modules.get('collection-review/integration-tests')!;
    expect(testArea(ordinary)).toBe('subs/workspace/subs/reviews/src/tests');
    expect(testArea(testing)).toBe('subs/integration-tests/src');

    // A testing module inside an included subtree contributes its ordinary
    // source, which is where its tests are.
    await writeFile(join(root, 'subs/integration-tests/src/steps/notes.test.ts'), 'export const stepped = true;\n');
    const resolved = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex,
      policy: policy(['collection-review'], ['collection-review/integration-tests']),
    });
    expect(resolved.selection.resolved).toContain('subs/integration-tests/src/steps/notes.test.ts');
  });

  test('the harness\'s own state directory holds no test of the project', async () => {
    const root = await fixture();
    const state = join(root, 'subs/workspace/subs/reviews/src/tests/.harness');
    await mkdir(state, { recursive: true });
    await writeFile(join(state, 'tsconfig.json'), '{ "files": [] }\n');
    await writeFile(join(state, 'record.test.ts'), 'export const recorded = true;\n');
    const resolved = await resolveTestSelection({ projectRoot: root, index: fixtureIndex, policy: policy(['collection-review/workspace/reviews']) });
    expect(resolved.selection.resolved.some(file => file.includes('.harness'))).toBe(false);
    await rm(state, { recursive: true, force: true });
  });
});

describe('the tests beneath an outside-modules path', () => {
  const commands = (root: string) => ({
    typeCheck: checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 1000 }),
    allTests: checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 1000 }),
    scopedTests: checkCommand({ argv: ['vitest', 'run'], cwd: root, timeoutMs: 1000 }),
    ramifyCheck: checkCommand({ argv: [process.execPath, '-e', ''], cwd: root, timeoutMs: 1000 }),
    nestedPackages: [],
  });
  const validation = 'collection-review/workspace/reviews/validation';
  const owned = 'subs/workspace/subs/reviews/subs/validation/src/tests/validate.test.ts';

  test('join the required suites: a named test file, and every test file a directory holds now', async () => {
    const root = await fixture();
    await mkdir(join(root, 'scripts', 'report', 'nested'), { recursive: true });
    await writeFile(join(root, 'scripts', 'report', 'report.ts'), 'export const report = 1;\n');
    await writeFile(join(root, 'scripts', 'report', 'report.test.ts'), 'export const reported = true;\n');
    await writeFile(join(root, 'scripts', 'report', 'nested', 'deep.spec.ts'), 'export const deep = true;\n');
    await writeFile(join(root, 'scripts', 'check.test.ts'), 'export const checked = true;\n');

    const resolved = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex,
      // A source file named on its own is no suite; a test file is.
      policy: { ...policy([validation]), outsideModules: ['scripts/check.test.ts', 'scripts/report', 'scripts/report/report.ts'] },
    });
    expect(resolved.failure).toBeNull();
    expect(resolved.outside).toEqual(['scripts/check.test.ts', 'scripts/report/nested/deep.spec.ts', 'scripts/report/report.test.ts']);
    expect(resolved.selection.extraSuites).toEqual(resolved.outside);
    expect(resolved.selection.resolved).toEqual([...resolved.outside!, owned]);
    // The record carries the files, never the policy's paths.
    expect(Object.keys(resolved.selection)).not.toContain('outsideModules');
  });

  test('a named test file that is not in the tree is a required suite missing, and an absent directory adds nothing', async () => {
    const root = await fixture();
    const missing = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex,
      policy: { ...policy([validation]), outsideModules: ['scripts/absent.test.ts'] },
    });
    expect(missing.failure).toMatchObject({ failed: 'required-suite-missing' });

    const absent = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex,
      policy: { ...policy([validation]), outsideModules: ['scripts/not-yet'] },
    });
    expect(absent.failure).toBeNull();
    expect(absent.selection.resolved).toEqual([owned]);
  });

  test('each runs on its own, so a file the runner does not select cannot pass beside the owners\' tests', async () => {
    const root = await fixture();
    await mkdir(join(root, 'scripts'), { recursive: true });
    await writeFile(join(root, 'scripts', 'a.test.ts'), 'export const a = true;\n');
    await writeFile(join(root, 'scripts', 'b.test.ts'), 'export const b = true;\n');
    const resolved = await resolveTestSelection({
      projectRoot: root, index: fixtureIndex,
      policy: { ...policy([validation]), outsideModules: ['scripts'] },
    });
    const checks = scopedChecks(commands(root), resolved).filter(check => check.kind === 'tests');
    expect(checks.map(check => check.command.argv)).toEqual([
      ['vitest', 'run', owned],
      ['vitest', 'run', 'scripts/a.test.ts'],
      ['vitest', 'run', 'scripts/b.test.ts'],
    ]);
    expect(checks.map(check => check.selection?.extraSuites)).toEqual([[], ['scripts/a.test.ts'], ['scripts/b.test.ts']]);
    expect(checks.every(check => check.requiresTests === true && check.attribution === 'in-scope')).toBe(true);
    expect(await verifyChecks(checks.map(check => ({ ...check, command: { ...check.command, argv: [process.execPath] } })))).toEqual([null, null, null]);

    // Where the owners have no test file, only the outside runs are planned:
    // a runner given no file would run the whole project.
    await mkdir(join(root, 'subs', 'workspace', 'subs', 'empty', 'src'), { recursive: true });
    const index = architectIndex([
      ...fixtureIndex.modules.values(),
      moduleEntry('collection-review/workspace/empty', 'subs/workspace/subs/empty', 'collection-review/workspace'),
    ]);
    const outsideOnly = await resolveTestSelection({
      projectRoot: root, index, policy: { ...policy(['collection-review/workspace/empty']), outsideModules: ['scripts/a.test.ts'] },
    });
    expect(scopedChecks(commands(root), outsideOnly).filter(check => check.kind === 'tests').map(check => check.command.argv))
      .toEqual([['vitest', 'run', 'scripts/a.test.ts']]);
  });
});
