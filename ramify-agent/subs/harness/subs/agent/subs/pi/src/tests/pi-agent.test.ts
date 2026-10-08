import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { scriptedProvider, scriptedRuntime } from './helpers/scripted-provider.js';
import { createPiAgentOn, permissiveSchema } from '../pi-agent.js';
import { nativeCall, nativeText, preservingPi, submission } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
describe('the preserving Pi port', () => {
  test('sends exact stable instructions and only declared tools through the supported transport', async () => {
    const f = await preservingPi(cleanups, [[nativeCall('submit_map', { summary: 'Done' })]], { instructions: 'EXACT INITIAL INSTRUCTIONS' });
    const result = await (await f.operations.continue(f.input())).settled();
    expect(result.outcome).toEqual({ kind: 'submitted', input: { summary: 'Done' } });
    expect(f.native.requests[0]!['instructions']).toBe('EXACT INITIAL INSTRUCTIONS');
    expect((f.native.requests[0]!['tools'] as Array<{ name: string }>).map(tool => tool.name)).toEqual(['submit_map']);
    expect(f.native.transports).toEqual(['sse']); f.native.verify();
    expect('startSession' in f.agent).toBe(false); expect('appendContext' in f.agent).toBe(false);
  });
  test('a rejection is returned and corrected within the same durable operation', async () => {
    const f = await preservingPi(cleanups, [[nativeCall('submit_map', { summary: 1 }, 'bad')], [nativeCall('submit_map', { summary: 'Correct' }, 'good')]], { verdicts: [{ accepted: false, errors: ['summary must be text'] }, { accepted: true }] });
    const result = await (await f.operations.continue(f.input())).settled();
    expect(result.outcome).toEqual({ kind: 'submitted', input: { summary: 'Correct' } });
    expect(f.judged).toEqual([{ summary: 1 }, { summary: 'Correct' }]);
    expect(JSON.stringify(f.native.requests[1]!['input'])).toContain('summary must be text'); f.native.verify();
  });
  test('a final rejection makes no second provider request', async () => {
    const f = await preservingPi(cleanups, [[nativeCall('submit_map', { summary: 'Rejected' })]], { verdicts: [{ accepted: false, final: true, errors: ['final'] }] });
    expect((await (await f.operations.continue(f.input())).settled()).outcome?.kind).toBe('ended');
    expect(f.native.dispatches()).toBe(1); f.native.verify();
  });
  test('tool errors reach the model and raw structured submission input reaches its owner unchanged', async () => {
    const f = await preservingPi(cleanups, [[nativeCall('echo', {}, 'echo')], [nativeCall('submit_map', { summary: '["raw JSON string"]' })]], { tools: [{ name: 'echo', description: 'Echo', inputSchema: {}, execute: async () => ({ text: 'Exact tool failure', isError: true }) }] });
    await (await f.operations.continue(f.input())).settled();
    expect(JSON.stringify(f.native.requests[1]!['input'])).toContain('Exact tool failure'); expect(f.judged).toEqual([{ summary: '["raw JSON string"]' }]); f.native.verify();
  });
  test('a credentialed unsupported transport is unavailable with zero provider dispatch', async () => {
    const f = await preservingPi(cleanups, []); const scripted = scriptedProvider([]); const isolated = await scriptedRuntime(scripted); cleanups.push(isolated.remove);
    const operations = createPiAgentOn({ runtime: async () => isolated.runtime, agentDirectory: isolated.agentDirectory, model: 'scripted/scripted-1' }).bindSessionStore!(f.store);
    const result = await (await operations.continue(f.input())).settled();
    expect(result.status).toBe('unavailable'); expect(result.point).toBeNull(); expect(scripted.requests).toEqual([]); expect(f.native.dispatches()).toBe(0);
  });
  test('the permissive declaration retains top-level names while the owner validates the full schema', () => {
    expect(permissiveSchema(submission.inputSchema)).toEqual({ type: 'object', properties: { summary: {} } });
  });
});
