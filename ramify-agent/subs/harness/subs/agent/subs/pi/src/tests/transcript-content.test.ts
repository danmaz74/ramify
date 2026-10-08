import { afterEach, beforeAll, expect, test } from 'vitest';
import { nativeCall, preservingPi } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
test('the public observation stream reports current user, assistant calls, results and usage without transcript file decoding', async () => {
  const f = await preservingPi(cleanups, [[nativeCall('echo', { x: 1 }, 'echo')], [nativeCall('submit_map', { summary: 'Done' }, 'submit')]], { tools: [{ name: 'echo', description: 'Echo', inputSchema: {}, execute: async input => ({ text: JSON.stringify(input) }) }] });
  await (await f.operations.continue(f.input())).settled();
  const messages = f.events.filter(event => event.type === 'message'); expect(messages[0]).toMatchObject({ role: 'user', blocks: [{ type: 'text', text: 'Current task.' }] });
  expect(f.native.requests[0]!['input']).toEqual([{ role: 'user', content: [{ type: 'input_text', text: f.task.message }] }]);
  const assistant = messages.filter(event => event.role === 'assistant'); expect(assistant.some(event => event.usage !== null)).toBe(true);
  const calls = assistant.flatMap(event => event.blocks.filter(block => block.type === 'tool-call')); const results = messages.filter(event => event.role === 'tool-result');
  expect(calls.map(call => call.callId)).toEqual(results.map(result => result.callId)); expect(results[0]).toMatchObject({ blocks: [{ type: 'text', text: '{"x":1}' }] });
  expect((await f.operations.inspect('pi-test', f.initial.sessionId))!.transcript.every(entry => f.payloads.has(entry.payloadId))).toBe(true); f.native.verify();
});
