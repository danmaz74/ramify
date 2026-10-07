import { rootDescription } from './helpers/root-description.js';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveContainedPath, resolveRealTarget } from '../guard/resolve-contained-path.js';
import type { ToolAction } from '../../subs/agent/src/interfaces/port.js';
import { blockExplanation, decideWrite, type GuardedScope } from '../guard/write-guard.js';
import { deniedFiles, guardedScopeOf, resolveWriteScope, scopePaths, testPolicyOf } from '../work/scope.js';
import type { WriteScope } from '../work/iterations.js';
import { temporaryDirectory } from './helpers/fixture.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

/*
 * The write guard: which targets one iteration may write, which it may not,
 * and which it could not resolve at all.
 *
 * Nothing here is a stub. Every case runs against a real directory with real
 * files, a real symlink out of the scope and a real new file in an existing
 * directory, and each one asserts the verdict, the resolved target and that
 * nothing was written.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/**
 * A project with two modules, one of which the assignment owns, a sibling it
 * does not, a contract file assigned beyond the base, a symlink out of the
 * project and a directory the bootstrap scope has not created yet.
 */
async function project() {
  const directory = await temporaryDirectory();
  cleanups.push(directory.remove);
  const root = join(directory.path, 'project');
  const outside = join(directory.path, 'elsewhere');
  await mkdir(join(root, 'subs', 'orders', 'src', 'tests'), { recursive: true });
  await mkdir(join(root, 'subs', 'orders', 'subs', 'pricing', 'src'), { recursive: true });
  await mkdir(join(root, 'subs', 'billing', 'src'), { recursive: true });
  await mkdir(join(root, 'subs', 'contracts', 'src', 'interfaces'), { recursive: true });
  await mkdir(outside, { recursive: true });

  await writeFile(join(root, 'module.ramify'), rootDescription('shop'));
  await writeFile(join(root, 'package.json'), '{}\n');
  await writeFile(join(root, 'subs', 'orders', 'module.ramify'), 'ramify 1\nmodule orders\n');
  await writeFile(join(root, 'subs', 'orders', 'README.md'), '# orders\n');
  await writeFile(join(root, 'subs', 'orders', 'src', 'orders.ts'), 'export const orders = 1;\n');
  await writeFile(join(root, 'subs', 'orders', 'src', 'tests', 'orders.test.ts'), 'export const covered = true;\n');
  await writeFile(join(root, 'subs', 'orders', 'subs', 'pricing', 'module.ramify'), 'ramify 1\nmodule pricing\n');
  await writeFile(join(root, 'subs', 'orders', 'subs', 'pricing', 'src', 'price.ts'), 'export const price = 1;\n');
  await writeFile(join(root, 'subs', 'billing', 'module.ramify'), 'ramify 1\nmodule billing\n');
  await writeFile(join(root, 'subs', 'billing', 'src', 'billing.ts'), 'export const billing = 1;\n');
  await writeFile(join(root, 'subs', 'contracts', 'src', 'interfaces', 'notes.ts'), 'export type Note = string;\n');
  await writeFile(join(outside, 'secrets.txt'), 'nothing of the project\n');
  // A real symlink inside the scope that leads out of the project.
  await symlink(outside, join(root, 'subs', 'orders', 'src', 'escape'));
  // A file where a directory would have to be, which no path can lie beneath.
  await writeFile(join(root, 'subs', 'orders', 'src', 'note.ts'), 'export const note = 1;\n');

  const index = architectIndex([
    moduleEntry('shop', '', null),
    moduleEntry('shop/orders', 'subs/orders', 'shop'),
    moduleEntry('shop/orders/pricing', 'subs/orders/subs/pricing', 'shop/orders'),
    moduleEntry('shop/billing', 'subs/billing', 'shop'),
    moduleEntry('shop/contracts', 'subs/contracts', 'shop'),
  ]);
  return { root, outside, index };
}

