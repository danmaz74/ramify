import { createHash } from 'node:crypto';
import { ensureScratchRule } from '../work/scratch.js';
import { engineerWorkingDirectory } from '../work/engineer-directory.js';
import type { WriteScope } from '../work/iterations.js';
import { gitCandidateSource, gitChangeHistory, gitService } from '../../subs/evidence/src/git.js';
import { verifySetupLineIdentities } from '../kpi/setup-attribution.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';

const execute = promisify(execFile);
const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const directories: string[] = [];
afterEach(async () => { for (const path of directories.splice(0)) await rm(path, { recursive: true, force: true }); });
const gitEnvironment = { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0' };
async function fixture(original: string | Uint8Array = 'dist/\n') {
  const root = await mkdtemp(join(tmpdir(), 'plan23-native-trial-')); directories.push(root);
  const project = join(root, 'project'); await mkdir(project);
  const git = async (...args: string[]) => (await execute('git', ['-C', project, ...args], { env: gitEnvironment })).stdout.trim();
  await git('init', '--initial-branch=main');
  const commit = async (name: string) => { await git('add', '-A'); await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '-m', name); return git('rev-parse', 'HEAD'); };
  await writeFile(join(project, '.gitignore'), original); const base = await commit('independent BASE');
  const originalBytes = Buffer.from(original); const expected = Buffer.concat([originalBytes, Buffer.from(`${originalBytes.at(-1) === 10 ? '' : '\n'}**/src/tmp/\n`)]);
  await writeFile(join(project, '.gitignore'), expected); const setup = await commit('recorded scratch append');
  const runId = 'native-trial'; const eventsFile = join(root, 'events.jsonl');
  await writeFile(eventsFile, [
    { event: { type: 'scratch-setting-up', jobId: runId, sequence: 1, data: { originalIgnoreBase64: originalBytes.toString('base64') } } },
    { event: { type: 'scratch-setup-complete', jobId: runId, sequence: 2, data: { commit: setup, appended: true } } },
  ].map(value => JSON.stringify(value)).join('\n') + '\n');
  async function cli(final = setup) {
    const manifest = join(root, 'manifest.json'); await writeFile(manifest, JSON.stringify({ schema: 'ramify-agent.trial-attribution-input/1', project, runId, base, final, eventsFile }));
    const args = ['scripts/trial-attribution.ts', manifest];
    try { const result = await execute(join(packageRoot, 'node_modules/.bin/tsx'), args, { cwd: packageRoot, env: gitEnvironment }); return { exit: 0, result: JSON.parse(result.stdout), stdout: result.stdout, stderr: result.stderr }; }
    catch (error) { const failure = error as Error & { code: number; stdout: string; stderr: string }; return { exit: failure.code, result: failure.stdout.trim() ? JSON.parse(failure.stdout) : null, stdout: failure.stdout, stderr: failure.stderr }; }
  }
  return { root, project, git, commit, base, setup, cli, eventsFile };
}
it('public trial attribution CLI verifies the exact established scratch append from original Git objects', async () => {
  const f = await fixture(); const outcome = await f.cli();
  expect(outcome).toMatchObject({ exit: 0, result: { state: 'verified', verification: 'setup-only', setupOnly: true, added: 1, deleted: 0, nonSetup: { added: 0, deleted: 0, bytesChanged: false, modeChanged: false } } });
  expect(outcome.result.identities.entries).toContainEqual({ commit: f.setup, path: '.gitignore', added: [2], deleted: [] });
}, 30_000);
it('public trial attribution CLI attributes missing EOF newline replacement as two setup additions and one deletion', async () => {
  const f = await fixture('dist/'); const outcome = await f.cli();
  expect(outcome).toMatchObject({ exit: 0, result: { state: 'verified', setupOnly: true, added: 2, deleted: 1 } });
  expect(outcome.result.identities.entries).toContainEqual({ commit: f.setup, path: '.gitignore', added: [1, 2], deleted: [1] });
}, 30_000);
it('public trial attribution CLI preserves shifted setup identities and retains later same-file agent lines', async () => {
  const f = await fixture(); await writeFile(join(f.project, '.gitignore'), 'agent-cache/\ndist/\n**/src/tmp/\n'); const final = await f.commit('agent insertion'); const outcome = await f.cli(final);
  expect(outcome).toMatchObject({ exit: 1, result: { state: 'verified', setupOnly: false, added: 1, deleted: 0, nonSetup: { added: 1, deleted: 0 } } });
  expect(outcome.result.identities.entries).toContainEqual({ commit: f.setup, path: '.gitignore', added: [3], deleted: [] });
}, 30_000);
it('public trial attribution CLI proves reverted setup empty without exempting remaining agent lines', async () => {
  const f = await fixture(); await writeFile(join(f.project, '.gitignore'), 'dist/\nagent-cache/\n'); const final = await f.commit('revert setup retain agent');
  expect(await f.cli(final)).toMatchObject({ exit: 1, result: { state: 'verified', setupOnly: false, added: 0, deleted: 0, nonSetup: { added: 1, deleted: 0 } } });
  await writeFile(join(f.project, '.gitignore'), 'dist/\n'); const reverted = await f.commit('fully reverted');
  expect(await f.cli(reverted)).toMatchObject({ exit: 0, result: { state: 'verified', verification: 'unchanged', setupOnly: false, added: 0, deleted: 0 } });
}, 30_000);
it('public trial attribution CLI refuses mixed unknown binary dirty and symlink setup exemptions', async () => {
  const mixed = await fixture(); await writeFile(join(mixed.project, '.gitignore'), 'dist/\n**/src/tmp/\nagent-cache/\n'); await mixed.git('add', '.gitignore'); await mixed.git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@localhost', 'commit', '--amend', '--no-edit');
  // First retain independent stale-chain refusal, then point original durable record at the ACTUAL mixed containing commit.
  expect(await mixed.cli(await mixed.git('rev-parse', 'HEAD'))).toMatchObject({ exit: 2, result: { state: 'unavailable', setupOnly: false } });
  const actualMixed = await mixed.git('rev-parse', 'HEAD'); const mixedRecords = (await readFile(mixed.eventsFile, 'utf8')).trim().split('\n').map(line => JSON.parse(line)); mixedRecords[1].event.data.commit = actualMixed; await writeFile(mixed.eventsFile, mixedRecords.map(value => JSON.stringify(value)).join('\n') + '\n'); expect(await mixed.cli(actualMixed)).toMatchObject({ exit: 2, result: { state: 'unavailable', reason: 'Containing setup blob includes unrecorded changes; exact setup identity unavailable', setupOnly: false } });
  const binary = await fixture(Buffer.from([0xff, 0x0a])); expect(await binary.cli()).toMatchObject({ exit: 2, result: { state: 'unavailable', setupOnly: false } });
  const unicode = await fixture('dist-\ufffd/\n'); expect(await unicode.cli()).toMatchObject({ exit: 0, result: { setupOnly: true, added: 1, deleted: 0 } });
  await writeFile(join(unicode.project, '.gitignore'), 'dirty/\n'); expect(await unicode.cli()).toMatchObject({ exit: 1, result: { nonSetup: { bytesChanged: true } } });
  await writeFile(join(unicode.project, '.gitignore'), 'dist-\ufffd/\n**/src/tmp/\n'); await chmod(join(unicode.project, '.gitignore'), 0o755); expect(await unicode.cli()).toMatchObject({ exit: 1, result: { nonSetup: { modeChanged: true } } });
  await rm(join(unicode.project, '.gitignore')); await symlink(join(unicode.root, 'missing'), join(unicode.project, '.gitignore')); const link = await unicode.cli(); expect(link.exit).toBe(2); expect(link.stderr).toContain('not a regular file');
}, 30_000);
it('prepared trial tool uses actual assigned module src cwd and external report destination', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'plan23-prepared-native-')); directories.push(parent);
  const prepared = await execute(process.execPath, ['--import', 'tsx', 'scripts/live-trial.ts', 'prepare', '--no-install', '--into', parent], { cwd: packageRoot, env: gitEnvironment }); expect(prepared.stdout).toContain('collection-review');
  const project = join(parent, 'collection-review'); const directory = 'subs/workspace/subs/shared-ui'; const owner = 'collection-review/workspace/shared-ui';
  const scope = { base: { module: owner, included: [] }, extra: [], read: [], bootstrap: [], rationale: 'native prepared fixture', revision: 1, resolved: { roots: [join(project, directory)], files: [], included: [], excluded: [], view: { status: 'placeholder' }, ownership: { provider: 'ramify.affected-cli/4', ramifyVersion: 'native', inputId: 'fixed', configuration: 'tsconfig.json', root: project, modules: [{ id: owner, parent: 'collection-review/workspace', directory }], exclusions: [] } } } as WriteScope;
  const index = { revision: 'fixed', input: 'fixed', symbols: new Map(), modules: new Map([[owner, { module: owner, dir: directory, parent: 'collection-review/workspace', children: [], tags: [], areas: ['src'] }]]) };
  expect(await ensureScratchRule(project, [directory], gitService)).toEqual({ appended: true }); const cwd = await engineerWorkingDirectory(project, scope, index, gitService); expect(cwd).toBe(join(project, directory, 'src'));
  await execute(process.execPath, ['--input-type=module', '--eval', "import {writeFile} from 'node:fs/promises'; await writeFile('status.ts', 'export const status = 1;\\n');"], { cwd });
  expect(await readFile(join(project, directory, 'src/status.ts'), 'utf8')).toBe('export const status = 1;\n'); expect(scope.resolved.ownership.modules[0]!.directory).toBe(directory);
  const destination = join(parent, 'report.json'); const guard = (target: string) => execute(process.execPath, ['--import', 'tsx', 'scripts/plan23-live-session.ts', '--trial-report-destination', project, target], { cwd: packageRoot });
  expect(JSON.parse((await guard(destination)).stdout).destination).toBe(destination); await expect(guard(join(project, 'report.json'))).rejects.toMatchObject({ code: 1 }); await symlink(join(project, 'module.ramify'), destination); await expect(guard(destination)).rejects.toMatchObject({ code: 1 });
}, 30_000);
it('native Git authenticates renamed nested-project source positions and arbitrary setup-before deletions', async () => {
  const f = await fixture(); const prefix = 'subs/nested/'; const project = join(f.project, 'subs/nested'); await mkdir(project, { recursive: true });
  const tail = Array.from({ length: 24 }, (_, index) => `stable-independent-${index}/\n`).join(''); const original = 'keep/\nobsolete/\n' + tail; await writeFile(join(project, '.gitignore'), original); const base = await f.commit('nested BASE'); const beforeText = 'agent-cache/\nkeep/\nobsolete/\n' + tail; await writeFile(join(project, '.gitignore'), beforeText); const before = await f.commit('before boundary insertion'); const afterText = 'agent-cache/\nkeep/\n**/src/tmp/\n' + tail; await writeFile(join(project, '.gitignore'), afterText); const setup = await f.commit('exact independently recorded source delta'); await mkdir(join(project, 'config')); await f.git('mv', `${prefix}.gitignore`, `${prefix}config/ignore`); await writeFile(join(project, 'config/ignore'), 'agent-extra/\n' + afterText); const final = await f.commit('rename and shift');
  const sha = (text: string) => createHash('sha256').update(text).digest('hex');
  async function authenticated(revision: string, path: string, expected: string) { const row = (await gitCandidateSource.treeEntries(project, revision)).find(entry => entry.path === prefix + path)!; const text = await gitCandidateSource.readBlob(project, revision, prefix + path); const bytes = Buffer.from(text); expect(text).toBe(expected); expect(row.bytes).toBe(bytes.length); expect(createHash(row.objectId!.length === 40 ? 'sha1' : 'sha256').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex')).toBe(row.objectId); return sha(text); }
  const beforeHash = await authenticated(before, '.gitignore', beforeText); const afterHash = await authenticated(setup, '.gitignore', afterText); await authenticated(base, '.gitignore', original); await authenticated(final, 'config/ignore', 'agent-extra/\n' + afterText);
  const files = await gitChangeHistory.changedFiles(project, base, final); expect(files).toHaveLength(1); const direct = files[0]!; expect(direct).toMatchObject({ before: '.gitignore', after: 'config/ignore', binary: false, deleted: [[2, 1]] }); expect(direct.added.flatMap(([line, count]) => Array.from({ length: count }, (_, offset) => line + offset))).toEqual([1, 2, 4]); const chain = [base, ...await gitChangeHistory.commitsBetween(project, base, final)]; expect(chain).toEqual([base, before, setup, final]);
  const origins = await gitChangeHistory.lineOrigins(project, base, final, direct.after!, direct.added); const lastSeen = await gitChangeHistory.lineLastSeen(project, base, final, direct.before!, direct.deleted); const boundary = await gitChangeHistory.lineLastSeen(project, base, before, '.gitignore', [[2, 1]]);
  expect(origins.find(row => row.line === 4)).toMatchObject({ commit: setup, sourceLine: 3, sourcePath: prefix + '.gitignore', projectPrefix: prefix }); expect(lastSeen[0]!.commit).toBe(before); expect(boundary[0]).toMatchObject({ commit: before, sourceLine: 3, sourcePath: prefix + '.gitignore', projectPrefix: prefix });
  const sourceAdded = [{ line: 3, hash: sha('**/src/tmp/\n') }]; const sourceDeleted = [{ line: 3, hash: sha('obsolete/\n') }]; const lines = ['agent-extra/\n', 'agent-cache/\n', 'keep/\n', '**/src/tmp/\n'];
  const result = verifySetupLineIdentities({ runId: 'native-delta', base, final, firstParentCommits: chain, records: [{ id: 'exact-source', runId: 'native-delta', path: '.gitignore', beforeRevision: before, commit: setup, beforeBlobHash: beforeHash, afterBlobHash: afterHash, added: sourceAdded, deleted: sourceDeleted }], candidates: [...origins.map(row => ({ commit: row.commit, path: 'config/ignore', kind: 'added' as const })), { commit: setup, path: '.gitignore', kind: 'deleted' }], facts: [{ recordId: 'exact-source', base, final, beforeRevision: before, commit: setup, beforeBlobHash: beforeHash, afterBlobHash: afterHash, sourceAdded, sourceDeleted, beforePath: '.gitignore', afterPath: 'config/ignore', finalAdded: origins.map(row => ({ line: row.line, hash: sha(lines[row.line - 1]!), originCommit: row.commit, originPath: row.sourcePath!.slice(prefix.length), originLine: row.sourceLine!, boundary: row.boundary })), baseDeleted: [{ line: 2, hash: sha('obsolete/\n'), lastSeenCommit: lastSeen[0]!.commit, removingCommit: setup, sourceBeforePath: boundary[0]!.sourcePath!.slice(prefix.length), sourceBeforeLine: boundary[0]!.sourceLine! }] }] });
  expect(result.entries).toContainEqual({ commit: setup, path: 'config/ignore', added: [4], deleted: [] }); expect(result.entries).toContainEqual({ commit: setup, path: '.gitignore', added: [], deleted: [2] }); expect(result.entries.filter(entry => entry.commit !== setup).every(entry => entry.added?.length === 0)).toBe(true);
}, 30_000);
