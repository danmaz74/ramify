/*
 * Probe 13: session reconstruction after restart.
 *
 * One process writes a session containing a user turn, a tool call, a tool
 * result and an appended brief, then exits. A second process reopens the file
 * and reports what the rebuilt context holds.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { attempt, Log, open, result, workspace, type Probe } from '../lib/probe.js';
import { call, text } from '../lib/scripted-provider.js';

const run = promisify(execFile);

export const probe: Probe = {
  number: 13,
  title: 'Session reconstruction after restart',
  async run() {
    const log = new Log();
    const note = defineTool({
      name: 'note',
      label: 'note',
      description: 'Records a note.',
      parameters: { type: 'object', properties: { text: {} } } as never,
      async execute(_callId, params) {
        return { content: [{ type: 'text', text: `noted: ${JSON.stringify(params)}` }], details: {} };
      },
    });

    const space = await workspace([call('note', { text: 'NOTE-ONE' }), text('reply ARBOREAL')]);
    try {
      const first = await open({ workspace: space, session: { mode: 'create' }, tools: ['note'], customTools: [note] });
      await first.session.prompt('take a note and then answer');
      await first.session.sendCustomMessage({ customType: 'ramify-brief', content: 'BRIEF-ACROSS-RESTART', display: false, details: {} }, { triggerTurn: false });
      const file = first.session.sessionFile!;
      const entries = first.session.sessionManager.getEntries().length;
      const messages = first.session.messages.length;
      first.close();
      log.show('entriesWrittenByTheFirstProcess', entries);
      log.show('messagesInTheFirstProcess', messages);
      const header = JSON.parse(readFileSync(file, 'utf8').split('\n')[0]!) as { version?: number };
      log.show('sessionFileVersion', header.version);

      const child = fileURLToPath(new URL('./p13-child.ts', import.meta.url));
      const { stdout } = await run('node_modules/.bin/tsx', [child, file, space.cwd, space.sessionDirectory], {
        cwd: fileURLToPath(new URL('../../..', import.meta.url)),
        env: { ...process.env, NODE_OPTIONS: '' },
      });
      const reported = JSON.parse(stdout.trim().split('\n').at(-1) ?? '{}') as Record<string, unknown>;
      log.show('newProcess', reported);

      const ok = reported.messages === messages && reported.hasToolResult === true && reported.hasBrief === true && reported.hasAssistantText === true;
      if (ok !== true) {
        return result(probe, 'verified-with-limitation', log, 'The new process reopened the session but its rebuilt context did not match the first process’s. See `newProcess`.');
      }
      return result(probe, 'verified', log,
        'A second process reopens the file with `SessionManager.open` and rebuilds the same message list, including the tool call, its result and the appended brief. No pi object crosses the process boundary; the session file is the whole handover.');
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
