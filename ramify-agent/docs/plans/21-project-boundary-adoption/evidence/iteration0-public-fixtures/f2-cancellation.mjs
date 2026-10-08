import { existsSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { requestFromCommittedConfiguration, createNodeGitExecutor,
  runAudit, findCompletedAuditRequest, createAuditEventSink } from 'ramify-audit';

const repositoryPath = process.argv[2];
if (!repositoryPath) throw new Error('Pass F2 checked out at 55c8175.');
const marker = '/tmp/plan21-iteration0-running.marker';
const git = (...args) => execFileSync('git', args, { cwd: repositoryPath, encoding: 'utf8' }).trim();
rmSync(marker, { force: true });
const sourceCommit = git('rev-parse', 'HEAD');
const request = await requestFromCommittedConfiguration({ git: createNodeGitExecutor(),
  repositoryPath, sourceCommit, projectRoot: '.', full: true, force: true });
const refsBefore = git('show-ref');
const events = [];
const controller = new AbortController();
const monitor = setInterval(() => {
  if (existsSync(marker)) controller.abort('Cancelled after configured process marker');
}, 50);
const timeout = setTimeout(() => controller.abort('Timed out waiting for marker'), 30000);
try {
  const result = await runAudit(request, {
    eventSink: createAuditEventSink(event => { events.push(event.type); }),
  }, controller.signal);
  const markerSeen = existsSync(marker);
  const childPid = markerSeen ? Number(readFileSync(marker, 'utf8')) : null;
  await new Promise(resolve => setTimeout(resolve, 500));
  let childAliveAfterSettlement = false;
  if (childPid) try { process.kill(childPid, 0); childAliveAfterSettlement = true; } catch {}
  const completedLookupFound = !!(await findCompletedAuditRequest({
    repositoryPath, requestId: request.requestId, sourceCommit,
  }));
  console.log(JSON.stringify({ result, markerSeen, childPid, childAliveAfterSettlement,
    events, refsUnchanged: refsBefore === git('show-ref'), completedLookupFound }, null, 2));
} finally {
  clearInterval(monitor); clearTimeout(timeout);
}
