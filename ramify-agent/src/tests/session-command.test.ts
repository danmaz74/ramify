import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, expect, test } from 'vitest';

/*
 * `ramify-agent session` in a child process, on the scripted fake and a git
 * copy of the fixture, with the real Ramify command line. No model is
 * called. What it holds the command to is what a person reads and what a
 * script can rely on: the printed stream and the exit status.
 */

const run = promisify(execFile);
const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
const main = join(packageRoot, 'src', 'main.ts');
const fixture = join(packageRoot, 'subs', 'harness', 'fixtures', 'collection-review');
const reviews = 'subs/workspace/subs/reviews';

let directory: string;
let project: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'ramify-agent-session-command-'));
  project = join(directory, 'collection-review');
  await cp(fixture, project, { recursive: true });
  const git = (...args: string[]) => run('git', args, { cwd: project });
  await git('init', '--initial-branch=main');
  await git('add', '--all');
  await git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--message', 'fixture');
});

afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

async function command(args: readonly string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return run(process.execPath, ['--import', 'tsx', main, ...args], { cwd: packageRoot, maxBuffer: 16 * 1024 * 1024, timeout: 240_000 })
    .then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }),
      (error: { code?: number; stdout?: string; stderr?: string }) => ({ code: error.code ?? -1, stdout: error.stdout ?? '', stderr: error.stderr ?? '' }));
}

test('a session on the scripted fake prints its stream, says nothing verified the work, and exits 0 on a submission', async () => {
  const script = join(directory, 'script.json');
  await writeFile(script, JSON.stringify([
    { kind: 'message', text: 'Adding the note the prompt asks for.' },
    { kind: 'tool', tool: 'write', input: { path: join(project, 'subs/workspace/subs/catalog/src/router.ts'), content: 'export {};\n' } },
    { kind: 'tool', tool: 'edit', input: { path: 'session.ts', edits: [{ oldText: ' * The review-session table.', newText: ' * The review-session table, one per application.' }] } },
    { kind: 'submit', input: { kind: 'completion-proposed', summary: 'The table says there is one per application.', findings: [] } },
  ]));

  const result = await command(['session', '--project', project, '--module', 'collection-review/workspace/reviews',
    '--prompt', 'Say in the session table\'s comment that there is one per application.', '--agent', 'fake', '--script', script]);

  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  const out = result.stdout;
  expect(out).toContain(`Agent: the scripted fake, from ${script}`);
  expect(out).toMatch(/^Session \S+ on collection-review\/workspace\/reviews \(subs\/workspace\/subs\/reviews\)$/m);
  expect(out).toContain('Say in the session table\'s comment that there is one per application.');
  expect(out).toContain('… Adding the note the prompt asks for.');
  expect(out).toContain('◆ write refused; the engineer is told:');
  expect(out).toContain('→ edit {"path":"session.ts"');
  expect(out).toContain('◆ Accepted; the engineer is told:');
  expect(out).toContain('Session ended: submitted');
  expect(out).toContain('Submission: completion-proposed. Rejected submissions: 0.');
  expect(out).toContain('Violations still standing: 0.');
  expect(out).toContain(`  ${reviews}/src/session.ts`);
  expect(out).toContain('No gate ran: nothing verified the work.');
  // The session's records are a manual run in a run's own layout; the
  // session command's own record directory is no longer written.
  const records = out.match(/^Records: (.+)$/mu)?.[1];
  expect(records?.startsWith(join(project, 'plans', 'sessions', '.harness', 'jobs'))).toBe(true);
  expect(JSON.parse(await readFile(join(records!, 'job.json'), 'utf8'))).toMatchObject({ kind: 'manual', origin: 'session' });
  await expect(stat(join(project, 'plans', '.harness', 'sessions'))).rejects.toThrow();
  expect(await readFile(join(project, reviews, 'src', 'session.ts'), 'utf8')).toContain('one per application');
  expect(await readFile(join(project, 'subs/workspace/subs/catalog/src/router.ts'), 'utf8')).not.toBe('export {};\n');
  const commits = (await run('git', ['rev-list', '--count', 'HEAD'], { cwd: project })).stdout.trim();
  expect(commits).toBe('1');
}, 300_000);

test('a session that cannot start exits 2 and says why', async () => {
  const unknown = await command(['session', '--project', project, '--module', 'collection-review/nowhere', '--prompt', 'x',
    '--agent', 'fake', '--script', join(directory, 'script.json')]);
  expect(unknown.code).toBe(2);
  expect(unknown.stderr).toContain('The session did not start: "collection-review/nowhere" is not a module');

  const usage = await command(['session', '--project', project, '--prompt', 'x', '--agent', 'pi']);
  expect(usage.code).toBe(2);
  expect(usage.stderr).toContain('session needs --module <module-path>');
  expect(usage.stderr).toContain('Usage:');
}, 300_000);

