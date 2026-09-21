/*
 * The real-session check: one implementation run with a real pi session on a
 * disposable copy of the fixture project, through the harness's own command
 * line and HTTP protocol, as a person would run it from the browser. It needs
 * a pi login; see the usage below. It calls a model and costs tokens.
 *
 *   npm run real-session -- [--project <prepared copy>] [--plan <plan-id>] [--model <provider/model>]
 *
 * Without `--project` it prepares a copy first, as `npm run trial --
 * prepare` does: the fixture copied, its toolchain installed with `npm ci`,
 * and one commit, so that readiness can pass. The copy is kept, with the
 * run's records, for `npm run trial -- verify <copy>` and for review.
 *
 * It posts `start-run` to `/api/v1/commands`, then reads the run's event page
 * from its cursor until the run is no longer running.
 *
 * Exit status: 0 when the run completed, 1 when it ended any other way, 2
 * when the check could not run: no pi login, a copy that could not be
 * prepared, or a start the harness refused.
 */
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const tsx = join(packageRoot, 'node_modules', '.bin', 'tsx');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const model = option('--model');
const planId = option('--plan') ?? 'review-notes';

/** The environment a child gets: this one's, without the Node flags this process was started with. */
function childEnvironment(): NodeJS.ProcessEnv {
  const { NODE_OPTIONS: _options, ...rest } = process.env;
  return rest;
}

interface RunSnapshot {
  state: string;
  phase: string;
  version: number;
  failure: { reason: string; message: string; evidence: string[] } | null;
  counts: { workItems: number; completedWorkItems: number; openRequirements: number; invocations: number; gateAttempts: number };
}
interface ProjectedEvent { sequence: number; transition: string; summary: string }
interface EventPage { run: RunSnapshot; events: ProjectedEvent[]; cursor: number; more: boolean }

/** Prepares a copy with the trial script and answers its path. */
async function prepareCopy(): Promise<string | null> {
  return new Promise(done => {
    const child = spawn(tsx, ['scripts/live-trial.ts', 'prepare', '--plan', planId], { cwd: packageRoot, env: childEnvironment(), stdio: ['ignore', 'pipe', 'inherit'] });
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      process.stdout.write(chunk.replace(/^(?=.)/gm, '[prepare] '));
    });
    child.on('close', code => done(code === 0 ? /^Trial copy: (.+)$/m.exec(output)?.[1] ?? null : null));
  });
}

async function main(): Promise<number> {
  const project = option('--project') ?? await prepareCopy();
  if (project === null) {
    console.error('The fixture copy could not be prepared, so no run can start.');
    return 2;
  }
  console.log(`Project: ${project}`);

  const args = ['src/main.ts', 'serve', '--project', project, '--port', '0', '--agent', 'pi', ...(model ? ['--model', model] : [])];
  const server = spawn(tsx, args, { cwd: packageRoot, env: childEnvironment(), stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    const { origin, ready } = await new Promise<{ origin: string; ready: boolean }>((resolve, reject) => {
      let output = '';
      server.stdout.setEncoding('utf8');
      server.stdout.on('data', (chunk: string) => {
        output += chunk;
        process.stdout.write(chunk.replace(/^(?=.)/gm, '[harness] '));
        const match = /Open (http:\/\/[^\s/]+)\//.exec(output);
        if (match && /pi (runs|cannot)/.test(output)) resolve({ origin: match[1]!, ready: /pi runs /.test(output) });
      });
      server.once('exit', code => reject(new Error(`The harness exited with ${code} before serving`)));
    });
    if (!ready) {
      console.error('pi is not logged in, so no real session can run. Log in first: `npx pi`, then /login, then quit pi.');
      return 2;
    }

    const response = await fetch(`${origin}/api/v1/commands`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ commandId: `real-session-${Date.now()}`, expectedVersion: 0, type: 'start-run', payload: { planId, agent: 'pi' } }),
    });
    const body = await response.json() as { receipt?: { jobId: string }; error?: { code: string; message: string } };
    if (!body.receipt) {
      console.error(`The start was refused: ${body.error ? `${body.error.code}: ${body.error.message}` : response.status}`);
      return 2;
    }
    const runId = body.receipt.jobId;
    console.log(`Run ${runId} started on plan "${planId}". Closing this script does not stop the run; stopping the harness does.`);

    let cursor = 0;
    let run: RunSnapshot;
    for (;;) {
      const page = await (await fetch(`${origin}/api/v1/plans/${planId}/runs/${runId}/events?after=${cursor}`)).json() as EventPage;
      for (const event of page.events) console.log(`${String(event.sequence).padStart(4)} ${event.transition}: ${event.summary}`);
      cursor = page.cursor;
      run = page.run;
      if (run.state !== 'running' && !page.more) break;
      if (!page.more) await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const { counts } = run;
    console.log(`\nState: ${run.state}. Work items ${counts.completedWorkItems} of ${counts.workItems} completed, ${counts.openRequirements} requirements open, ${counts.invocations} invocations, ${counts.gateAttempts} gate attempts.`);
    if (run.failure) console.log(`Failure: ${run.failure.reason}: ${run.failure.message}${run.failure.evidence.map(line => `\n  - ${line}`).join('')}`);
    console.log(`The run's records are in ${join(project, 'plans', planId, '.harness', 'jobs', runId)}.`);
    console.log(`Check what it changed with: npm run trial -- verify ${project} --run ${runId}`);
    return run.state === 'completed' ? 0 : 1;
  } finally {
    // The server stops its private Ramify daemon when it exits.
    server.kill('SIGTERM');
    await new Promise(resolve => { if (server.exitCode !== null) resolve(undefined); else server.once('exit', resolve); });
    console.log(`The project copy is kept at ${project}.`);
  }
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(error);
  process.exitCode = 2;
});
