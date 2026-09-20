/*
 * Probes 4 and 5: append without inference, and the append reaching the next
 * fork.
 *
 * Probe 4 appends text to an idle parent by both routes the declarations
 * offer and reports which of them causes a model call and which reaches the
 * model input. Probe 5 forks after the append and reports whether the fork's
 * rendered model input contains the appended text.
 */

import { fileURLToPath } from 'node:url';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { attempt, Log, open, requestText, result, workspace, type Probe } from '../lib/probe.js';
import { text } from '../lib/scripted-provider.js';

/** Shared setup: a parent that has run one turn, then both kinds of append. */
async function append(): Promise<{
  log: Log;
  requestsBefore: number;
  requestsAfter: number;
  reachedModel: { customMessageEntry: boolean; customEntry: boolean; sendCustomMessage: boolean };
  forkHasBrief: boolean;
  forkTaken: boolean;
  remove: () => Promise<void>;
}> {
  const log = new Log();
  const space = await workspace([text('parent reply'), text('reply after the appends'), text('reply in the fork')]);
  const parent = await open({ workspace: space, session: { mode: 'create' }, tools: [] });
  await parent.session.prompt('the parent turn');
  const requestsBefore = space.scripted.requests.length;

  // Route A: the session's own custom message, explicitly without a turn.
  await parent.session.sendCustomMessage(
    { customType: 'ramify-brief', content: 'BRIEF-SEND: the engineer finished iteration one.', display: false, details: {} },
    { triggerTurn: false },
  );
  // Route B: the session manager's entry that participates in LLM context.
  parent.session.sessionManager.appendCustomMessageEntry('ramify-brief', 'BRIEF-MESSAGE-ENTRY: the gate passed.', false);
  // Route C: the session manager's entry documented as not participating.
  parent.session.sessionManager.appendCustomEntry('ramify-note', { text: 'BRIEF-CUSTOM-ENTRY: should not reach the model.' });

  const requestsAfter = space.scripted.requests.length;
  log.show('requestsBeforeAppends', requestsBefore);
  log.show('requestsAfterAppends', requestsAfter);
  log.show('isIdleAfterAppends', parent.session.isIdle);
  log.show('entriesAfterAppends', parent.session.sessionManager.getEntries().length);

  // What the next model request carries.
  await parent.session.prompt('what do you have?');
  const sent = requestText(space.scripted, 1);
  const reachedModel = {
    sendCustomMessage: sent.includes('BRIEF-SEND'),
    customMessageEntry: sent.includes('BRIEF-MESSAGE-ENTRY'),
    customEntry: sent.includes('BRIEF-CUSTOM-ENTRY'),
  };
  log.show('reachedTheModelInput', reachedModel);

  // Probe 5: a fork taken after the append.
  const file = parent.session.sessionFile!;
  const forkPoint = parent.session.sessionManager.getLeafId()!;
  parent.close();
  const forkFile = SessionManager.open(file, space.sessionDirectory).createBranchedSession(forkPoint);
  let forkHasBrief = false;
  const forkTaken = forkFile !== undefined;
  if (forkFile !== undefined) {
    const fork = await open({ workspace: space, session: { mode: 'open', file: forkFile }, tools: [] });
    await fork.session.prompt('what do you have?');
    const forkSent = requestText(space.scripted, 2);
    forkHasBrief = forkSent.includes('BRIEF-SEND') && forkSent.includes('BRIEF-MESSAGE-ENTRY');
    log.show('forkRequestHas', {
      'BRIEF-SEND': forkSent.includes('BRIEF-SEND'),
      'BRIEF-MESSAGE-ENTRY': forkSent.includes('BRIEF-MESSAGE-ENTRY'),
      'BRIEF-CUSTOM-ENTRY': forkSent.includes('BRIEF-CUSTOM-ENTRY'),
    });
    fork.close();
  }
  return { log, requestsBefore, requestsAfter, reachedModel, forkHasBrief, forkTaken, remove: space.remove };
}

let shared: Awaited<ReturnType<typeof append>> | undefined;
const once = async (): Promise<Awaited<ReturnType<typeof append>>> => (shared ??= await append());

export const probe4: Probe = {
  number: 4,
  title: 'Append without inference',
  async run() {
    const it = await once();
    if (it.requestsAfter !== it.requestsBefore) {
      return result(probe4, 'unavailable', it.log, 'An append caused a model call.');
    }
    if (!it.reachedModel.sendCustomMessage && !it.reachedModel.customMessageEntry) {
      return result(probe4, 'unavailable', it.log, 'Neither append reached the model input.');
    }
    const note = `Zero model calls for all three routes. \`sendCustomMessage(..., { triggerTurn: false })\` reaches the model input: ${it.reachedModel.sendCustomMessage}. \`appendCustomMessageEntry\` reaches it: ${it.reachedModel.customMessageEntry}. \`appendCustomEntry\` reaches it: ${it.reachedModel.customEntry}.`;
    return result(probe4, 'verified', it.log, note);
  },
};

export const probe5: Probe = {
  number: 5,
  title: 'The append reaches the next fork',
  async run() {
    const it = await once();
    if (!it.forkTaken) return result(probe5, 'unavailable', it.log, 'No fork could be taken.');
    return result(probe5, it.forkHasBrief ? 'verified' : 'unavailable', it.log,
      it.forkHasBrief ? undefined : 'The appended text did not reach the fork’s model input.');
  },
};

export async function release(): Promise<void> {
  if (shared) await shared.remove();
  shared = undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify([await attempt(probe4), await attempt(probe5)], null, 2));
  await release();
}
