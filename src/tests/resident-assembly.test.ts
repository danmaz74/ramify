import { describe, expect, it } from 'vitest';
import { createAnalysisDriverFromSessions } from '../resident-assembly.js';
import { fixture } from './fixture.js';

describe('resident analysis driver resolution lifetime', () => {
  it.each(['caller', 'driver'] as const)('cancels pending resolution when the %s ends it', mode => fixture(async root => {
    const driver = createAnalysisDriverFromSessions(), controller = new AbortController();
    const pending = driver.resolve({ cwd: root, root, scope: 'whole-project', configuration: 'discover' },
      { signal: controller.signal });
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    if (mode === 'caller') controller.abort();
    try {
      await driver.dispose();
      await rejected;
      await expect(driver.resolve({ cwd: root, root, scope: 'whole-project', configuration: 'discover' }))
        .rejects.toThrow('disposed');
    } finally { await driver.dispose(); }
  }));
});
