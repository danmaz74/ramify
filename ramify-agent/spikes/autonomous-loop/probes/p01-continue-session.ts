/*
 * Probe 1: continue a role session.
 *
 * A session is started, ended, then reopened in the same process and in a new
 * process, each time continuing with its history. `CreateAgentSessionOptions`
 * has no `continueSession` field despite its own JSDoc example, so the probe
 * uses `SessionManager.open(file)` handed to `createAgentSession`.
 */

import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { attempt, Log, open, requestText, result, workspace, type Probe } from '../lib/probe.js';
import { text } from '../lib/scripted-provider.js';

const run = promisify(execFile);

export const probe: Probe = {
  number: 1,
  title: 'Continue a role session',
  async run() {
    const log = new Log();
    const space = await workspace([text('first reply'), text('second reply')]);
    try {
      const first = await open({ workspace: space, session: { mode: 'create' }, tools: [] });
      await first.session.prompt('remember the word ARBOREAL');
      const file = first.session.sessionFile;
      log.show('sessionFile', file !== undefined);
      log.show('messagesAfterFirstTurn', first.session.messages.length);
      first.close();

      if (file === undefined) return result(probe, 'unavailable', log, 'pi did not persist a session file.');

      // Same process, a new AgentSession over the same file.
      const second = await open({ workspace: space, session: { mode: 'open', file }, tools: [] });
      log.show('reopenedMessages', second.session.messages.length);
      log.show('reopenedSessionId', second.session.sessionId === first.session.sessionId);
      await second.session.prompt('what was the word?');
      const sent = requestText(space.scripted, 1);
      const carried = sent.includes('ARBOREAL') && sent.includes('first reply');
      log.show('secondRequestCarriesHistory', carried);
      log.show('secondRequestMessageCount', space.scripted.requests[1]?.messages.length ?? 0);
      second.close();

      // A new process, opening the same file.
      const child = fileURLToPath(new URL('./p01-child.ts', import.meta.url));
      const { stdout } = await run('node_modules/.bin/tsx', [child, file, space.cwd, space.sessionDirectory], {
        cwd: fileURLToPath(new URL('../../..', import.meta.url)),
        env: { ...process.env, NODE_OPTIONS: '' },
      });
      const reported = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as { messages?: number; carried?: boolean; error?: string };
      log.show('newProcess', reported);

      if (!carried) return result(probe, 'unavailable', log, 'The reopened session did not resend the earlier turn.');
      if (reported.carried !== true) {
        return result(probe, 'verified-with-limitation', log, 'The same process continues; the new process did not. See `newProcess`.');
      }
      return result(probe, 'verified', log);
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
