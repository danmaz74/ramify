import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { once } from 'node:events';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { alive, archive, packageRoot, until } from './resident-probe.js';

const directory = await mkdtemp(join(tmpdir(), 'rf-spawn-'));
const fixture = resolve(packageRoot, 'scripts/probes/fixtures/detached-probe-child.mjs');
let childPid: number | undefined;
try {
  const launched = await promisify(execFile)(process.execPath, [fixture, 'launch', directory]);
  const parent = JSON.parse(launched.stdout); childPid = parent.childPid;
  assert.equal(alive(parent.parentPid), false, 'Direct parent must have exited and been reaped');
  await until(async () => { try { return JSON.parse(await readFile(join(directory, 'record.json'), 'utf8')).state === 'running'; } catch { return false; } }, 'orphan readiness');
  assert.ok(alive(childPid!));
  const before = await readFile(join(directory, 'record.json'), 'utf8');
  let duplicateCode: number | undefined;
  try { await promisify(execFile)(process.execPath, [fixture, 'duplicate', directory]); }
  catch (error) { duplicateCode = Number((error as { code: number }).code); }
  assert.equal(duplicateCode, 3); assert.equal(await readFile(join(directory, 'record.json'), 'utf8'), before);
  const socket = createConnection(join(directory, 's'));
  await once(socket, 'connect'); socket.write('stop'); await once(socket, 'close');
  await until(async () => JSON.parse(await readFile(join(directory, 'record.json'), 'utf8')).state === 'exited', 'exit record');
  const exit = JSON.parse(await readFile(join(directory, 'record.json'), 'utf8'));
  assert.equal(exit.exitCode, 23);
  let state = '';
  await until(() => {
    try { state = execFileSync('ps', ['-p', String(childPid), '-o', 'stat='], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { state = 'absent'; }
    return state === 'absent' || state.startsWith('Z');
  }, 'terminated detached child');
  await archive('detached-spawn', { detachedUnref: true, outlivedParent: true,
    runningKillZero: true, reapedParentKillZero: false, duplicateExitCode: duplicateCode,
    recordUnchangedByDuplicate: true, actualExitHookCode: exit.exitCode,
    finalProcessState: state, finalKillZero: alive(childPid!),
    limitation: 'A container init may leave an orphan zombie. kill(pid, 0) then reports an existing pid, not usable service liveness. Never unlink on connection refusal alone; preserve a live/ambiguous pid and return unavailable.' });
} finally {
  if (childPid && alive(childPid)) process.kill(childPid, 'SIGKILL');
  await rm(directory, { recursive: true, force: true });
}