async function scopeOf(root: string, index: ReturnType<typeof architectIndex>, options: {
  readonly includedChildren?: readonly string[];
  readonly extra?: WriteScope['extra'];
  readonly bootstrap?: ReadonlyArray<{ directory: string }>;
} = {}): Promise<GuardedScope> {
  const scope = await resolveWriteScope({
    projectRoot: root,
    index,
    view: { status: 'placeholder' },
    revision: 3,
    base: { module: 'shop/orders', includedChildren: [...(options.includedChildren ?? [])] },
    extra: [...(options.extra ?? [])],
    read: [],
    bootstrap: (options.bootstrap ?? []).map(entry => ({
      capability: { id: 'notes', revision: 1, hash: 'a'.repeat(64) },
      directory: entry.directory,
    })),
    rationale: 'the work is here',
  });
  return guardedScopeOf(scope);
}

/** A write of the paths given, as any executor's write tool is classified. */
function writing(...paths: string[]): ToolAction {
  return { kind: 'write', paths };
}

/** Every file of the project, with its contents, so that a denial can be shown to have changed nothing. */
async function contentsOf(root: string): Promise<Record<string, string>> {
  const paths = [
    'module.ramify', 'package.json',
    'subs/orders/module.ramify', 'subs/orders/README.md', 'subs/orders/src/orders.ts',
    'subs/orders/src/note.ts', 'subs/orders/src/tests/orders.test.ts',
    'subs/orders/subs/pricing/src/price.ts', 'subs/billing/src/billing.ts',
    'subs/contracts/src/interfaces/notes.ts',
  ];
  const contents: Record<string, string> = {};
  for (const path of paths) contents[path] = await readFile(join(root, path), 'utf8');
  return contents;
}

describe('X3: allowed and denied targets', () => {
  test('the table: existing files, a new file, a traversal, a symlink and the assigned contract location', async () => {
    const { root, outside, index } = await project();
    const scope = await scopeOf(root, index, {
      includedChildren: ['shop/orders/pricing'],
      extra: [{ path: 'subs/contracts/src/interfaces/notes.ts', purpose: 'contract' }],
    });
    const before = await contentsOf(root);

    const table: ReadonlyArray<{
      readonly what: string;
      readonly target: string;
      readonly verdict: 'allowed' | 'blocked-scope' | 'blocked-unresolved';
      readonly resolved: string | null;
    }> = [
      { what: 'an existing file of the owner\'s own source', target: 'subs/orders/src/orders.ts', verdict: 'allowed', resolved: join(root, 'subs/orders/src/orders.ts') },
      { what: 'a new file in an existing directory of that source', target: 'subs/orders/src/notes-store.ts', verdict: 'allowed', resolved: join(root, 'subs/orders/src/notes-store.ts') },
      { what: 'a new file in a directory that does not exist yet', target: 'subs/orders/src/notes/store.ts', verdict: 'allowed', resolved: join(root, 'subs/orders/src/notes/store.ts') },
      { what: 'the owner\'s own test area', target: 'subs/orders/src/tests/notes.test.ts', verdict: 'allowed', resolved: join(root, 'subs/orders/src/tests/notes.test.ts') },
      { what: 'the owner\'s own declaration', target: 'subs/orders/module.ramify', verdict: 'allowed', resolved: join(root, 'subs/orders/module.ramify') },
      { what: 'an included child subtree', target: 'subs/orders/subs/pricing/src/price.ts', verdict: 'allowed', resolved: join(root, 'subs/orders/subs/pricing/src/price.ts') },
      { what: 'the contract location the assignment named', target: 'subs/contracts/src/interfaces/notes.ts', verdict: 'allowed', resolved: join(root, 'subs/contracts/src/interfaces/notes.ts') },
      { what: 'a sibling module the assignment did not name', target: 'subs/billing/src/billing.ts', verdict: 'blocked-scope', resolved: join(root, 'subs/billing/src/billing.ts') },
      { what: 'the project\'s own configuration', target: 'package.json', verdict: 'blocked-scope', resolved: join(root, 'package.json') },
      { what: 'a traversal out of the project', target: 'subs/orders/src/../../../../elsewhere/secrets.txt', verdict: 'blocked-scope', resolved: join(outside, 'secrets.txt') },
      { what: 'an absolute path outside the project', target: join(outside, 'secrets.txt'), verdict: 'blocked-scope', resolved: join(outside, 'secrets.txt') },
      { what: 'a symlink inside the scope that leads out of it', target: 'subs/orders/src/escape/secrets.txt', verdict: 'blocked-scope', resolved: join(outside, 'secrets.txt') },
      { what: 'a path beneath a file, which is no directory', target: 'subs/orders/src/note.ts/extra.ts', verdict: 'blocked-unresolved', resolved: null },
      { what: 'a call that names no path', target: '', verdict: 'blocked-unresolved', resolved: null },
    ];

    for (const row of table) {
      const decision = await decideWrite(scope, root, row.target === '' ? writing() : writing(row.target));
      expect(`${row.what}: ${decision.verdict}`).toBe(`${row.what}: ${row.verdict}`);
      expect(`${row.what}: ${decision.resolved}`).toBe(`${row.what}: ${row.resolved}`);
      expect(decision.reason).not.toBe('');
    }

    // The guard decides; it never writes. Nothing of the project changed, and
    // no path a denial named came into being.
    expect(await contentsOf(root)).toEqual(before);
    expect(existsSync(join(root, 'subs/orders/src/notes-store.ts'))).toBe(false);
    expect(readFileSync(join(outside, 'secrets.txt'), 'utf8')).toBe('nothing of the project\n');
  });

  test('a child subtree the assignment did not include is outside the scope, whatever lies beneath it', async () => {
    const { root, index } = await project();
    const without = await scopeOf(root, index);
    const withChild = await scopeOf(root, index, { includedChildren: ['shop/orders/pricing'] });

    const target = writing('subs/orders/subs/pricing/src/price.ts');
    expect((await decideWrite(without, root, target)).verdict).toBe('blocked-scope');
    expect((await decideWrite(withChild, root, target)).verdict).toBe('allowed');
    // The child's own declaration is inside the subtree, and outside it when the subtree is not included.
    const declaration = writing('subs/orders/subs/pricing/module.ramify');
    expect((await decideWrite(without, root, declaration)).verdict).toBe('blocked-scope');
    expect((await decideWrite(withChild, root, declaration)).verdict).toBe('allowed');
  });

  test('a bootstrap scope reaches a directory that does not exist yet, and nothing beside it', async () => {
    const { root, index } = await project();
    const scope = await scopeOf(root, index, { bootstrap: [{ directory: 'subs/orders/subs/notes' }] });

    for (const target of ['subs/orders/subs/notes/module.ramify', 'subs/orders/subs/notes/README.md', 'subs/orders/subs/notes/src/notes.ts', 'subs/orders/subs/notes/src/tests/notes.test.ts']) {
      const decision = await decideWrite(scope, root, writing(target));
      expect(`${target}: ${decision.verdict}`).toBe(`${target}: allowed`);
      expect(decision.resolved).toBe(join(root, target));
    }
    // The parent's own `subs/` is not authorized, and neither is a second module beside the one proposed.
    expect((await decideWrite(scope, root, writing('subs/orders/subs/other/module.ramify'))).verdict).toBe('blocked-scope');
    expect(existsSync(join(root, 'subs/orders/subs/notes'))).toBe(false);
  });
});

