import { afterAll, vi } from 'vitest';
import { forgetMemorySessionStores } from './memory-session-store.js';

// Real workflow/session logic, with a cheap persistence boundary. Small tests
// of the disk adapter explicitly unmock their own subject.
vi.mock('../../run/session-store.js', async () => {
  const { openMemorySessionStore } = await import('./memory-session-store.js');
  return { openSessionStore: openMemorySessionStore };
});
afterAll(forgetMemorySessionStores);
