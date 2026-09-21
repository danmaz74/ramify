import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ProjectRootError, startServer } from '../subs/harness/src/http/server.js';
import { runSessionCommand } from '../subs/harness/src/sessions/command.js';
import type { SessionProgress, SessionSummary } from '../subs/harness/src/sessions/single.js';
import { ProjectLockError } from '../subs/harness/src/store/lock.js';
import { parseCommandLine, usage, UsageError, type CommandLine } from './cli.js';

// The web module builds into dist/web beside this package's root; the root
// composes that build output with the harness's server.
const assetsDirectory = fileURLToPath(new URL('../dist/web', import.meta.url));

async function main(argv: readonly string[]): Promise<number> {
  const commandLine = parseCommandLine(argv);
  if (commandLine.command === 'help') {
    console.log(usage);
    return 0;
  }
  if (commandLine.command === 'session') return session(commandLine);
  const server = await startServer({
    projectRoot: commandLine.projectRoot, port: commandLine.port, assetsDirectory, agent: commandLine.agent, piModel: commandLine.model,
  });
  console.log(`Serving ${server.projectRoot}`);
  console.log(`Open ${server.url}/`);
  console.log(server.agent
    ? `Implementation runs start on the ${server.agent} agent.`
    : 'No agent is configured; runs can be read but not started. Pass --agent pi, or --agent fake for the scripted fake.');
  if (server.agentStatus) console.log(server.agentStatus);
  const { interrupted, rematerialized, effects, invocations, skipped } = server.recovery;
  if (interrupted.length + rematerialized.length + effects.length + invocations.length + skipped.length > 0) {
    console.log(`Recovered runs: ${interrupted.length} interrupted, ${rematerialized.length} rematerialized, ${effects.length} effects completed, ${invocations.length} invocations closed, ${skipped.length} skipped.`);
  }
  if (!server.servesWebClient) console.log('The web client is not built; run `npm run build:web`. The protocol is served under /api/v1.');
  const stop = () => {
    void server.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return -1;
}

/** One engineer session, printed as it happens. The first interrupt stops the session; a second one exits at once. */
async function session(commandLine: Extract<CommandLine, { command: 'session' }>): Promise<number> {
  let prompt: string;
  if ('text' in commandLine.prompt) prompt = commandLine.prompt.text;
  else {
    try {
      prompt = await readFile(resolve(commandLine.prompt.file), 'utf8');
    } catch (error) {
      console.error(`The prompt file ${resolve(commandLine.prompt.file)} cannot be read: ${error instanceof Error ? error.message : String(error)}`);
      return 2;
    }
  }
  const controller = new AbortController();
  const interrupt = () => {
    console.log('\nStopping the session; interrupt again to exit at once.');
    controller.abort();
    process.once('SIGINT', () => process.exit(130));
  };
  process.once('SIGINT', interrupt);
  const refused = new Set<string>();
  try {
    const result = await runSessionCommand({
      projectRoot: resolve(commandLine.projectRoot),
      module: commandLine.module,
      prompt,
      agent: commandLine.agent,
      write: commandLine.write,
      gate: commandLine.gate,
      onAgent: description => console.log(`Agent: ${description}`),
      onProgress: event => {
        // A refusal is printed once, as the harness's text, and not again as the tool's error.
        if (event.type === 'harness-text' && event.kind === 'refusal') refused.add(event.callId);
        if (event.type === 'tool-error' && refused.has(event.callId)) return;
        console.log(describe(event));
      },
      signal: controller.signal,
    });
    if (result.status === 'not-started') {
      console.error(`The session did not start: ${result.reason}`);
      if (result.records !== null) console.error(`Records: ${result.records}`);
    }
    return result.exitStatus;
  } finally {
    process.removeListener('SIGINT', interrupt);
  }
}

const clip = (text: string, limit: number) => (text.length <= limit ? text : `${text.slice(0, limit)}… [${text.length - limit} more characters]`);
const indent = (text: string) => text.split('\n').map(line => `  ${line}`).join('\n');

/** One progress event as the person reads it. */
function describe(event: SessionProgress): string {
  switch (event.type) {
    case 'started': {
      const scope = [...event.scope.roots.map(root => `${root} and everything beneath it`), ...event.scope.files];
      return [
        `Session ${event.session} on ${event.module} (${event.directory})`,
        `Records: ${event.records}`,
        `Write scope: ${scope.join('; ')}`,
        '──── iteration message ────',
        event.message,
        '───────────────────────────',
      ].join('\n');
    }
    case 'tool-call':
      return `→ ${event.tool} ${clip(JSON.stringify(event.input), 400)}`;
    case 'tool-error':
      return `✗ ${event.tool}: ${clip(event.text, 600)}`;
    case 'message':
      return `… ${clip(event.text.trim(), 800)}`;
    case 'harness-text':
      return event.kind === 'refusal'
        ? `◆ ${event.tool} refused; the engineer is told:\n${indent(event.text)}`
        : `◆ Appended to the ${event.tool} result:\n${indent(event.text)}`;
    case 'submission':
      return [
        `◆ Submission:\n${indent(JSON.stringify(event.input, null, 2))}`,
        event.accepted ? `◆ Accepted; the engineer is told:\n${indent(event.answer)}` : `◆ Rejected; the engineer is told:\n${indent(event.answer)}`,
      ].join('\n');
    case 'gate-started':
      return '\nRunning the iteration checkpoint over the module. It never commits.';
    case 'gate':
      return event.result.ran
        ? [`Gate: ${event.result.verdict}${event.result.cause === null ? '' : ` (${event.result.cause})`}`, ...event.result.commands.map(line => `  ${line}`)].join('\n')
        : `Gate: did not run, because ${event.result.reason}.`;
    case 'summary':
      return summaryText(event.summary);
  }
}

function summaryText(summary: SessionSummary): string {
  const seconds = Math.round(summary.elapsedMs / 1000);
  const lines = [
    '',
    `Session ended: ${summary.ended} after ${seconds}s${summary.error === undefined ? '' : ` (${summary.error})`}.`,
    summary.submission === null
      ? `Submission: none accepted. Rejected submissions: ${summary.rejectedSubmissions}.`
      : `Submission: ${summary.submission.kind}. Rejected submissions: ${summary.rejectedSubmissions}.`,
    `Violations still standing: ${summary.standingViolations.length}.`,
    ...summary.standingViolations.map(finding => `  ${finding.file ?? '(no file)'}${finding.line === null ? '' : `:${finding.line}`} ${finding.code}: ${finding.message}`),
    `Changed paths:${summary.changed.length === 0 ? ' none' : ''}`,
    ...summary.changed.map(path => `  ${path}`),
  ];
  if (summary.outsideScope.length > 0) lines.push('Changed outside the write scope:', ...summary.outsideScope.map(path => `  ${path}`));
  const usage = summary.usage;
  lines.push('unavailable' in usage
    ? `Tokens: unavailable (${usage.unavailable}).`
    : `Tokens: ${usage.input} input, ${usage.output} output, ${usage.cacheRead} cache read, ${usage.cacheWrite} cache write, ${usage.total} total.`);
  lines.push(`Records: ${summary.records}`);
  if (summary.gate === null) lines.push('No gate ran: nothing verified the work. It stays uncommitted in the working tree; pass --gate to run the iteration checkpoint.');
  else lines.push('Nothing was committed; the changes stay in the working tree.');
  return lines.join('\n');
}

main(process.argv.slice(2)).then(code => {
  if (code >= 0) process.exitCode = code;
}, (error: unknown) => {
  if (error instanceof UsageError) console.error(`${error.message}\n${usage}`);
  else if (error instanceof ProjectRootError || error instanceof ProjectLockError) console.error(error.message);
  else console.error(error);
  process.exitCode = 2;
});
