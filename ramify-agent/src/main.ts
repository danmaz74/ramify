import { fileURLToPath } from 'node:url';
import { ProjectRootError, startServer } from '../subs/harness/src/http/server.js';
import { ProjectLockError } from '../subs/harness/src/store/lock.js';
import { parseCommandLine, usage, UsageError } from './cli.js';

// The web module builds into dist/web beside this package's root; the root
// composes that build output with the harness's server.
const assetsDirectory = fileURLToPath(new URL('../dist/web', import.meta.url));

async function main(argv: readonly string[]): Promise<number> {
  const commandLine = parseCommandLine(argv);
  if (commandLine.command === 'help') {
    console.log(usage);
    return 0;
  }
  const server = await startServer({ projectRoot: commandLine.projectRoot, port: commandLine.port, assetsDirectory, agent: commandLine.agent, piModel: commandLine.model });
  console.log(`Serving ${server.projectRoot}`);
  console.log(`Open ${server.url}/`);
  console.log(server.agent ? `Mapping jobs run on the ${server.agent} agent.` : 'No agent is configured; mapping jobs cannot start. Pass --agent pi, or --agent fake for the scripted fake.');
  if (server.agentStatus) console.log(server.agentStatus);
  const { interrupted, completed, failed, skipped, approvals } = server.recovery;
  if (interrupted.length + completed.length + failed.length + skipped.length > 0) {
    console.log(`Recovered jobs: ${interrupted.length} interrupted, ${completed.length} completed, ${failed.length} failed, ${skipped.length} skipped.`);
  }
  if (approvals.length > 0) console.log(`Recovered approval records: ${approvals.join(', ')}.`);
  if (!server.servesWebClient) console.log('The web client is not built; run `npm run build:web`. The protocol is served under /api/v1.');
  const stop = () => {
    void server.close().then(() => process.exit(0));
  };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
  return -1;
}

main(process.argv.slice(2)).then(code => {
  if (code >= 0) process.exitCode = code;
}, (error: unknown) => {
  if (error instanceof UsageError) console.error(`${error.message}\n${usage}`);
  else if (error instanceof ProjectRootError || error instanceof ProjectLockError) console.error(error.message);
  else console.error(error);
  process.exitCode = 2;
});
