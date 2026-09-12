#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';

// Example PostToolUse adapter. Put the installed ramify executable on PATH.
// The CLI discovers the project from the edited file's directory.
const maximumBytes = 1024 * 1024;
const notice = reason => process.stderr.write(`Ramify: not checked (${reason}); continuing.\n`);
let input = '', bytes = 0, finished = false;
function finish(reason) {
  if (finished) return;
  finished = true;
  clearTimeout(timer);
  if (reason) notice(reason);
  process.stdin.destroy();
  process.exitCode = 0;
}
const timer = setTimeout(() => finish('unavailable: hook input timeout'), 5_000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  bytes += Buffer.byteLength(chunk);
  if (bytes > maximumBytes) finish('unavailable: hook input too large');
  else input += chunk;
});
process.stdin.on('error', () => finish('unavailable: cannot read hook input'));
process.stdin.on('end', () => {
  if (finished) return;
  clearTimeout(timer);
  try {
    const event = JSON.parse(input);
    const named = event?.tool_input?.file_path;
    if (typeof named !== 'string' || !named.trim() || named.includes('\0')) {
      finish('unavailable: missing tool_input.file_path'); return;
    }
    const file = resolve(named);
    const result = spawnSync('ramify', ['check', '--changed', file, '--format', 'json'], {
      cwd: dirname(file), encoding: 'utf8', timeout: 5_000, killSignal: 'SIGKILL', maxBuffer: maximumBytes,
      windowsHide: true,
    });
    if (result.error || result.signal || result.status === null) {
      finish(result.error?.code === 'ETIMEDOUT' ? 'deadline-exceeded' : 'unavailable'); return;
    }
    let document;
    try { document = JSON.parse(result.stdout); }
    catch { finish('unavailable: invalid check output'); return; }
    if (document?.schemaVersion !== 'ramify.check/1' || !['checked', 'not-checked'].includes(document.outcome)
      || !Array.isArray(document.findings)) { finish('unavailable: invalid check document'); return; }
    if (document.outcome === 'not-checked') {
      finish(typeof document.reason === 'string' ? document.reason.replace(/[\r\n]+/g, ' ') : 'unavailable'); return;
    }
    if (![0, 1].includes(result.status) || document.exitCode !== result.status || !document.revision
      || !['completed', 'invalid'].includes(document.execution)) {
      finish('unavailable: inconsistent check result'); return;
    }
    const added = document.findings.filter(finding => finding?.new === true);
    for (const finding of added) {
      const location = finding.location ? ` ${finding.location.file}:${finding.location.line}:${finding.location.column}` : '';
      process.stderr.write(`Ramify [${finding.code}]${location}: ${String(finding.message).replace(/[\r\n]+/g, ' ')}\n`);
    }
    finished = true;
    process.exitCode = added.length ? 2 : 0;
  } catch { finish('unavailable: cannot execute check'); }
});
