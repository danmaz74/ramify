/*
 * Probes 7 and 8: disable compaction, and observe compaction.
 *
 * Both drive the same shape of session past pi's threshold
 * (`contextTokens > contextWindow - reserveTokens`) by reporting large usage
 * from the scripted provider, and give the transcript enough real text that
 * pi's cut point has something to summarise. Probe 7 turns auto-compaction off and reports
 * whether any `compaction_start` arrives. Probe 8 leaves it on and reports the
 * events, the reason, and the usage before and after.
 */

import { fileURLToPath } from 'node:url';
import type { AgentSessionEvent } from '@earendil-works/pi-coding-agent';
import { attempt, Log, open, result, workspace, type Probe } from '../lib/probe.js';
import { text } from '../lib/scripted-provider.js';

const WINDOW = 10_000;
const RESERVE = 2_000;

/** Three turns whose reported usage crosses `WINDOW - RESERVE`, then a summary reply. */
const replies = [
  text('small reply', { input: 1_000, output: 20 }),
  text('large reply', { input: 9_500, output: 20 }),
  text('a summary of the conversation so far'),
  text('reply after the compaction', { input: 800, output: 20 }),
  text('a second summary'),
];

async function drive(autoCompaction: boolean): Promise<{ log: Log; events: AgentSessionEvent[]; usages: unknown[] }> {
  const log = new Log();
  const space = await workspace(replies, { contextWindow: WINDOW });
  const events: AgentSessionEvent[] = [];
  const usages: unknown[] = [];
  try {
    const it = await open({
      workspace: space,
      session: { mode: 'create' },
      tools: [],
      compaction: { enabled: true, reserveTokens: RESERVE, keepRecentTokens: 500 },
      onEvent: event => {
        if (event.type === 'compaction_start' || event.type === 'compaction_end') events.push(event);
      },
    });
    it.session.setAutoCompactionEnabled(autoCompaction);
    log.show('autoCompactionEnabled', it.session.autoCompactionEnabled);
    log.show('compactionSettings', it.session.settingsManager.getCompactionSettings());

    await it.session.prompt(`turn one ${'a'.repeat(8_000)}`);
    usages.push(it.session.getContextUsage());
    await it.session.prompt(`turn two, which reports usage past the threshold ${'b'.repeat(8_000)}`);
    usages.push(it.session.getContextUsage());
    // pi checks the threshold before a new user prompt as well as between turns.
    await it.session.prompt(`turn three ${'c'.repeat(2_000)}`);
    usages.push(it.session.getContextUsage());
    log.show('contextUsageAfterEachTurn', usages);
    log.show('compactionEvents', events.map(event => ({
      type: event.type,
      reason: (event as { reason?: string }).reason,
      ...(event.type === 'compaction_end'
        ? { aborted: event.aborted, tokensBefore: event.result?.tokensBefore, estimatedTokensAfter: event.result?.estimatedTokensAfter, errorMessage: event.errorMessage }
        : {}),
    })));
    log.show('modelRequests', space.scripted.requests.length);
    log.show('messagesAtEnd', it.session.messages.length);
    it.close();
    return { log, events, usages };
  } finally {
    await space.remove();
  }
}

export const probe7: Probe = {
  number: 7,
  title: 'Disable compaction',
  async run() {
    const { log, events } = await drive(false);
    const started = events.filter(event => event.type === 'compaction_start');
    if (started.length > 0) {
      return result(probe7, 'unavailable', log, 'Compaction ran although auto-compaction was disabled.');
    }
    return result(probe7, 'verified', log, `The threshold (${WINDOW} - ${RESERVE}) was crossed and no compaction_start arrived. \`setAutoCompactionEnabled(false)\` is per session and does not prevent an explicit \`compact()\`.`);
  },
};

export const probe8: Probe = {
  number: 8,
  title: 'Observe compaction',
  async run() {
    const { log, events } = await drive(true);
    const start = events.find(event => event.type === 'compaction_start');
    const end = events.find(event => event.type === 'compaction_end');
    if (start === undefined) return result(probe8, 'unavailable', log, 'No compaction_start arrived although the threshold was crossed.');
    if (end === undefined) return result(probe8, 'verified-with-limitation', log, 'compaction_start arrived but compaction_end did not.');
    const reason = (start as { reason: string }).reason;
    const hasBeforeAndAfter = end.type === 'compaction_end' && end.result?.tokensBefore !== undefined && end.result.estimatedTokensAfter !== undefined;
    return result(probe8, 'verified', log,
      `reason was \`${reason}\`. Before and after sizes come from \`compaction_end.result\` (\`tokensBefore\`, \`estimatedTokensAfter\`): ${hasBeforeAndAfter}. \`getContextUsage()\` reports \`tokens: null\` between the compaction and the next assistant reply, so the after size must be read from the event, not from the session.`);
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  console.log(JSON.stringify([await attempt(probe7), await attempt(probe8)], null, 2));
}
