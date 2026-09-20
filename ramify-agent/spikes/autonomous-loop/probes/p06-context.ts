/*
 * Probe 6: context observation.
 *
 * `getContextUsage()` is read before any turn, after a turn that reports
 * usage, after content is appended without a model call, and after a
 * compaction. The plan's estimate formula is computed over the same session
 * and compared.
 */

import { calculateContextTokens, getLastAssistantUsage } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';
import { attempt, Log, open, result, workspace, type Probe } from '../lib/probe.js';
import { text } from '../lib/scripted-provider.js';

/**
 * The plan's estimate: the last assistant usage's input, cacheRead and
 * output, plus a quarter of the bytes appended since that message.
 */
function planEstimate(session: { sessionManager: { getEntries(): unknown[] }; messages: readonly unknown[] }): { tokens: number; usage: number; trailingBytes: number } {
  const usage = getLastAssistantUsage(session.sessionManager.getEntries() as never);
  const base = usage === undefined ? 0 : usage.input + usage.cacheRead + usage.output;
  const messages = session.messages as ReadonlyArray<{ role?: string }>;
  let seen = false;
  let trailingBytes = 0;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (!seen && messages[index]?.role === 'assistant') { seen = true; continue; }
    if (seen) continue;
    trailingBytes += Buffer.byteLength(JSON.stringify(messages[index]), 'utf8');
  }
  return { tokens: base + Math.ceil(trailingBytes / 4), usage: base, trailingBytes };
}

export const probe: Probe = {
  number: 6,
  title: 'Context observation',
  async run() {
    const log = new Log();
    const space = await workspace(
      [
        text('first reply', { input: 1_000, output: 50, cacheRead: 200, cacheWrite: 300 }),
        text('second reply', { input: 2_000, output: 60, cacheRead: 200, cacheWrite: 0 }),
        text('third reply', { input: 3_000, output: 70, cacheRead: 200, cacheWrite: 0 }),
        text('a summary of the conversation so far', { input: 10, output: 10 }),
      ],
      { contextWindow: 40_000 },
    );
    try {
      const it = await open({
        workspace: space,
        session: { mode: 'create' },
        tools: [],
        compaction: { enabled: true, reserveTokens: 500, keepRecentTokens: 200 },
      });
      log.show('beforeAnyTurn', it.session.getContextUsage());

      await it.session.prompt(`a first prompt ${'q'.repeat(3_000)}`);
      const afterTurn = it.session.getContextUsage();
      log.show('afterOneTurn', afterTurn);
      log.show('planEstimateAfterOneTurn', planEstimate(it.session));
      log.show('lastAssistantUsage', getLastAssistantUsage(it.session.sessionManager.getEntries()));
      log.show('calculateContextTokensOfThatUsage', calculateContextTokens(getLastAssistantUsage(it.session.sessionManager.getEntries())!));

      // Content appended with no model call: pi's number must move without new usage.
      await it.session.sendCustomMessage({ customType: 'ramify-brief', content: 'x'.repeat(4_000), display: false, details: {} }, { triggerTurn: false });
      const afterAppend = it.session.getContextUsage();
      log.show('afterAppendingFourThousandChars', afterAppend);
      log.show('planEstimateAfterAppend', planEstimate(it.session));
      log.show('requestsSoFar', space.scripted.requests.length);

      await it.session.prompt(`a second prompt ${'r'.repeat(3_000)}`);
      await it.session.prompt(`a third prompt ${'s'.repeat(3_000)}`);
      log.show('afterThreeTurns', it.session.getContextUsage());

      // After a compaction with no assistant response since, `tokens` is documented as null.
      let compacted: unknown = 'not attempted';
      try {
        const outcome = await it.session.compact('summarise');
        compacted = { tokensBefore: outcome.tokensBefore, estimatedTokensAfter: outcome.estimatedTokensAfter, summaryChars: outcome.summary.length };
      } catch (error) {
        compacted = error instanceof Error ? error.message : String(error);
      }
      log.show('compaction', compacted);
      const afterCompaction = it.session.getContextUsage();
      log.show('afterCompaction', afterCompaction);
      log.show('planEstimateAfterCompaction', planEstimate(it.session));
      it.close();

      const window = afterTurn?.contextWindow;
      if (afterTurn?.tokens === undefined || afterTurn.tokens === null) {
        return result(probe, 'unavailable', log, 'No token figure was reported after an ordinary turn.');
      }
      if (window !== 40_000) {
        return result(probe, 'verified-with-limitation', log, `contextWindow reported ${String(window)} rather than the model’s own 40000.`);
      }
      const nulled = afterCompaction?.tokens === null;
      return result(probe, 'verified-with-limitation', log,
        `\`tokens\` is never an exact provider figure: pi computes \`calculateContextTokens(lastAssistantUsage) + estimateTokens(messages after it)\`, which charges cacheWrite as well and counts characters, not bytes. \`contextWindow\` is the model’s. \`tokens\` was ${nulled ? '' : 'not '}null immediately after a compaction with no assistant response since.`);
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
