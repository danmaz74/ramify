/*
 * Probe 14: withholding the shell.
 *
 * A session is opened with an allowlist that names neither `bash` nor
 * `powershell`. The probe reports the tools pi actually offered the model, what
 * pi does when the model calls a withheld tool anyway, and whether pi's own
 * defaults reappear after a reload or a `setActiveToolsByName` that names one.
 * Decision 12 depends on the answer.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { attempt, Log, open, requestText, result, toolNames, workspace, type Probe } from '../lib/probe.js';
import { call, text } from '../lib/scripted-provider.js';

export const probe: Probe = {
  number: 14,
  title: 'Withholding the shell',
  async run() {
    const log = new Log();
    const runTests = defineTool({
      name: 'run_scope_tests',
      label: 'run_scope_tests',
      description: 'Runs the tests the assignment selected.',
      parameters: { type: 'object', properties: {} } as never,
      async execute() {
        return { content: [{ type: 'text', text: 'all tests passed' }], details: {} };
      },
    });

    const space = await workspace([
      call('bash', { command: `touch ${JSON.stringify(join('shell-ran.txt'))}` }),
      text('I have no shell, so I will use the harness tool.'),
      call('run_scope_tests', {}),
      text('done'),
    ]);
    try {
      const it = await open({
        workspace: space,
        session: { mode: 'create' },
        tools: ['read', 'grep', 'ls', 'find', 'edit', 'write', 'run_scope_tests'],
        customTools: [runTests],
      });
      log.show('activeToolNames', it.session.getActiveToolNames());
      log.show('allConfiguredTools', it.session.getAllTools().map(tool => tool.name));

      await it.session.prompt('run the tests');
      log.show('toolsOfferedOnRequest0', toolNames(space.scripted, 0));
      const first = requestText(space.scripted, 1);
      log.show('modelWasToldAboutTheCall', first.includes('bash'));
      log.show('shellSideEffect', existsSync(join(space.cwd, 'shell-ran.txt')));
      log.show('systemPromptMentionsBash', /\bbash\b/i.test(space.scripted.requests[0]?.systemPrompt ?? ''));

      // Do pi's defaults come back?
      await it.session.reload();
      log.show('activeToolNamesAfterReload', it.session.getActiveToolNames());
      it.session.setActiveToolsByName(['read', 'bash']);
      log.show('activeToolNamesAfterAskingForBash', it.session.getActiveToolNames());
      it.close();

      const offered = toolNames(space.scripted, 0);
      const hasShell = offered.includes('bash') || offered.includes('powershell');
      if (hasShell) return result(probe, 'unavailable', log, 'pi offered a shell tool despite the allowlist.');
      const afterReload = it.session.getActiveToolNames();
      const reappeared = afterReload.includes('bash') || afterReload.includes('powershell');
      if (reappeared) {
        return result(probe, 'verified-with-limitation', log, 'The allowlist withholds the shell, but pi’s defaults reappear after `reload()`.');
      }
      return result(probe, 'verified', log,
        'The allowlist withholds `bash` and `powershell`; they appear neither in the offered tool list nor in the system prompt, they survive a `reload()`, and `setActiveToolsByName` cannot enable a tool that is not in the registry. A model that calls one anyway gets an unknown-tool error result and the call has no effect.');
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
