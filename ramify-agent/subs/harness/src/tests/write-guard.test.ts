import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { placementDecisions } from '../guard/write-guard.js';
import { outsideScope } from '../run/mutations.js';
import { scopeBodySchema } from '../work/assignment.js';
import { rootDescription } from './helpers/root-description.js';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { resolveContainedPath, resolveRealTarget } from '../guard/resolve-contained-path.js';
import type { ToolAction } from '../../subs/agent/src/interfaces/port.js';
import { blockExplanation, decideWrite, type GuardedScope } from '../guard/write-guard.js';
import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import { createPassingCheckExecution } from './helpers/direct-check-execution.js';
import { scopeConfigurationPaths, captureGuardedFiles, deniedFiles, guardedScopeOf, resolveWriteScope, scopePaths, testPolicyOf } from '../work/scope.js';
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
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['**/*.ts'] }));
  await writeFile(join(root, 'subs/contracts/module.ramify'), 'ramify 1\nmodule contracts\n');
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
  readonly included?: readonly { directory: string; reason: string; instructions: string }[];
  readonly extra?: WriteScope['extra'];
  readonly bootstrap?: ReadonlyArray<{ directory: string }>;
} = {}): Promise<GuardedScope> {
  const scope = await resolveWriteScope({
    projectRoot: root,
    index,
    view: { status: 'placeholder' },
    revision: 3,
    base: { module: 'shop/orders', included: [...(options.included ?? [])] },
    extra: [...(options.extra ?? [])],
    read: [],
    bootstrap: (options.bootstrap ?? []).map(entry => ({
      capability: { id: 'notes', revision: 1, hash: 'a'.repeat(64) },
      directory: entry.directory, owner: 'shop/orders/notes', parent: 'shop/orders',
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
      included: ['shop/orders/pricing'].map(module => ({ directory: module.split('/').slice(1).map(part => `subs/${part}`).join('/'), reason: 'Fixture whole child tree', instructions: 'Implement the assigned fixture behavior' })),
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
  }, 30_000);

  test('a child subtree the assignment did not include is outside the scope, whatever lies beneath it', async () => {
    const { root, index } = await project();
    const without = await scopeOf(root, index);
    const withChild = await scopeOf(root, index, { included: ['shop/orders/pricing'].map(module => ({ directory: module.split('/').slice(1).map(part => `subs/${part}`).join('/'), reason: 'Fixture whole child tree', instructions: 'Implement the assigned fixture behavior' })) });

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
      base: { modules: ['shop', 'shop/orders'], rationale: 'everything' }, extra: [], read: [], bootstrap: [], rationale: 'everything',
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
    const scope = await scopeOf(root, index);
    await symlink(join(root, 'loop-b'), join(root, 'loop-a'));
    await symlink(join(root, 'loop-a'), join(root, 'loop-b'));

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
    expect(text).toContain(join(root, 'subs/orders'));
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


/** F1: actual installed Ramify 0.4.1 placement, separate from the scripted lifecycle controls. */
async function f1() {
  const directory = await temporaryDirectory(); cleanups.push(directory.remove); const root = directory.path;
  const files: Record<string, string> = {
    'module.ramify': 'ramify 1\nroot module app\nowned-unwired "docs"\nowned-nested-project "fixture"\nexternal "cache"\n',
    'package.json': '{}', 'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', outDir: 'fixture/dist' }, include: ['**/*.ts'] }),
    'src/root.ts': 'export const root = 1;\n', 'docs/guide.ts': 'this is intentionally not TypeScript', 'fixture/README.md': '# Independent project',
    'fixture/module.ramify': 'ramify 1\nroot module independent\n', 'fixture/AGENTS.md': 'Use this independent project root for verification.',
    'subs/group/physical/module.ramify': 'ramify 1\nmodule a\nowned-nested-project "project"\nexternal "cache"\n',
    'subs/group/physical/src/a.ts': 'export const a = 1;\n', 'subs/group/physical/project/README.md': '# Child independent project',
    'subs/group/physical/subs/other/module.ramify': 'ramify 1\nmodule deep\n', 'subs/group/physical/subs/other/src/deep.ts': 'export const deep = 1;\n',
    'subs/physical-b/module.ramify': 'ramify 1\nmodule b\n', 'subs/physical-b/src/b.ts': 'export const b = 1;\n',
  };
  for (const [path, text] of Object.entries(files)) { await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), text); }
  await mkdir(join(root, 'cache'), { recursive: true }); await mkdir(join(root, 'subs/group/physical/cache'), { recursive: true });
  await symlink(join(root, 'src'), join(root, 'cache/back'));
  await symlink(join(root, 'cache'), join(root, 'src/escape'));
  await symlink(join(root, 'subs/physical-b'), join(root, 'src/sibling'));
  const calls: Array<{ executable: string; argv: string[]; elapsedMs: number; answer: unknown }> = [];
  class F1RamifyCli extends RamifyCli {
    override async queryOwnership(projectRoot: string, paths: readonly string[] = ['.']) {
      const started = performance.now(); const answer = await super.queryOwnership(projectRoot, paths);
      calls.push({ executable: join(process.cwd(), 'node_modules/.bin/ramify'), argv: ['affected', '--batch', '--root', projectRoot, '--format', 'json', ...paths.flatMap(path => ['--path', path])], elapsedMs: performance.now() - started, answer });
      if (process.env.PLAN21_F1_EVIDENCE !== undefined) {
        const evidence = JSON.stringify({ label: 'F1 actual installed provider', root, fixtureFiles: files, nestedRoot: 'fixture/module.ramify: root module independent', calls }, null, 2);
        await writeFile(process.env.PLAN21_F1_EVIDENCE, evidence);
        await writeFile(`${process.env.PLAN21_F1_EVIDENCE}.${basename(root)}.json`, evidence);
      }
      return answer;
    }
  }
  const ramify = new F1RamifyCli();
  const capture = (included: Array<{ directory: string; reason: string; instructions: string }> = [], extra: WriteScope['extra'] = []) => resolveWriteScope({ projectRoot: root, ramify, index: null, view: { status: 'placeholder' }, revision: 1,
    base: { module: 'app', included }, extra, read: [], bootstrap: [], rationale: 'F1 actual installed CLI conformance' });
  return { root, ramify, capture };
}
const inclusion = (directory: string) => ({ directory, reason: 'Implement this whole assigned tree', instructions: 'Use the project instructions and verify the requested change' });

test('PB3-S01–S05 S09: F1 whole owners, named physical children, independent trees and hard exclusions share tool/candidate decisions', async () => {
  const { root, ramify, capture } = await f1();
  const child = 'subs/group/physical';
  const scope = await capture([inclusion(child), inclusion('fixture')], [{ path: 'cache/extra.txt', purpose: 'contract' }, { path: 'fixture/.git/config', purpose: 'fake-injection' }]);
  expect(scope.resolved.included.map(entry => [entry.kind, entry.owner])).toEqual([['child-subtree', 'app/a'], ['owned-nested-project', 'app']]);
  expect(scope.resolved.included[1]!.projectInstructions).toContainEqual({ path: 'fixture/AGENTS.md', text: 'Use this independent project root for verification.' });
  expect(scope.resolved.ownership.ramifyVersion).toBe('0.4.1');
  const allowed = ['README.md', 'scripts/new.ts', 'docs/new.md', 'docs/new.ts', 'docs/new.mts', 'docs/new.mjs', 'docs/module.ramify', 'src/tmp/module.ramify', 'fixture/module.ramify', 'fixture/new.txt', 'dist/ordinary.txt', 'docs/dist/ordinary.txt', `${child}/notes.md`, `${child}/scripts/tool.ts`, `${child}/subs/other/src/new.ts`];
  const blocked = ['subs/physical-b/src/b.ts', `${child}/project/new.txt`, `${child}/cache/new.txt`, 'cache/new.txt', 'cache/back/new.txt', 'src/escape/new.txt', 'src/sibling/src/new.ts', 'fixture/dist/absent.ts', '.git/new', 'node_modules/new', 'src/.ramify/new', 'fixture/.git/config', 'fixture/node_modules/new', 'fixture/src/.ramify/new', 'docs/.git/config', 'docs/node_modules/new', 'docs/src/.ramify/new', 'src/tmp/.git/config', 'src/tmp/node_modules/new', 'src/tmp/src/.ramify/new', 'cache/extra.txt'];
  const guard = guardedScopeOf(scope, [], ramify);
  const decisions = await placementDecisions(guard, root, [...allowed, ...blocked]);
  expect(Object.fromEntries([...allowed, ...blocked].map((path, index) => [path, decisions[index]]))).toEqual(Object.fromEntries([...allowed.map(path => [path, true]), ...blocked.map(path => [path, false])]));
  expect(await outsideScope(root, guard, [...allowed, ...blocked])).toEqual(blocked);
  expect((await decideWrite(guard, root, writing('scripts/new.ts'))).verdict).toBe('allowed');
  expect((await decideWrite(guard, root, writing('cache/back/new.txt'))).verdict).toBe('blocked-scope');
  const reopened = guardedScopeOf(JSON.parse(JSON.stringify(scope)) as WriteScope, [], ramify);
  expect(await placementDecisions(reopened, root, ['fixture/new.txt', `${child}/project/new.txt`])).toEqual([true, false]);
  const narrow = await resolveWriteScope({ projectRoot: root, ramify, index: null, view: { status: 'placeholder' }, revision: 1, base: { module: 'app/a', included: [] }, extra: [], read: [], bootstrap: [], rationale: 'Prefix collision control' });
  expect(await placementDecisions(guardedScopeOf(narrow, [], ramify), root, [`${child}/notes.md`, `${child}-prefix/new.txt`])).toEqual([true, false]);
  const broad = await resolveWriteScope({ projectRoot: root, ramify, index: null, view: { status: 'placeholder' }, revision: 1,
    base: { modules: ['app', 'app/a', 'app/a/deep', 'app/b'], rationale: 'Recorded multi-owner breaking authority' },
    extra: [{ path: 'cache/extra.txt', purpose: 'contract' }, { path: 'fixture/.git/config', purpose: 'fake-injection' }], read: [], bootstrap: [], rationale: 'F1 breaking/contract hard precedence' });
  const hard = ['cache/extra.txt', `${child}/cache/new.txt`, 'fixture/dist/absent.ts', '.git/new', 'node_modules/new', 'src/.ramify/new', 'docs/.git/config', 'docs/node_modules/new', 'docs/src/.ramify/new', 'fixture/.git/config'];
  expect(await placementDecisions(guardedScopeOf(broad, [], ramify), root, hard)).toEqual(hard.map(() => false));
  expect(await outsideScope(root, guardedScopeOf(broad, [], ramify), hard)).toEqual(hard);
  const both = await capture([inclusion(child), inclusion(`${child}/project`)]);
  expect(await placementDecisions(guardedScopeOf(both, [], ramify), root, [`${child}/project/new.txt`])).toEqual([true]);
  for (const invalid of ['subs/group', `${child}/subs/other`, `${child}/project/README.md`, 'cache', 'missing']) await expect(capture([inclusion(invalid)])).rejects.toThrow(/whole immediate child subtree|owned-nested-project/u);
  expect(scopeBodySchema.safeParse({ base: { module: 'app', included: [{ ...inclusion(child), owner: 'app/a' }] }, extra: [], read: [], rationale: 'r' }).success).toBe(false);
  expect(scopeBodySchema.safeParse({ base: { module: 'app', included: [] }, extra: [{ path: 'scripts/new.ts', purpose: 'outside-modules', reason: 'r' }], read: [], rationale: 'r' }).success).toBe(false);
}, 60_000);

test('PB3-S06: actual changed declarations narrow an invocation and restart; removed captured exclusions never widen', async () => {
  const { root, ramify, capture } = await f1();
  const scope = await capture(); const guard = guardedScopeOf(scope, [], ramify);
  await mkdir(join(root, 'new-external'), { recursive: true });
  expect(await placementDecisions(guard, root, ['new-external/absent.txt'])).toEqual([true]);
  const declaration = await readFile(join(root, 'module.ramify'), 'utf8');
  await writeFile(join(root, 'module.ramify'), declaration + 'external "new-external"\n');
  expect(await placementDecisions(guard, root, ['new-external/absent.txt'])).toEqual([false]);
  await writeFile(join(root, 'module.ramify'), declaration.replace('external "cache"\n', ''));
  expect(await placementDecisions(guard, root, ['cache/absent.txt'])).toEqual([false]);
  expect(await placementDecisions(guardedScopeOf(JSON.parse(JSON.stringify(scope)) as WriteScope, [], ramify), root, ['cache/absent.txt'])).toEqual([false]);
}, 30_000);

test('PB3-S07: unavailable placement and mismatched bootstrap identities cannot grant writes', async () => {
  const { root, index } = await project();
  expect((await decideWrite({ revision: 1, roots: [root], files: [] } as unknown as GuardedScope, root, writing('README.md'))).verdict).toBe('blocked-scope');
  await expect(resolveWriteScope({ projectRoot: root, index, view: { status: 'placeholder' }, revision: 1,
    base: { module: 'shop/billing/notes', included: [] }, extra: [], read: [], rationale: 'r',
    bootstrap: [{ owner: 'shop/orders/notes', parent: 'shop/orders', directory: 'subs/orders/subs/physical', capability: { id: 'c', revision: 1, hash: 'h' } }] })).rejects.toThrow(/no assigned owner/u);
});

test('PB3-S04 P04: intercepted and direct candidate-classifier controls cannot bypass captured inputs or harness state', async () => {
  const { root, ramify, capture } = await f1();
  await mkdir(join(root, 'plans/plan/.harness/jobs/run'), { recursive: true });
  await writeFile(join(root, 'plans/plan/plan.md'), '# Captured plan');
  const scope = await capture();
  const guard = guardedScopeOf(scope, await deniedFiles(root, ['plans/plan/plan.md']), ramify);
  const paths = ['plans/plan/plan.md', 'plans/plan/.harness/jobs/run/job.json', 'plans/.harness/sessions/new/session.json'];
  for (const path of paths) {
    expect((await decideWrite(guard, root, writing(path))).verdict).toBe('blocked-scope');
    await mkdir(join(root, path, '..'), { recursive: true }); await writeFile(join(root, path), 'actual shell-style bypass mutation');
  }
  expect(await outsideScope(root, guard, paths)).toEqual(paths);
}, 30_000);

test('PB3-P04: explicitly included independent project configs are guarded without workspace membership', async () => {
  const { root, ramify, capture } = await f1();
  await writeFile(join(root, 'fixture/package.json'), '{"name":"independent"}');
  const scope = await capture([inclusion('fixture')]);
  const paths = scopeConfigurationPaths(scope);
  expect(paths).toContain('fixture/vitest.config.ts');
  expect(paths).toContain('fixture/package-lock.json');
  const guarded = await captureGuardedFiles(root, [], {}, paths);
  expect(guarded).toContainEqual({ path: 'fixture/vitest.config.ts', hash: null });
  const guard = guardedScopeOf(scope, await deniedFiles(root, guarded.map(file => file.path)), ramify);
  expect((await decideWrite(guard, root, writing('fixture/vitest.config.ts'))).verdict).toBe('blocked-scope');
  await writeFile(join(root, 'fixture/vitest.config.ts'), 'export default {};');
  await rm(join(root, 'fixture/package.json'));
  const request = { id: 'ga-0001', projectRoot: root, directory: join(root, 'gates/ga-0001'), head: 'a'.repeat(40), guarded,
    checks: [{ kind: 'type-check' as const, command: checkCommand({ argv: ['true'], cwd: root, timeoutMs: 30000 }) }] };
  const denied = await runGate(createPassingCheckExecution(), 'iteration', request);
  expect(denied).toMatchObject({ verdict: 'failed', cause: 'guarded-change' });
  const authorized = await runGate(createPassingCheckExecution(), 'iteration', { ...request, id: 'ga-0002', directory: join(root, 'gates/ga-0002'),
    authorizations: ['fixture/vitest.config.ts', 'fixture/package.json'].map(path => ({ path, by: { id: 'it-0001', revision: 1, hash: 'a'.repeat(64) } })) });
  expect(authorized.verdict).toBe('passed');
  await writeFile(join(root, 'fixture/vitest.config.ts'), 'export default { changed: true };');
  const modified = await runGate(createPassingCheckExecution(), 'iteration', { ...request, id: 'ga-0003', directory: join(root, 'gates/ga-0003') });
  expect(modified.verdict).toBe('failed');
}, 30000);

test('PB3-S06: removing child declarations cannot widen capture; included child removal remains within both permissions', async () => {
  const { root, ramify, capture } = await f1(); const child = 'subs/group/physical';
  const excluded = await capture(); const included = await capture([inclusion(child)]);
  await rm(join(root, child, 'module.ramify'));
  const paths = [`${child}/src/a.ts`, `${child}/new/absent.ts`];
  const answer = await ramify.queryOwnership(root, paths);
  expect(answer.selection.paths.map(path => path.module)).toEqual(['app', 'app']);
  const guard = guardedScopeOf(excluded, [], ramify);
  expect(await placementDecisions(guard, root, paths)).toEqual([false, false]);
  expect(await outsideScope(root, guard, paths)).toEqual(paths);
  expect((await decideWrite(guard, root, writing(paths[0]!))).verdict).toBe('blocked-scope');
  const restarted = guardedScopeOf(JSON.parse(JSON.stringify(excluded)) as WriteScope, [], ramify);
  expect(await placementDecisions(restarted, root, paths)).toEqual([false, false]);
  expect(await placementDecisions(guardedScopeOf(included, [], ramify), root, paths)).toEqual([true, true]);
}, 30000);
