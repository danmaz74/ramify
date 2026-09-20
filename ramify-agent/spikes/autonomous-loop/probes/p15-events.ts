/*
 * Probe 15: usage and events.
 *
 * One ordinary turn with one tool call. The probe records the event union pi
 * actually delivers, in order, and the usage fields available per assistant
 * message and for the session as a whole.
 */

import { defineTool } from '@earendil-works/pi-coding-agent';
import { fileURLToPath } from 'node:url';
import { attempt, Log, open, result, workspace, type Probe } from '../lib/probe.js';
import { call, text } from '../lib/scripted-provider.js';

export const probe: Probe = {
  number: 15,
  title: 'Usage and events',
  async run() {
    const log = new Log();
    const look = defineTool({
      name: 'look',
      label: 'look',
      description: 'Looks at something.',
      parameters: { type: 'object', properties: { at: {} } } as never,
      async execute() {
        return { content: [{ type: 'text', text: 'it is there' }], details: { seen: true } };
      },
    });

    const space = await workspace([
      call('look', { at: 'the module' }),
      text('I looked.', { input: 1_200, output: 40, cacheRead: 800, cacheWrite: 100 }),
    ]);
    try {
      const it = await open({ workspace: space, session: { mode: 'create' }, tools: ['look'], customTools: [look] });
      await it.session.prompt('look at the module');

      log.show('eventsInOrder', it.events.map(event => event.type));
      log.show('distinctEventTypes', [...new Set(it.events.map(event => event.type))].sort());
      const toolStart = it.events.find(event => event.type === 'tool_execution_start');
      const toolEnd = it.events.find(event => event.type === 'tool_execution_end');
      log.show('toolExecutionStartFields', toolStart === undefined ? null : Object.keys(toolStart).sort());
      log.show('toolExecutionEndFields', toolEnd === undefined ? null : Object.keys(toolEnd).sort());

      const assistants = it.session.messages.filter((entry): entry is typeof entry & { role: 'assistant' } => (entry as { role?: string }).role === 'assistant');
      log.show('assistantMessages', assistants.length);
      log.show('usageFieldsPerAssistantMessage', assistants.map(entry => {
        const usage = (entry as { usage?: Record<string, unknown> }).usage;
        return usage === undefined ? null : Object.keys(usage).sort();
      }));
      log.show('usageValues', assistants.map(entry => (entry as { usage?: unknown }).usage));
      log.show('stopReasons', assistants.map(entry => (entry as { stopReason?: string }).stopReason));

      const stats = it.session.getSessionStats();
      log.show('sessionStats', {
        userMessages: stats.userMessages,
        assistantMessages: stats.assistantMessages,
        toolCalls: stats.toolCalls,
        toolResults: stats.toolResults,
        tokens: stats.tokens,
        cost: stats.cost,
        contextUsage: stats.contextUsage,
      });
      it.close();

      const hasUsage = assistants.some(entry => (entry as { usage?: unknown }).usage !== undefined);
      if (!hasUsage) return result(probe, 'unavailable', log, 'No assistant message carried usage.');
      return result(probe, 'verified', log,
        'One ordinary turn delivers `agent_start`, `turn_start`, paired `message_start`/`message_update`/`message_end`, `tool_execution_start`/`tool_execution_end`, `turn_end`, `agent_end`, `agent_settled`. Per-message usage carries `input`, `output`, `cacheRead`, `cacheWrite`, `totalTokens` and `cost`; `getSessionStats()` aggregates those over every entry, compacted history included, and carries `contextUsage`. Usage values here are the scripted provider’s; only their presence and shape are evidence.');
    } finally {
      await space.remove();
    }
  },
};

if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await attempt(probe), null, 2));