describe('the files only the harness writes', () => {
  test('a feature file and the configuration are refused outright, although the scope contains them, and nothing is written', async () => {
    const { root, index } = await project();
    const feature = 'subs/orders/src/tests/features/notes/add-note.feature';
    await mkdir(join(root, 'subs/orders/src/tests/features/notes'), { recursive: true });
    await writeFile(join(root, feature), 'Feature: add-note\n');
    await writeFile(join(root, 'ramify-agent.json'), '{}\n');
    await writeFile(join(root, 'ramify-audit.json'), '{"checks":[]}\n');
    await writeFile(join(root, 'subs/orders/package.json'), '{"name":"orders"}\n');
    const resolved = await resolveWriteScope({
      projectRoot: root, index, view: { status: 'placeholder' }, revision: 3,
      // The whole project, so that only the denial stands between the agent and the two files.
      base: { modules: ['shop'], rationale: 'everything' }, extra: [], read: [], bootstrap: [], rationale: 'everything',
    });
    const denied = await deniedFiles(root, [feature, 'subs/orders/src/tests/features/notes/not-written-yet.feature']);
    expect(denied).toEqual([
      join(root, 'ramify-agent.json'), join(root, feature),
      join(root, 'subs/orders/src/tests/features/notes/not-written-yet.feature'),
    ]);
    const scope = guardedScopeOf(resolved, denied);

    for (const target of [feature, 'ramify-agent.json', `./subs/orders/src/tests/features/notes/../notes/add-note.feature`]) {
      const decision = await decideWrite(scope, root, writing(target));
      expect(decision).toMatchObject({ verdict: 'blocked-scope', denied: true, reason: expect.stringContaining('is written by the harness alone') });
      expect(blockExplanation(decision, scope)).toContain('which only the harness writes. Nothing was written.');
    }
    // A file beside them in the same directory stays the scope's to allow.
    expect((await decideWrite(scope, root, writing('subs/orders/src/tests/steps/add-note.steps.ts'))).verdict).toBe('allowed');
    expect(await readFile(join(root, feature), 'utf8')).toBe('Feature: add-note\n');
    expect(await readFile(join(root, 'ramify-agent.json'), 'utf8')).toBe('{}\n');
    expect(await decideWrite(scope, root, writing('ramify-audit.json'))).toMatchObject({ verdict: 'allowed' });
    // Without the denial the same scope allows both.
    expect((await decideWrite(guardedScopeOf(resolved), root, writing(feature))).verdict).toBe('allowed');
  });
});

