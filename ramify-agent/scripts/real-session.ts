/*
 * The real-session check: one mapping job with a real pi session on a
 * temporary copy of the fixture project, through the harness's own command
 * line and HTTP protocol, as a person would run it. It needs a pi login; see
 * the usage below. It calls a model and costs tokens.
 *
 *   npm run real-session -- [--model <provider/model>] [--plan <plan-id>] [--keep]
 *
 * Exit status: 0 when the job completed and a valid map was saved, 1 when the
 * job ended any other way, 2 when the check could not run.
 */
import { spawn } from 'node:child_process';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const fixture = join(packageRoot, 'fixtures', 'collection-review');

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const model = option('--model');
const planId = option('--plan') ?? 'review-notes';
const keep = process.argv.includes('--keep');

interface JobSnapshot { state: string; version: number; failure: { reason: string; message: string } | null; revision: number | null; totals: { filesRead: number; searches: number; rejectedSubmissions: number; usage: { input: number; output: number; total: number } } }
interface JobEvent { sequence: number; type: string; data: Record<string, unknown> }

async function main(): Promise<number> {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-agent-real-'));
  const project = join(directory, 'collection-review');
  await cp(fixture, project, { recursive: true });
  console.log(`Fixture copy: ${project}`);

  const args = ['src/main.ts', 'serve', '--project', project, '--port', '0', '--agent', 'pi', ...(model ? ['--model', model] : [])];
  const server = spawn(join(packageRoot, 'node_modules', '.bin', 'tsx'), args, { cwd: packageRoot, stdio: ['ignore', 'pipe', 'inherit'] });
  let exitCode = 2;
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
      body: JSON.stringify({ commandId: `real-session-${Date.now()}`, expectedVersion: 0, type: 'start-mapping', payload: { planId } }),
    });
    const body = await response.json() as { receipt?: { jobId: string }; error?: { message: string } };
    if (!body.receipt) {
      console.error(`The start was refused: ${body.error?.message ?? response.status}`);
      return 2;
    }
    const jobId = body.receipt.jobId;
    console.log(`Job ${jobId} started on plan "${planId}".`);

    let cursor = 0;
    let job: JobSnapshot;
    for (;;) {
      const page = await (await fetch(`${origin}/api/v1/plans/${planId}/jobs/${jobId}/events?after=${cursor}`)).json() as { job: JobSnapshot; events: JobEvent[]; cursor: number; more: boolean };
      for (const event of page.events) console.log(describe(event));
      cursor = page.cursor;
      job = page.job;
      if (job.state !== 'running' && !page.more) break;
      if (!page.more) await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const { totals } = job;
    console.log(`\nState: ${job.state}. Files read ${totals.filesRead}, searches ${totals.searches}, rejected submissions ${totals.rejectedSubmissions}, tokens ${totals.usage.input} in / ${totals.usage.output} out.`);
    if (job.state !== 'completed' || job.revision === null) {
      console.log(`The job did not save a map${job.failure ? `: ${job.failure.reason}: ${job.failure.message}` : ''}.`);
      exitCode = 1;
      return exitCode;
    }
    const mapPath = join(project, 'plans', planId, 'map', `${String(job.revision).padStart(3, '0')}.json`);
    const map = JSON.parse(await readFile(mapPath, 'utf8')) as { summary: { change: string }; modulesTouched: Array<{ module: string; weight: string }>; reuse: unknown[]; seams: unknown[] };
    console.log(`Saved ${mapPath}`);
    console.log(`Summary: ${map.summary.change}`);
    console.log(`Modules touched: ${map.modulesTouched.map(entry => `${entry.module} (${entry.weight})`).join(', ')}`);
    console.log(`Reuse findings: ${map.reuse.length}; seams: ${map.seams.length}.`);
    exitCode = 0;
    return exitCode;
  } finally {
    server.kill('SIGTERM');
    await new Promise(resolve => { if (server.exitCode !== null) resolve(undefined); else server.once('exit', resolve); });
    if (keep || exitCode !== 2) console.log(`The fixture copy, with the job's records and session, is kept at ${project}.`);
    else await rm(directory, { recursive: true, force: true });
  }
}

function describe(event: JobEvent): string {
  const data = event.data;
  switch (event.type) {
    case 'activity': {
      const activity = data.activity as { kind: string; path?: string; query?: string; tool?: string; text?: string; error?: string };
      if (activity.kind === 'read') return `  read ${activity.path}`;
      if (activity.kind === 'search') return `  ${activity.tool} ${activity.query}`;
      if (activity.kind === 'tool') return `  call ${activity.tool}`;
      if (activity.kind === 'tool-error') return `  ${activity.tool} error: ${activity.error}`;
      return `  agent: ${activity.text}`;
    }
    case 'api-view-materialized': return `  API views of ${data.module as string} materialized`;
    case 'submission-rejected': return `  submission ${data.attempt as number} rejected:\n${(data.errors as string[]).map(error => `    - ${error}`).join('\n')}`;
    case 'job-failed': return `${event.type}: ${data.reason as string}: ${data.message as string}${(data.diagnostics as string[]).map(line => `\n    - ${line}`).join('')}`;
    default: return `${event.type}${Object.keys(data).length ? ` ${JSON.stringify(data)}` : ''}`;
  }
}

main().then(code => { process.exitCode = code; }, error => {
  console.error(error);
  process.exitCode = 2;
});
