import { RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import { placementDecisions } from '../guard/write-guard.js';
import { outsideScope } from '../run/mutations.js';
import { scopeBodySchema } from '../work/assignment.js';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { ToolAction } from '../../subs/agent/src/interfaces/port.js';
import { decideWrite, type GuardedScope } from '../guard/write-guard.js';
import { runGate } from '../checks/gate.js';
import { checkCommand } from '../checks/records.js';
import { createPassingCheckExecution } from './helpers/direct-check-execution.js';
import { scopeConfigurationPaths, captureGuardedFiles, deniedFiles, guardedScopeOf, resolveWriteScope } from '../work/scope.js';
import type { WriteScope } from '../work/iterations.js';
import { temporaryDirectory } from './helpers/fixture.js';

import { writeGuardProject } from './helpers/write-guard-fixture.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0)) await cleanup(); });
const project = () => writeGuardProject(cleanups);
function writing(...paths: string[]): ToolAction { return { kind: 'write', paths }; }

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