describe('X5: a resolution failure is not a scope violation', () => {
  test('blocked-unresolved and blocked-scope are distinct verdicts with distinct reasons', async () => {
    const { root, index } = await project();
    const scope = await scopeOf(root, index);

    const unresolved = await decideWrite(scope, root, writing('subs/orders/src/note.ts/child.ts'));
    const violation = await decideWrite(scope, root, writing('subs/billing/src/billing.ts'));

    expect(unresolved.verdict).toBe('blocked-unresolved');
    expect(violation.verdict).toBe('blocked-scope');
    expect(unresolved.verdict).not.toBe(violation.verdict);
    expect(unresolved.reason).not.toBe(violation.reason);
    // An unresolved target has no resolved path to report, and a proven
    // violation has one: that is the difference between the two.
    expect(unresolved.resolved).toBeNull();
    expect(violation.resolved).toBe(join(root, 'subs/billing/src/billing.ts'));
  });

  test('a call that is not one write of one path is unresolved, whatever its tool is called', async () => {
    const { root, index } = await project();
    const scope = await scopeOf(root, index);
    const several = await decideWrite(scope, root, writing('subs/orders/src/orders.ts', 'subs/orders/src/note.ts'));
    const notAWrite = await decideWrite(scope, root, { kind: 'command', command: 'touch subs/orders/src/orders.ts' });
    const blank = await decideWrite(scope, root, writing('  '));

    for (const decision of [several, notAWrite, blank]) {
      expect(decision.verdict).toBe('blocked-unresolved');
      expect(decision.resolved).toBeNull();
    }
    expect(several.reason).toContain('one target per call');
    expect(notAWrite.reason).toContain('not a write');
    expect(blank.reason).toBe('the call names no path to write');
  });

  test('a symlink loop cannot be resolved, and is not reported as a scope violation', async () => {
    const { root, index } = await project();
    await symlink(join(root, 'loop-b'), join(root, 'loop-a'));
    await symlink(join(root, 'loop-a'), join(root, 'loop-b'));
    const scope = await scopeOf(root, index);

    const decision = await decideWrite(scope, root, writing('loop-a'));
    expect(decision.verdict).toBe('blocked-unresolved');
    expect(decision.resolved).toBeNull();
    expect(decision.reason).toContain('ELOOP');
  });
});

describe('what a block tells the agent', () => {
  test('it names the target and the scope, and directs the engineer to report rather than retry', async () => {
    const { root, index } = await project();
    const scope = await scopeOf(root, index);
    const decision = await decideWrite(scope, root, writing('subs/billing/src/billing.ts'));
    const text = blockExplanation(decision, scope);

    expect(text).toContain('subs/billing/src/billing.ts');
    expect(text).toContain(join(root, 'subs/orders/src'));
    expect(text).toContain('revision 3');
    expect(text).toContain('Report the need');
    expect(text).toContain('delegation');
    // It does not offer to widen the scope, and does not ask for approval.
    expect(text.toLowerCase()).not.toContain('approve');
    expect(text.toLowerCase()).not.toContain('widen the scope for you');
  });
});