test('a step run on the scripted fake prints its stream and records, and exits 0, 1 or 2', async () => {
  const workItem = join(directory, 'work-item.json');
  const assignment = join(directory, 'assignment.json');
  await writeFile(workItem, JSON.stringify({
    schema: 'ramify-agent.work-item/1', id: 'session-table', module: 'collection-review/workspace/reviews', origin: { entry: 'review-note' },
    goal: 'Say in the session table\'s comment that there is one per application.', requirementRefs: [], acceptanceRefs: [], contextRefs: [], startedFor: null,
  }));
  await writeFile(assignment, JSON.stringify({
    kind: 'assign', localDecisions: [],
    outline: { changes: 'The comment changes.', decomposition: { kind: 'single-iteration', rationale: 'One edit.' }, reuse: [], breakingChanges: [], stages: [], revisionReason: '' },
    assignment: { stage: 0, kind: 'ordinary', goal: 'Say that there is one session table per application.', approach: 'Edit the comment.', citedElements: [],
      externalCapabilities: [], completionEvidence: 'The comment says so.',
      scope: { base: { module: 'collection-review/workspace/reviews', included: [] }, extra: [], read: [], rationale: 'The table is this module\'s.' } },
  }));
  // Inputs authored without a run are judged against the committed audit configuration.
  await writeFile(join(project, 'ramify-audit.json'), `${JSON.stringify({
    checks: [{ id: 'type-check', name: 'type-check', description: 'Configured type-check', scope: 'both', category: 'deterministic', onFailure: 'record',
      executor: { kind: 'command', commands: [{ parser: 'none', timeoutMs: 120_000, name: 'tsc', cmd: 'node', args: ['-e', '0'] }], continueOnFailure: true } }],
    workspace: { preparation: 'nodejs', options: { packageDirectories: [''], setupCommands: [] } },
  }, null, 2)}\n`);
  await run('git', ['add', 'ramify-audit.json'], { cwd: project });
  await run('git', ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--message', 'audit configuration'], { cwd: project });
  const inputs = join(directory, 'inputs.json');
  const authored = await command(['step', 'inputs', '--role', 'engineer', '--project', project, '--work-item', workItem, '--assignment', assignment, '--out', inputs]);
  expect(authored.stderr).toContain('Authored engineer inputs for session-table.i01 with no run');
  expect(authored.code).toBe(0);

  const script = join(directory, 'step-script.json');
  await writeFile(script, JSON.stringify([
    { kind: 'tool', tool: 'write', input: { path: join(project, 'subs/workspace/subs/catalog/src/router.ts'), content: 'export {};\n' } },
    { kind: 'tool', tool: 'edit', input: { path: 'session.ts', edits: [{ oldText: 'one per application', newText: 'exactly one per application' }] } },
    { kind: 'submit', input: { kind: 'no-such-kind' } },
    { kind: 'submit', input: { kind: 'unsuitable', reason: 'scope', detail: 'Nothing more is needed here.' } },
  ]));
  const manual = join(project, 'plans', 'manual', '.harness', 'jobs', 'm-001');
  const result = await command(['step', 'run', '--inputs', inputs, '--run', manual, '--agent', 'fake', '--script', script]);
  expect(result.stderr).toBe('');
  expect(result.code).toBe(0);
  const out = result.stdout;
  expect(out).toContain(`Agent: the scripted fake, from ${script}`);
  expect(out).toMatch(/^Step: engineer, invocation inv-0001, session ses-0001$/mu);
  expect(out).toContain(`Run: ${manual} (created)`);
  expect(out).toMatch(/^Base: [0-9a-f]{40}; the tree differed from it at start in \d+ path\(s\): /mu);
  expect(out).toContain('◆ write refused; the session is told:');
  expect(out).toContain('→ edit {"path":"session.ts"');
  expect(out).toContain('◆ Rejected; the session is told:');
  expect(out).toContain('◆ Accepted; the session is told:');
  expect(out).toContain('Step ended: submitted');
  expect(out).toContain('Submission: unsuitable. Rejected submissions: 1.');
  expect(out).toContain(`  invocation: ${join(manual, 'invocations', 'inv-0001', 'invocation.json')}`);
  expect(JSON.parse(await readFile(join(manual, 'job.json'), 'utf8'))).toMatchObject({ kind: 'manual', origin: 'step-run', branch: 'ramify-agent-run/m-001' });
  expect(await readFile(join(project, reviews, 'src', 'session.ts'), 'utf8')).toContain('exactly one per application');

  // A second run in the same manual run is a new invocation; one that ends without a submission exits 1.
  const ending = join(directory, 'ending-script.json');
  await writeFile(ending, JSON.stringify([{ kind: 'message', text: 'Stopping without a submission.' }]));
  const ended = await command(['step', 'run', '--inputs', inputs, '--run', manual, '--agent', 'fake', '--script', ending]);
  expect(ended.code).toBe(1);
  expect(ended.stdout).toMatch(/^Step: engineer, invocation inv-0002, /mu);

  // A directory that is not a run directory is refused before any agent starts.
  const refused = await command(['step', 'run', '--inputs', inputs, '--run', join(project, 'plans', 'manual'), '--agent', 'fake', '--script', script]);
  expect(refused.code).toBe(2);
  expect(refused.stderr).toContain('The step did not start:');
  expect(refused.stderr).toContain('is not a run directory');
  // Nothing the steps did was committed: the only commits are the fixture's and its audit configuration's.
  const commits = (await run('git', ['rev-list', '--count', 'HEAD'], { cwd: project })).stdout.trim();
  expect(commits).toBe('2');
}, 300_000);
