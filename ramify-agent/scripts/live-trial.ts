/*
 * The live trial of Plan 1: a real architect session on a real plan for the
 * toolkit, run by a person in the browser. The trial never touches the
 * toolkit's checkout. `prepare` makes a disposable git clone of its committed
 * state, adds the trial plan, and records a baseline; `verify` shows that
 * mapping left the clone's source, `module.ramify` files and `plan.md` as
 * they were.
 *
 *   npm run trial -- prepare [--source <toolkit root>] [--into <directory>]
 *   npm run trial -- verify <clone>
 *
 * `prepare` changes nothing in the source repository: `git clone` of a local
 * path only reads it.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, readlink, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const trialDirectory = join(packageRoot, 'docs', 'plans', '01-implementation-map', 'trial');

/** The trial plan's ID, and so its directory under the clone's `plans/`. */
const planId = 'affected-modules';

/**
 * The toolkit's own detailed draft of this plan. The clone withholds it, in
 * a commit of its own, so that the architect cannot copy its ownership
 * tables; the reviewer compares the map with it instead.
 */
const withheld = 'docs/plans/iteration-7-affected-modules';

const baselineName = 'trial-baseline.json';

interface Baseline {
  readonly schema: 'ramify-agent.trial-baseline/1';
  readonly clone: string;
  readonly commit: string;
  /** The SHA-256 of every tracked file, and of the trial plan. */
  readonly files: Record<string, string>;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', cwd, '-c', 'user.name=ramify-agent trial', '-c', 'user.email=trial@ramify-agent.invalid', ...args], { maxBuffer: 64 * 1024 * 1024 });
  return stdout;
}

async function hashes(clone: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  // Every tracked file; a gitlink (mode 160000) is a directory and is compared by git status instead.
  for (const entry of (await git(clone, 'ls-files', '-z', '--stage')).split('\0').filter(Boolean)) {
    const [mode, path] = [entry.slice(0, 6), entry.slice(entry.indexOf('\t') + 1)];
    if (mode === '160000') continue;
    // A tracked symbolic link is compared by its target.
    const content = mode === '120000' ? await readlink(join(clone, path)) : await readFile(join(clone, path));
    files[path] = createHash('sha256').update(content).digest('hex');
  }
  const plan = `plans/${planId}/plan.md`;
  files[plan] = createHash('sha256').update(await readFile(join(clone, plan))).digest('hex');
  return files;
}

async function prepare(): Promise<number> {
  const source = resolve(option('--source') ?? join(packageRoot, '..'));
  if (!existsSync(join(source, 'module.ramify')) || !existsSync(join(source, '.git'))) {
    console.error(`${source} is not the toolkit's git checkout`);
    return 2;
  }
  const into = option('--into');
  const parent = into ? resolve(into) : await mkdtemp(join(tmpdir(), 'ramify-agent-trial-'));
  await mkdir(parent, { recursive: true });
  const clone = join(parent, 'ramify');
  if (existsSync(clone)) {
    console.error(`${clone} already exists`);
    return 2;
  }

  await run('git', ['clone', '--quiet', source, clone], { maxBuffer: 16 * 1024 * 1024 });
  if (existsSync(join(clone, withheld))) {
    await git(clone, 'rm', '-r', '--quiet', withheld);
    await git(clone, 'commit', '--quiet', '-m', `trial: withhold ${withheld}, the reviewer's reference`);
  }
  // Module resolution needs the toolkit's installed packages; node_modules is ignored by git.
  await symlink(join(source, 'node_modules'), join(clone, 'node_modules'), 'dir');
  await mkdir(join(clone, 'plans', planId), { recursive: true });
  await writeFile(join(clone, 'plans', planId, 'plan.md'), await readFile(join(trialDirectory, 'plan.md')));

  const commit = (await git(clone, 'rev-parse', 'HEAD')).trim();
  const baseline: Baseline = { schema: 'ramify-agent.trial-baseline/1', clone, commit, files: await hashes(clone) };
  await writeFile(join(parent, baselineName), `${JSON.stringify(baseline, null, 2)}\n`);

  console.log(`Trial clone: ${clone}`);
  console.log(`Commit: ${commit}, cloned from ${source} with ${withheld} withheld.`);
  console.log(`Baseline: ${join(parent, baselineName)} (${Object.keys(baseline.files).length} files).`);
  console.log('');
  console.log('Next, from ramify-agent/:');
  console.log('  npm run build:web');
  console.log(`  npm run serve -- --project ${clone} --agent pi [--model <provider/model>]`);
  console.log(`Open the printed address, choose "Affected modules", read the plan, and press Start mapping.`);
  console.log(`Afterwards: npm run trial -- verify ${clone}`);
  return 0;
}

async function verify(): Promise<number> {
  const clone = resolve(process.argv[3] ?? '');
  const baselinePath = join(clone, '..', baselineName);
  if (!existsSync(baselinePath)) {
    console.error(`No ${baselineName} beside ${clone}; give the clone that \`prepare\` printed`);
    return 2;
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8')) as Baseline;
  const now = await hashes(clone);
  const changed = Object.keys(baseline.files).filter(path => now[path] !== baseline.files[path]);
  const added = Object.keys(now).filter(path => !(path in baseline.files));
  const head = (await git(clone, 'rev-parse', 'HEAD')).trim();
  // Anything git sees beyond the harness's plans/ directory and Ramify's gitignored views.
  const status = (await git(clone, 'status', '--porcelain', '--untracked-files=all', '--', '.', ':(exclude)plans')).trim();
  const moduleFiles = Object.keys(baseline.files).filter(path => path.endsWith('module.ramify')).length;

  console.log(`Clone: ${clone}`);
  console.log(`HEAD ${head === baseline.commit ? 'unchanged' : `moved from ${baseline.commit} to ${head}`}.`);
  console.log(`Tracked files and plan.md: ${Object.keys(baseline.files).length} compared, ${moduleFiles} of them module.ramify; ${changed.length} changed, ${added.length} added.`);
  for (const path of [...changed, ...added]) console.log(`  ${changed.includes(path) ? 'changed' : 'added'}: ${path}`);
  console.log(`git status outside plans/: ${status === '' ? 'clean' : `\n${status}`}`);
  const ok = head === baseline.commit && changed.length === 0 && added.length === 0 && status === '';
  console.log(ok ? 'The trial left the source, module.ramify files and plan.md unchanged.' : 'The trial changed the target.');
  return ok ? 0 : 1;
}

async function main(): Promise<number> {
  const command = process.argv[2];
  if (command === 'prepare') return prepare();
  if (command === 'verify') return verify();
  console.error('Usage: npm run trial -- prepare [--source <toolkit root>] [--into <directory>] | verify <clone>');
  return 2;
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(error);
  process.exitCode = 2;
});
