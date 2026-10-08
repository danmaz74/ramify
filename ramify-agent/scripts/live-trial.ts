/*
 * The loop trial: an implementation run on a disposable copy of the
 * `collection-review` fixture, with the fixture's own toolchain installed, and
 * the check afterwards that the run changed the project only where a recorded
 * write scope allowed it.
 *
 *   npm run trial -- prepare [--plan <plan-id>] [--into <directory>] [--no-install]
 *   npm run trial -- verify <project> [--run <run-id>] [--json <file>]
 *
 * `prepare` copies the fixture, runs `npm ci` in the copy from its committed
 * lockfile, makes the copy a git repository with one commit, and records that
 * commit as the baseline beside the copy. The fixture itself is never
 * written. It prints the commands that start the harness on the copy.
 *
 * `verify` compares every file outside the harness's own directories and
 * Ramify's generated views, which git ignores, with the baseline commit, and
 * holds each changed path to the run's records: it lies inside a write scope
 * an assignment recorded, or it is in an invocation's `outsideScope` and in
 * the evaluation the harness serves. A change in neither is a defect of the
 * loop. The evaluation is read over the harness's own HTTP protocol, from a
 * server `verify` starts on the copy and stops before it returns.
 *
 * Exit status: 0 when every change is accounted for, 1 when one is not, 2
 * when the check could not run.
 */
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdtemp, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(packageRoot, 'subs', 'harness', 'fixtures', 'collection-review');
const baselineName = 'loop-trial-baseline.json';

interface Baseline {
  readonly schema: 'ramify-agent.loop-trial-baseline/1';
  readonly project: string;
  readonly plan: string;
  readonly commit: string;
  readonly install: { readonly command: string; readonly exitCode: number | null; readonly tail: string } | null;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

/** The environment a child gets: this one's, without the Node flags this process was started with. */
function childEnvironment(): NodeJS.ProcessEnv {
  const { NODE_OPTIONS: _options, ...rest } = process.env;
  return rest;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', cwd, '-c', 'user.name=ramify-agent trial', '-c', 'user.email=trial@ramify-agent.invalid', ...args], {
    maxBuffer: 64 * 1024 * 1024,
    env: { ...childEnvironment(), GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' },
  });
  return stdout;
}

