import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { access, readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, expect, test } from 'vitest';
import { startServerWith } from '../http/server.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { analysis, entry } from './helpers/analysis.js';
import { assign, outline, submit, treeInputs } from './helpers/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { installTestRunner, testPolicy, until } from './helpers/runs.js';
import { unchangedGit } from './helpers/unchanged-run.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { fixtureScratchGit } from './helpers/mock-git.js';
import { FakeRamifyCli } from './helpers/fake-ramify.js';
import { passingAudit } from './helpers/direct-check-execution.js';
import { declaringScenarios } from './helpers/declarations.js';

const title = 'B17: actual clients disconnect, retry, stop and reconnect while the native host survives; crash recovery interrupts without replay';
const ownFile = 'subs/harness/src/tests/execution-breakpoints-process.boundary.test.ts';
const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const plan = 'review-notes', module = 'collection-review/workspace/reviews';
const exec = promisify(execFile);

test(title, async () => {
  const childSetup = process.env['PLAN34_BREAKPOINT_HOST'];
  if (childSetup) {
    const input = JSON.parse(await readFile(childSetup, 'utf8')) as { root: string; ready: string; release: string };
    const scripted = (role: string) => role === 'initial-architect'
      ? submit(analysis([entry('review-note', module)])) : role === 'local-architect' ? submit(assign(module, {}, outline())) : [];
    const agent = createScriptedAgent(declaringScenarios(spec => spec.role === 'engineer' ? [
      { kind: 'await', until: async () => { while (true) { try { await access(input.release); return; } catch { await new Promise(done => setTimeout(done, 10)); } } } },
      { kind: 'message', text: 'Native hosted explanation.' }, { kind: 'end', message: 'Native hosted explanation.' },
    ] : scripted(spec.role)));
    const host = await startServerWith({ projectRoot: input.root, port: 0, agent, ramify: new FakeRamifyCli(), runs: {
      inputs: treeInputs(), policy: testPolicy, configuredAudit: passingAudit(), stopGraceMs: 500,
      git: fixtureScratchGit(unchangedGit(input.root, [scenariosCommit(plan), scenariosCommit(plan)])),
    } });
    await writeFile(input.ready, JSON.stringify({ url: host.url, pid: process.pid, recovery: host.recovery }));
    await new Promise<void>(done => { process.once('SIGTERM', () => { void host.close().then(done); }); });
    return;
  }
  const fixture = await copyFixture(); cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  const setup = join(fixture.root, '..', 'host.json'), ready = join(fixture.root, '..', 'ready.json'), release = join(fixture.root, '..', 'release');
  await writeFile(setup, JSON.stringify({ root: fixture.root, ready, release }));
  const children: ChildProcess[] = [];
  const hosts = new Map<ChildProcess, number>();
  cleanups.push(async () => { for (const child of children) if (child.exitCode === null && child.signalCode === null) {
    const hostPid = hosts.get(child);
    try { if (hostPid !== undefined) process.kill(hostPid, 'SIGTERM'); else child.kill('SIGTERM'); } catch {}
    await Promise.race([new Promise<void>(done => child.once('exit', () => done())), new Promise<void>(done => setTimeout(done, 5000))]);
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  } });
  async function launch() {
    await writeFile(ready, '');
    const child = spawn(process.execPath, [join(packageRoot, 'node_modules/vitest/vitest.mjs'), 'run', '--project', 'boundaries', ownFile, '-t', title, '--maxWorkers', '1'],
      { cwd: packageRoot, env: { ...process.env, PLAN34_BREAKPOINT_HOST: setup }, stdio: ['ignore', 'pipe', 'pipe'] });
    children.push(child); let diagnostic = ''; child.stdout?.on('data', value => { diagnostic += String(value); }); child.stderr?.on('data', value => { diagnostic += String(value); });
    await until(async () => { if (child.exitCode !== null || child.signalCode !== null) throw new Error(diagnostic); return (await readFile(ready, 'utf8')).startsWith('{'); }, 30_000);
    const receipt = JSON.parse(await readFile(ready, 'utf8')) as { url: string; pid: number; recovery: { interrupted: string[] } };
    expect(receipt.pid).not.toBe(process.pid);
    hosts.set(child, receipt.pid);
    return { child, ...receipt };
  }
  const main = join(packageRoot, 'src/main.ts');
  const command = async (args: string[]) => exec(process.execPath, ['--import', 'tsx', main, ...args], { cwd: packageRoot, timeout: 15_000, maxBuffer: 1024 * 1024 })
    .then(result => ({ code: 0, ...result }), error => ({ code: error.code as number, stdout: String(error.stdout), stderr: String(error.stderr) }));
  const first = await launch();
  const start = async (id: string) => {
    const response = await fetch(first.url + '/api/v1/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
      commandId: id, expectedVersion: 0, type: 'start-run', payload: { planId: plan, agent: 'scripted', breakpoint: 'before-agent:engineer' } }) });
    expect(response.status).toBe(202); return ((await response.json()) as { receipt: { jobId: string } }).receipt;
  };
  const started = await start('native-start');
  const path = `/api/v1/plans/${plan}/runs/${started.jobId}`;
  const state = async () => {
    const value = await (await fetch(first.url + path + '/debug')).json() as { current: { pauseId: string; revision: number; state: string } | null; run: { state: string; failure: unknown } };
    if (value.run?.state !== 'running' && value.current == null) throw new Error(JSON.stringify(value));
    return value;
  };
  await until(async () => (await state()).current?.state === 'paused');
  const pause = (await state()).current!;
  const base = ['--server', first.url, '--plan', plan, '--run', started.jobId, '--pause', pause.pauseId, '--json'];
  const inspected = await command(['debug', 'inspect', ...base]);
  expect(inspected.code).toBe(0); expect(inspected.stderr).toBe(''); expect(JSON.parse(inspected.stdout).kind).toBe('inspection');
  const message = join(fixture.root, '..', 'message.txt'); await writeFile(message, 'Explain without editing.');
  const args = ['debug', 'message', ...base, '--expected-revision', '1', '--command-id', 'native-message', '--message-file', message, '--timeout-ms', '10000'];
  const disconnected = spawn(process.execPath, ['--import', 'tsx', main, ...args], { cwd: packageRoot, stdio: 'ignore' }); children.push(disconnected);
  await until(async () => { const result = await (await fetch(first.url + path + '/debug/exchanges/native-message')).json() as { exchange: { status: string } | null }; return result.exchange?.status === 'admitted'; });
  disconnected.kill('SIGKILL'); await new Promise<void>(done => disconnected.once('exit', () => done()));
  expect((await fetch(first.url + '/api/v1/project')).ok).toBe(true);
  await writeFile(release, 'settle the native exchange');
  const retried = await command(args);
  expect(retried.code).toBe(0); expect(retried.stderr).toBe('');
  const result = JSON.parse(retried.stdout); expect(result).toMatchObject({ status: 'settled', answer: 'Native hosted explanation.', revision: 2 });
  const timeout = await command(['debug', 'wait', '--server', first.url, '--plan', plan, '--run', started.jobId, '--after', String(result.cursor), '--timeout-ms', '100', '--json']);
  expect(timeout.code).toBe(2); expect(JSON.parse(timeout.stdout)).toMatchObject({ runId: started.jobId, error: { code: 'timeout' } });
  const run = await (await fetch(first.url + path)).json() as { run: { version: number } };
  const stopped = await fetch(first.url + '/api/v1/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ commandId: 'native-stop', expectedVersion: run.run.version, type: 'stop-job', payload: { planId: plan, jobId: started.jobId } }) });
  expect(stopped.status).toBe(202);
  const terminal = await command(['debug', 'wait', '--server', first.url, '--plan', plan, '--run', started.jobId, '--after', String(result.cursor), '--json']);
  expect(terminal.code).toBe(1); expect(JSON.parse(terminal.stdout).run.state).toBe('stopped');
  const secondRun = await start('native-crash-start');
  await until(async () => { const state = await (await fetch(first.url + `/api/v1/plans/${plan}/runs/${secondRun.jobId}/debug`)).json() as { current: { state: string } | null }; return state.current?.state === 'paused'; });
  const secondPath = `/api/v1/plans/${plan}/runs/${secondRun.jobId}`;
  const secondPause = await (await fetch(first.url + secondPath + '/debug')).json() as {
    current: { pauseId: string; revision: number }; run: { counts: { invocations: number } } };
  // Release through a distinct actual CLI client. Keep the resumed engineer
  // admitted but blocked, so crash recovery also covers a run after release.
  await unlink(release);
  const proceed = join(fixture.root, '..', 'proceed.txt'); await writeFile(proceed, 'Now implement the ordinary assignment.');
  const resumed = await command(['debug', 'resume', '--server', first.url, '--plan', plan, '--run', secondRun.jobId,
    '--pause', secondPause.current.pauseId, '--expected-revision', String(secondPause.current.revision),
    '--command-id', 'native-resume', '--message-file', proceed, '--json']);
  expect(resumed.code).toBe(0); expect(resumed.stderr).toBe('');
  expect(JSON.parse(resumed.stdout)).toMatchObject({ kind: 'resumed', runId: secondRun.jobId, pauseId: secondPause.current.pauseId });
  await until(async () => {
    const snapshot = await (await fetch(first.url + secondPath)).json() as { run: { counts: { invocations: number } } };
    return snapshot.run.counts.invocations === secondPause.run.counts.invocations + 1;
  });
  const beforeCrash = await (await fetch(first.url + `/api/v1/plans/${plan}/runs/${secondRun.jobId}`)).json() as { run: { counts: { invocations: number } } };
  // Vitest may host in a worker process: kill the PID that actually took the lock,
  // then settle our runner. Killing only the runner cannot establish host loss.
  process.kill(first.pid, 'SIGKILL');
  await until(async () => { try { await fetch(first.url + '/api/v1/project'); return false; } catch { return true; } });
  if (first.child.pid !== first.pid && first.child.exitCode === null && first.child.signalCode === null) first.child.kill('SIGKILL');
  if (first.child.exitCode === null && first.child.signalCode === null) await new Promise<void>(done => first.child.once('exit', () => done()));
  const restarted = await launch();
  expect(restarted.recovery.interrupted).toContain(`${plan}/${secondRun.jobId}`);
  const recovered = await command(['debug', 'wait', '--server', restarted.url, '--plan', plan, '--run', secondRun.jobId, '--json']);
  expect(recovered.code).toBe(1); expect(JSON.parse(recovered.stdout).run.state).toBe('interrupted');
  const snapshot = await (await fetch(restarted.url + `/api/v1/plans/${plan}/runs/${secondRun.jobId}`)).json() as { run: { counts: { invocations: number } } };
  expect(snapshot.run.counts.invocations).toBe(beforeCrash.run.counts.invocations);
}, 90_000);
