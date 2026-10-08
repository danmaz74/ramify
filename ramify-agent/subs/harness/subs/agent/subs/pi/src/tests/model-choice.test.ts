import { afterEach, beforeAll, expect, test } from 'vitest';
import { nativeText, preservingPi } from './helpers/session.js';
const cleanups: Array<() => Promise<void>> = [];
beforeAll(() => { process.env.PI_OFFLINE = '1'; });
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
test('an explicitly requested thinking level reaches the native supported request', async () => {
  const f = await preservingPi(cleanups, [[nativeText('Done')]], { model: 'openai-codex/gpt-5.6-sol:high' });
  await (await f.operations.continue(f.input())).settled(); expect(f.native.requests[0]!['reasoning']).toMatchObject({ effort: 'high' }); f.native.verify();
});
test('an unknown model is unavailable before native request dispatch', async () => {
  const f = await preservingPi(cleanups, [], { model: 'unavailable/no-model' });
  const result = await (await f.operations.continue(f.input())).settled(); expect(result.status).toBe('unavailable'); expect(f.native.dispatches()).toBe(0); expect(result.point).toBeNull();
});