async function prepare(): Promise<number> {
  const plan = option('--plan') ?? 'review-notes';
  if (!existsSync(join(fixture, 'plans', plan, 'plan.md'))) {
    console.error(`The fixture has no plan "${plan}"`);
    return 2;
  }
  const into = option('--into');
  const parent = into ? resolve(into) : await mkdtemp(join(tmpdir(), 'ramify-agent-loop-trial-'));
  const project = join(parent, 'collection-review');
  if (existsSync(project)) {
    console.error(`${project} already exists`);
    return 2;
  }
  await cp(fixture, project, { recursive: true, filter: source => !source.split(sep).includes('node_modules') });

  let install: Baseline['install'] = null;
  if (!process.argv.includes('--no-install')) {
    const command = 'npm ci --no-audit --no-fund';
    const result = await new Promise<{ exitCode: number | null; output: string }>(done => {
      const child = spawn('npm', ['ci', '--no-audit', '--no-fund'], { cwd: project, env: childEnvironment(), stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', chunk => { output += String(chunk); });
      child.stderr.on('data', chunk => { output += String(chunk); });
      child.on('close', exitCode => done({ exitCode, output }));
    });
    install = { command, exitCode: result.exitCode, tail: result.output.slice(-2000) };
    console.log(`${command} in the copy exited ${result.exitCode}.`);
    if (result.exitCode !== 0) {
      console.error(result.output.slice(-4000));
      console.error('The fixture\'s toolchain could not be installed, so the copy cannot pass readiness. Nothing further was done.');
      return 2;
    }
  }

  await git(project, 'init', '--quiet', '--initial-branch=main');
  await git(project, 'add', '--all');
  await git(project, 'commit', '--quiet', '--message', 'fixture');
  const commit = (await git(project, 'rev-parse', 'HEAD')).trim();
  const baseline: Baseline = { schema: 'ramify-agent.loop-trial-baseline/1', project, plan, commit, install };
  await writeFile(join(parent, baselineName), `${JSON.stringify(baseline, null, 2)}\n`);

  console.log(`Trial copy: ${project}`);
  console.log(`Baseline: commit ${commit}, recorded in ${join(parent, baselineName)}.`);
  console.log('');
  console.log('Next, from ramify-agent/:');
  console.log('  npm run build:web');
  console.log(`  npm run serve -- --project ${project} --agent pi [--model <provider/model>]`);
  console.log(`Open the printed address, choose the plan "${plan}", and press Start. Closing the page does not stop the run.`);
  console.log(`Or, without a browser: npm run real-session -- --project ${project} --plan ${plan}`);
  console.log('');
  console.log(`Afterwards, with the harness stopped: npm run trial -- verify ${project}`);
  return 0;
}

interface Scope {
  readonly assignment: string;
  readonly roots: readonly string[];
  readonly files: readonly string[];
}

/** Every write scope the run's assignments recorded, and every path an invocation recorded outside its own. */
async function recordedScopes(runDirectory: string): Promise<{ scopes: Scope[]; outside: Map<string, string[]> }> {
  const scopes: Scope[] = [];
  const itemsDirectory = join(runDirectory, 'work-items');
  for (const item of existsSync(itemsDirectory) ? await readdir(itemsDirectory) : []) {
    const iterations = join(itemsDirectory, item, 'iterations');
    for (const number of existsSync(iterations) ? await readdir(iterations) : []) {
      const path = join(iterations, number, 'assignment.json');
      if (!existsSync(path)) continue;
      const assignment = JSON.parse(await readFile(path, 'utf8')) as { id: string; scope: { resolved: { roots: string[]; files: string[] } } };
      scopes.push({ assignment: assignment.id, roots: assignment.scope.resolved.roots, files: assignment.scope.resolved.files });
    }
  }
  const outside = new Map<string, string[]>();
  const invocationsDirectory = join(runDirectory, 'invocations');
  for (const invocation of existsSync(invocationsDirectory) ? await readdir(invocationsDirectory) : []) {
    const path = join(invocationsDirectory, invocation, 'outcome.json');
    if (!existsSync(path)) continue;
    const outcome = JSON.parse(await readFile(path, 'utf8')) as { outsideScope?: string[] };
    for (const entry of outcome.outsideScope ?? []) outside.set(entry, [...(outside.get(entry) ?? []), invocation]);
  }
  return { scopes, outside };
}

function within(path: string, root: string): boolean {
  const relation = relative(root, path);
  return relation === '' || (relation !== '..' && !relation.startsWith(`..${sep}`) && !relation.startsWith(sep));
}

/** What the harness serves as the run's evaluation, read over its own protocol from a server started for the purpose. */
async function servedOutsideScope(project: string, plan: string, runId: string): Promise<Set<string> | string> {
  const server = spawn(join(packageRoot, 'node_modules', '.bin', 'tsx'), ['src/main.ts', 'serve', '--project', project, '--port', '0'], {
    cwd: packageRoot, env: childEnvironment(), stdio: ['ignore', 'pipe', 'pipe'],
  });
  try {
    const origin = await new Promise<string>((accept, reject) => {
      let output = '';
      server.stdout.setEncoding('utf8');
      server.stdout.on('data', (chunk: string) => {
        output += chunk;
        const match = /Open (http:\/\/[^\s/]+)\//.exec(output);
        if (match) accept(match[1]!);
      });
      server.once('exit', code => reject(new Error(`the harness exited with ${code} before serving`)));
    });
    const response = await fetch(`${origin}/api/v1/plans/${plan}/runs/${runId}/metrics`);
    if (!response.ok) return `the metrics query answered ${response.status}`;
    const body = await response.json() as { evaluation: { outsideScope: Array<{ path: string }> } };
    return new Set(body.evaluation.outsideScope.map(entry => entry.path));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  } finally {
    // The server stops its private Ramify daemon before it exits, so nothing
    // is left analysing the copy.
    server.kill('SIGTERM');
    await new Promise(done => { if (server.exitCode !== null) done(undefined); else server.once('exit', done); });
  }
}

async function verify(): Promise<number> {
  const given = resolve(process.argv[3] ?? '');
  const baselinePath = join(given, '..', baselineName);
  if (!existsSync(baselinePath)) {
    console.error(`No ${baselineName} beside ${given}; give the copy that \`prepare\` printed`);
    return 2;
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as Baseline;
  // Scopes are recorded as real paths, so the copy is compared by its real path too.
  const project = await realpath(given);
  const jobs = join(project, 'plans', baseline.plan, '.harness', 'jobs');
  const runs = existsSync(jobs) ? (await readdir(jobs)).filter(name => existsSync(join(jobs, name, 'job.json'))).sort() : [];
  const runId = option('--run') ?? runs.at(-1);
  if (runId === undefined) {
    console.error(`No run of "${baseline.plan}" is in ${project}`);
    return 2;
  }
  const runDirectory = join(jobs, runId);
  const events = (await readFile(join(runDirectory, 'events.jsonl'), 'utf8')).split('\n').filter(Boolean)
    .map(line => (JSON.parse(line) as { event: { type: string } }).event.type);

  // Everything git sees as changed since the baseline, committed or not.
  // The harness's directories and Ramify's views are ignored by the fixture's
  // own .gitignore and by the .gitignore the harness writes into its state.
  const diff = (await git(project, 'diff', '--name-status', '--no-renames', baseline.commit)).trim().split('\n').filter(Boolean)
    .map(line => { const [status, path] = line.split('\t'); return { status: status!, path: path! }; });
  const untracked = (await git(project, 'ls-files', '--others', '--exclude-standard')).trim().split('\n').filter(Boolean)
    .map(path => ({ status: 'A', path }));
  const changes = [...diff, ...untracked];

  const { scopes, outside } = await recordedScopes(runDirectory);
  const served = await servedOutsideScope(project, baseline.plan, runId);

  const inScope: string[] = [];
  const recordedOutside: string[] = [];
  const defects: string[] = [];
  for (const change of changes) {
    const absolute = join(project, change.path);
    const scope = scopes.find(candidate => candidate.files.includes(absolute) || candidate.roots.some(root => within(absolute, root)));
    if (scope !== undefined) {
      inScope.push(`${change.status} ${change.path}  (${scope.assignment})`);
      continue;
    }
    const recorded = outside.get(change.path);
    const servedHere = typeof served !== 'string' && served.has(change.path);
    if (recorded !== undefined && servedHere) recordedOutside.push(`${change.status} ${change.path}  (outsideScope of ${recorded.join(', ')}, and in the evaluation)`);
    else defects.push(`${change.status} ${change.path}  (in no write scope; ${recorded === undefined ? 'in no outsideScope' : 'in outsideScope'}; ${servedHere ? 'in' : 'not in'} the evaluation)`);
  }

  const head = (await git(project, 'rev-parse', '--abbrev-ref', 'HEAD')).trim();
  const status = (await git(project, 'status', '--porcelain', '--untracked-files=all')).trim();
  const counts = {
    changed: changes.filter(change => change.status === 'M').length,
    added: changes.filter(change => change.status === 'A').length,
    deleted: changes.filter(change => change.status === 'D').length,
  };
  const report = {
    schema: 'ramify-agent.loop-trial-verification/1',
    project, plan: baseline.plan, run: runId, baseline: baseline.commit, branch: head,
    terminal: events.at(-1) ?? null,
    scopes: scopes.length,
    counts, inScope, recordedOutside, defects,
    evaluation: typeof served === 'string' ? { unavailable: served } : { outsideScope: [...served].sort() },
    status: status === '' ? [] : status.split('\n'),
  };

  console.log(`Copy: ${project}`);
  console.log(`Run: ${runId} of "${baseline.plan}", last event ${report.terminal}; ${scopes.length} recorded write scopes.`);
  console.log(`Branch ${head}; baseline ${baseline.commit}.`);
  console.log(`Changed since the baseline: ${counts.changed} modified, ${counts.added} added, ${counts.deleted} deleted.`);
  console.log(`Inside a recorded write scope: ${inScope.length}`);
  for (const line of inScope) console.log(`  ${line}`);
  console.log(`Outside every scope, and in outsideScope and in the evaluation: ${recordedOutside.length}`);
  for (const line of recordedOutside) console.log(`  ${line}`);
  if (typeof served === 'string') console.log(`The evaluation could not be read: ${served}`);
  console.log(`In neither, a defect of the loop: ${defects.length}`);
  for (const line of defects) console.log(`  ${line}`);
  console.log(`git status: ${status === '' ? 'clean' : `\n${status}`}`);
  const json = option('--json');
  if (json !== undefined) await writeFile(resolve(json), `${JSON.stringify(report, null, 2)}\n`);
  if (typeof served === 'string') return 2;
  console.log(defects.length === 0
    ? 'Every change is inside a recorded write scope, or recorded outside one and in the evaluation.'
    : 'The run changed the project outside what its records account for.');
  return defects.length === 0 ? 0 : 1;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command === 'prepare') return prepare();
  if (command === 'verify') return verify();
  console.error('Usage: npm run trial -- prepare [--plan <plan-id>] [--into <directory>] [--no-install] | verify <project> [--run <run-id>] [--json <file>]');
  return 2;
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(error);
  process.exitCode = 2;
});
