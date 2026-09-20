/*
 * Probe 2: continue after a structured submission ends the turn.
 *
 * The decisive question. A session whose submission tool returned
 * `terminate: true` is prompted again; the probe reports whether the call is
 * accepted and whether it resumes from the same history. Decisions 4 and 12
 * and iterations 3, 6 and 9 depend on the answer.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';
import { attempt, Log, message, open, requestText, result, workspace, type Probe } from '../lib/probe.js';
import { call } from '../lib/scripted-provider.js';

export const probe: Probe = {
  number: 2,
  title: 'Continue after a structured submission ends the turn',
  async run() {
    const log = new Log();
    const submissions: unknown[] = [];
    const submit = defineTool({
      name: 'submit',
      label: 'submit',
      description: 'Ends the work with a result.',
      parameters: { type: 'object', properties: { note: {} } } as never,
      executionMode: 'sequential',
      async execute(_callId, params) {
        submissions.push(params);
        return { content: [{ type: 'text', text: 'The submission was accepted.' }], details: {}, terminate: true };
      },
    });

    const space = await workspace([
      call('submit', { note: 'first result' }),
      call('submit', { note: 'second result' }),
    ]);
    try {
      const it = await open({ workspace: space, session: { mode: 'create' }, tools: ['submit'], customTools: [submit] });
      await it.session.prompt('do the first piece of work');
      log.show('submissionsAfterFirstTurn', submissions.length);
      log.show('requestsAfterFirstTurn', space.scripted.requests.length);
      log.show('isIdleAfterTerminate', it.session.isIdle);
      log.show('isStreamingAfterTerminate', it.session.isStreaming);
      log.show('eventsAfterFirstTurn', it.events.map(event => event.type));

      // The question: does the same session accept another prompt?
      let promptError: string | undefined;
      try {
        await it.session.prompt('now do the second piece of work');
      } catch (error) {
        promptError = message(error);
      }
      log.show('secondPromptThrew', promptError ?? null);
      log.show('requestsAfterSecondPrompt', space.scripted.requests.length);
      const resumed = requestText(space.scripted, 1);
      const carriesSubmission = resumed.includes('first result') && resumed.includes('The submission was accepted.');
      log.show('secondRequestCarriesTheSubmissionAndItsResult', carriesSubmission);
      log.show('submissionsAfterSecondTurn', submissions.length);
      log.show('messagesAtEnd', it.session.messages.length);
      it.close();

      if (promptError !== undefined) return result(probe, 'unavailable', log, `prompt() after terminate threw: ${promptError}`);
      if (space.scripted.requests.length < 2) return result(probe, 'unavailable', log, 'The second prompt reached no model request.');
      if (!carriesSubmission) {
        return result(probe, 'verified-with-limitation', log, 'The session continued but the resumed request did not carry the submission and its result.');
      }
      if (submissions.length !== 2) {
        return result(probe, 'verified-with-limitation', log, 'The session resumed but the submission tool was not callable a second time.');
      }
      return result(probe, 'verified', log);
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
