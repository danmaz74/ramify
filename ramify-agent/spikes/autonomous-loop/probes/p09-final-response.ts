/*
 * Probe 9: threshold-triggered final response.
 *
 * `setActiveToolsByName([])` is documented to take effect on the next agent
 * turn. The probe removes the tools from inside a running tool call and again
 * between prompts, and reports what each following model request was offered.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';
import { attempt, Log, open, result, toolNames, workspace, type Probe } from '../lib/probe.js';
import { call, text } from '../lib/scripted-provider.js';

export const probe: Probe = {
  number: 9,
  title: 'Threshold-triggered final response',
  async run() {
    const log = new Log();
    let session: { setActiveToolsByName(names: string[]): void } | undefined;
    let removedDuringCall = false;
    const work = defineTool({
      name: 'work',
      label: 'work',
      description: 'Does a unit of work.',
      parameters: { type: 'object', properties: {} } as never,
      async execute() {
        // The harness notices the budget while a tool is running.
        if (!removedDuringCall) {
          session!.setActiveToolsByName([]);
          removedDuringCall = true;
        }
        return { content: [{ type: 'text', text: 'done' }], details: {} };
      },
    });

    const space = await workspace([
      call('work', {}),
      text('here is my final report, with no tool call'),
      text('a second final report'),
    ]);
    try {
      const it = await open({ workspace: space, session: { mode: 'create' }, tools: ['work'], customTools: [work] });
      session = it.session;
      log.show('activeToolsAtStart', it.session.getActiveToolNames());

      await it.session.prompt('do the work');
      log.show('toolsOfferedOnRequest0', toolNames(space.scripted, 0));
      // The second request of the same run: pi continues after the tool result.
      log.show('toolsOfferedOnRequest1', toolNames(space.scripted, 1));
      log.show('activeToolsAfterTurn', it.session.getActiveToolNames());
      log.show('requestsAfterFirstPrompt', space.scripted.requests.length);
      const lastText = it.session.getLastAssistantText();
      log.show('finalAssistantText', lastText);

      // And between prompts.
      it.session.setActiveToolsByName([]);
      await it.session.prompt('anything else?');
      log.show('toolsOfferedOnRequest2', toolNames(space.scripted, 2));
      it.close();

      const withinRun = toolNames(space.scripted, 1);
      const nextPrompt = toolNames(space.scripted, 2);
      if (nextPrompt.length !== 0) {
        return result(probe, 'unavailable', log, 'Removing the tools did not empty the next request’s tool list.');
      }
      const immediate = withinRun.length === 0;
      return result(probe, 'verified', log,
        `The removal takes effect on the next model request. Called from inside a running tool it already applies to the continuation request of the same run: ${immediate}. One final response with no tool call was obtained: ${JSON.stringify(lastText)}.`);
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