describe('the lifted containment check', () => {
  test('it stays lexical: an absolute candidate and one that escapes are both refused', () => {
    expect(resolveContainedPath('/project', 'src/a.ts')).toMatchObject({ ok: true });
    expect(resolveContainedPath('/project', '/etc/passwd')).toMatchObject({ ok: false, reason: 'absolute' });
    expect(resolveContainedPath('/project', '../outside')).toMatchObject({ ok: false, reason: 'escapes-root' });
    expect(resolveContainedPath('/project', '.')).toMatchObject({ ok: false, reason: 'escapes-root' });
  });

  test('the real target of a new path is its nearest existing ancestor with the rest appended', async () => {
    const { root } = await project();
    const existing = await resolveRealTarget(root, 'subs/orders/src/orders.ts');
    expect(existing).toMatchObject({ ok: true, existed: true });

    const fresh = await resolveRealTarget(root, 'subs/orders/src/a/b/c.ts');
    expect(fresh).toMatchObject({ ok: true, existed: false, resolved: join(root, 'subs/orders/src/a/b/c.ts') });
    // Resolving it created nothing.
    expect(existsSync(join(root, 'subs/orders/src/a'))).toBe(false);
  });
});

describe('a path outside every module, assigned as outside-modules', () => {
  test('a named file and a directory are writable, new files included, and the harness\'s own files stay refused', async () => {
    const { root, index } = await project();
    await mkdir(join(root, 'scripts', 'report'), { recursive: true });
    await writeFile(join(root, 'scripts', 'report', 'report.ts'), 'export const report = 1;\n');
    await writeFile(join(root, 'ramify-agent.json'), '{}\n');
    const extra: WriteScope['extra'] = [
      { path: 'scripts/report/report.ts', purpose: 'outside-modules', reason: 'The plan requires the report to print the block.' },
      { path: 'tools/generated', purpose: 'outside-modules', kind: 'directory', reason: 'The plan requires a generator.' },
    ];
    const resolved = await resolveWriteScope({
      projectRoot: root, index, view: { status: 'placeholder' }, revision: 4,
      base: { module: 'shop/orders', includedChildren: [] }, extra, read: [], bootstrap: [], rationale: 'r',
    });
    const scope = guardedScopeOf(resolved, await deniedFiles(root, []));

    for (const target of ['scripts/report/report.ts', 'tools/generated/new.ts', 'tools/generated/deeper/new.test.ts']) {
      expect(`${target}: ${(await decideWrite(scope, root, writing(target))).verdict}`).toBe(`${target}: allowed`);
    }
    // Only what was named: a sibling of the named file is not in scope.
    expect((await decideWrite(scope, root, writing('scripts/report/other.ts'))).verdict).toBe('blocked-scope');
    const denied = await decideWrite(scope, root, writing('ramify-agent.json'));
    expect(denied).toMatchObject({ verdict: 'blocked-scope', denied: true });

    // The gate attributes findings against the same paths, so a file named
    // outside modules is inside the write scope.
    const paths = scopePaths(root, resolved);
    expect(paths.files).toContain('scripts/report/report.ts');
    expect(paths.roots).toContain('tools/generated');
    // Its reason is recorded with the scope.
    expect(resolved.extra[0]).toMatchObject({ purpose: 'outside-modules', reason: 'The plan requires the report to print the block.' });
  });

  test('the policy names the paths, so each attempt finds their tests anew', () => {
    const extra: WriteScope['extra'] = [
      { path: 'subs/contracts/src/interfaces/notes.ts', purpose: 'contract' },
      { path: 'tools/generated', purpose: 'outside-modules', kind: 'directory', reason: 'r' },
      { path: 'scripts/report.ts', purpose: 'outside-modules', reason: 'r' },
    ];
    const base = { module: 'shop/orders', includedChildren: [] };
    expect(testPolicyOf('ordinary', base, [], extra)).toEqual({
      policy: 'owned-by-scope', exactOwners: ['shop/orders'], subtrees: [], extraSuites: [], outsideModules: ['scripts/report.ts', 'tools/generated'],
    });
    // Without such a path the policy is what it always was.
    expect(testPolicyOf('ordinary', base, [], extra.slice(0, 1))).toEqual({ policy: 'owned-by-scope', exactOwners: ['shop/orders'], subtrees: [], extraSuites: [] });
  });
});
