import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
const fixture = join(packageRoot, 'fixtures', 'collection-review');
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
