import { describe, expect, it } from 'vitest';
import { flush } from './scripted-driver.js';
import { sessionEnvironment } from './session-fixture.js';

const request = [{ original: { kind: 'code' as const, owner: 'fixture', file: 'index.ts', binding: 'value' }, exportName: 'value' }];

describe('ContextManager.explorerDetails', () => {
  it('binds details to the current published revision and preserves provider outcomes', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const published = e.status(opened.token).published!;
      const ready = await e.manager.explorerDetails({ token: opened.token, requestId: 'details-1',
        revision: published.revision, requests: request }, 'lease');
      expect(ready).toEqual({ status: 'ready', requestId: 'details-1', revision: published, details: [{
        state: 'unavailable', original: request[0]!.original, exportName: 'value', reason: 'missing-export',
      }] });
      expect(e.script.sessions[0]!.explorerDetailsCalls).toEqual([{ sequence: 1, requests: request }]);

      const superseded = await e.manager.explorerDetails({ token: opened.token, requestId: 'details-old',
        revision: published.revision.replace(/:1$/, ':2'), requests: request }, 'lease');
      expect(superseded).toEqual({ status: 'superseded', requestId: 'details-old', revision: published });

      await e.script.sessions[0]!.session.releaseCompiler();
      const unavailable = await e.manager.explorerDetails({ token: opened.token, requestId: 'details-warm',
        revision: published.revision, requests: request }, 'lease');
      expect(unavailable).toMatchObject({ status: 'unavailable', requestId: 'details-warm', reason: 'compiler-released' });
    } finally { await e.dispose(); }
  });

  it('rejects unknown and cancelled requests without invoking a session', async () => {
    const e = sessionEnvironment();
    try {
      const opened = await e.open(); await flush();
      const published = e.status(opened.token).published!;
      const controller = new AbortController(); controller.abort();
      expect(await e.manager.explorerDetails({ token: opened.token, requestId: 'details-cancelled',
        revision: published.revision, requests: request }, 'lease', { signal: controller.signal }))
        .toEqual({ status: 'cancelled', requestId: 'details-cancelled' });
      expect(e.script.sessions[0]!.explorerDetailsCalls).toHaveLength(0);
    } finally { await e.dispose(); }
  });
});
