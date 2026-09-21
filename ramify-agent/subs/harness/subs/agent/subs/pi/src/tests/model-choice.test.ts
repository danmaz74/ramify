import { afterEach, beforeAll, describe, expect, test } from 'vitest';
import { startPi, validMap } from './helpers/session.js';
import { call } from './helpers/scripted-provider.js';

/*
 * The model request as the adapter is given it, through the real pi adapter
 * on the offline scripted provider. pi's resolver parses a thinking level
 * from `provider/model:level` but leaves applying it to the caller, so a
 * dropped level would run the model at pi's default without a sign.
 */

beforeAll(() => { process.env.PI_OFFLINE = '1'; });

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('the model request', () => {
  test('a thinking level named after the model reaches every request of the session', async () => {
    const harness = await startPi(cleanups, [call('submit_implementation_map', validMap)], { model: 'scripted/scripted-1:high', reasoning: true });
    await harness.session.outcome;
    expect(harness.scripted.requests.length).toBeGreaterThan(0);
    expect(harness.scripted.requests.map(request => request.reasoning)).toEqual(harness.scripted.requests.map(() => 'high'));
  });

  test('a model named without a level runs at pi\'s own default, not at a level the harness chose', async () => {
    const harness = await startPi(cleanups, [call('submit_implementation_map', validMap)], { model: 'scripted/scripted-1', reasoning: true });
    await harness.session.outcome;
    expect(harness.scripted.requests[0]?.reasoning).not.toBe('high');
  });
});
