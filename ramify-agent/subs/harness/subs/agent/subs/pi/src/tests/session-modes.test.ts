import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { createPiAgentOn } from '../pi-agent.js';
import { nativeText, preservingPi } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
describe('Pi structured points and model-free additions', () => {
  test('continues the persisted exact point through a new adapter and replays the same operation without dispatch', async () => {
    const f = await preservingPi(cleanups, [[nativeText('One')], [nativeText('Two')]]);
    const T1 = await (await f.operations.continue(f.input())).settled();
    const next = createPiAgentOn(f.source).bindSessionStore!(f.store); const input = f.input(T1.point!, 'second');
    const T2 = await (await next.continue(input)).settled();
    expect(T2.sessionId).toBe(T1.sessionId); expect(T2.turn).toBe(2);
    expect(await (await next.continue(input)).settled()).toEqual(T2); expect(f.native.dispatches()).toBe(2); f.native.verify();
  });
  test('appends once with no model call, and the next request receives that checkpoint', async () => {
    const f = await preservingPi(cleanups, [[nativeText('One')], [nativeText('Two')]]); const T1 = await (await f.operations.continue(f.input())).settled();
    const input = { runId: 'pi-test', operationId: 'brief', sessionId: T1.sessionId, expectedPoint: T1.point!, additions: [{ key: 'brief', kind: 'brief' as const, text: 'ACCEPTED BRIEF', revision: '1' }] };
    const C1 = await f.operations.appendContext(input); expect(await f.operations.appendContext(input)).toEqual(C1); expect(f.native.dispatches()).toBe(1);
    await (await f.operations.continue(f.input(C1.point!, 'next'))).settled();
    expect(JSON.stringify(f.native.requests[1]!['input']).split('ACCEPTED BRIEF')).toHaveLength(2); f.native.verify();
  });
  test('a missing parent yields unavailable and never creates a replacement session or dispatches', async () => {
    const f = await preservingPi(cleanups, []);
    const result = await f.operations.fork({ runId: 'pi-test', operationId: 'missing', sourcePoint: { sessionId: 'gone', kind: 'turn', turn: 1, checkpoint: 'gone' } });
    expect(result.status).toBe('unavailable'); expect(result.point).toBeNull(); expect(f.native.dispatches()).toBe(0); expect(f.records.size).toBe(2);
  });
});
