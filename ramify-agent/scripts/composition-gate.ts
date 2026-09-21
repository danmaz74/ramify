/*
 * The final composition gate of Plan 3: every case of the acceptance matrix,
 * with the test that owns it, run and read back by name.
 *
 *   node_modules/.bin/tsx scripts/composition-gate.ts [--with-trials] [--json <file>]
 *
 * It reads the executable form of the matrix,
 * `docs/plans/03-autonomous-implementation-loop/acceptance-evidence.json`,
 * runs every test file a case names in one Vitest run with the JSON reporter,
 * and answers for each case whether every test it names passed. The
 * composition suite (`composition.test.ts`) has already checked that each
 * test is present by name and belongs to the iteration the matrix names;
 * this is the half that needs the tests to run.
 *
 * A case whose evidence is a trial is met only when the trial's retained
 * evidence is beside the plan and says the run completed with every change
 * accounted for; a case whose evidence is a document only when the document
 * is there. `--with-trials` also runs the fixture trials, which prepare
 * copies with `npm ci`; without it their tests are skipped and the case they
 * own is not met by this run.
 *
 * Exit status: 0 when every case is met, 1 when one is not, 2 when the gate
 * could not run.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const planDirectory = join(packageRoot, 'docs', 'plans', '03-autonomous-implementation-loop');

interface MatrixCase {
  readonly case: string;
  readonly owner: number;
  readonly tests?: ReadonlyArray<{ readonly file: string; readonly titles: readonly string[] }>;
  readonly trial?: string;
  readonly document?: string;
}

interface VitestReport {
  readonly testResults: ReadonlyArray<{
    readonly name: string;
    readonly assertionResults: ReadonlyArray<{ readonly ancestorTitles: readonly string[]; readonly title: string; readonly status: string }>;
  }>;
}

interface Verdict {
  readonly case: string;
  readonly owner: number;
  readonly met: boolean;
  readonly evidence: string[];
}

async function vitest(files: readonly string[], withTrials: boolean): Promise<VitestReport> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-gate-'));
  const output = join(directory, 'report.json');
  try {
    const { NODE_OPTIONS: _options, ...env } = process.env;
    const child = spawn(join(packageRoot, 'node_modules', '.bin', 'vitest'), ['run', '--reporter=json', `--outputFile=${output}`, ...files], {
      cwd: packageRoot,
      env: { ...env, ...(withTrials ? { RAMIFY_AGENT_TRIAL: 'status-badge-tone,reviewer-identity' } : {}) },
      stdio: ['ignore', 'ignore', 'inherit'],
    });
    await new Promise(done => child.on('close', done));
    if (!existsSync(output)) throw new Error('Vitest wrote no report');
    return JSON.parse(await readFile(output, 'utf8')) as VitestReport;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

/** Whether the retained evidence of a trial says what the matrix needs of it. */
async function trialEvidence(trial: string): Promise<{ met: boolean; evidence: string }> {
  const directory = join(planDirectory, trial);
  const reason = join(directory, 'NOT-RUN.md');
  if (existsSync(reason)) return { met: false, evidence: `${trial}: not run; ${(await readFile(reason, 'utf8')).split('\n').find(line => line.trim() !== '' && !line.startsWith('#'))?.trim() ?? 'see NOT-RUN.md'}` };
  const job = join(directory, 'run', 'job.json');
  const verification = join(directory, 'verification.json');
  if (!existsSync(job) || !existsSync(verification)) return { met: false, evidence: `${trial}: no retained run directory and verification` };
  const events = (await readFile(join(directory, 'run', 'events.jsonl'), 'utf8')).split('\n').filter(Boolean)
    .map(line => (JSON.parse(line) as { event: { type: string } }).event.type);
  const report = JSON.parse(await readFile(verification, 'utf8')) as { defects: string[] };
  const completed = events.at(-1) === 'job-completed';
  return {
    met: completed && report.defects.length === 0,
    evidence: `${trial}: run ${completed ? 'completed' : `ended ${events.at(-1)}`}; ${report.defects.length} change(s) outside what the records account for`,
  };
}

async function main(): Promise<number> {
  const withTrials = process.argv.includes('--with-trials');
  const matrix = JSON.parse(await readFile(join(planDirectory, 'acceptance-evidence.json'), 'utf8')) as { cases: MatrixCase[] };
  const files = [...new Set(matrix.cases.flatMap(entry => (entry.tests ?? []).map(test => test.file)))];
  console.log(`Running ${files.length} test files for ${matrix.cases.length} cases${withTrials ? ', with the fixture trials' : ''}.`);
  const report = await vitest(files, withTrials);

  const verdicts: Verdict[] = [];
  for (const entry of matrix.cases) {
    const evidence: string[] = [];
    let met = true;
    for (const named of entry.tests ?? []) {
      const results = report.testResults.find(result => result.name === join(packageRoot, named.file))?.assertionResults ?? [];
      for (const title of named.titles) {
        const matching = results.filter(result => [...result.ancestorTitles, result.title].some(part => part.includes(title)));
        const passed = matching.filter(result => result.status === 'passed').length;
        const other = matching.filter(result => result.status !== 'passed');
        const ok = passed > 0 && other.length === 0;
        met &&= ok;
        evidence.push(`${named.file}: "${title}": ${passed} passed${other.length > 0 ? `, ${other.length} ${[...new Set(other.map(result => result.status))].join('/')}` : ''}`);
      }
    }
    if (entry.trial !== undefined) {
      const trial = await trialEvidence(entry.trial);
      met &&= trial.met;
      evidence.push(trial.evidence);
    }
    if (entry.document !== undefined) {
      const present = existsSync(join(planDirectory, entry.document));
      met &&= present;
      evidence.push(`${entry.document}: ${present ? 'present' : 'missing'}`);
    }
    verdicts.push({ case: entry.case, owner: entry.owner, met, evidence });
  }

  for (const verdict of verdicts) {
    console.log(`${verdict.met ? 'met    ' : 'NOT MET'} ${verdict.case.padEnd(4)} (iteration ${verdict.owner})`);
    for (const line of verdict.evidence) console.log(`          ${line}`);
  }
  const missing = verdicts.filter(verdict => !verdict.met);
  console.log(`\n${verdicts.length - missing.length} of ${verdicts.length} cases met.${missing.length > 0 ? ` Not met: ${missing.map(verdict => verdict.case).join(', ')}.` : ''}`);
  const json = process.argv.includes('--json') ? process.argv[process.argv.indexOf('--json') + 1] : undefined;
  if (json !== undefined) await writeFile(resolve(json), `${JSON.stringify(verdicts, null, 2)}\n`);
  return missing.length === 0 ? 0 : 1;
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(error);
  process.exitCode = 2;
});
