import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureExplorerWebProcess } from '../web-launcher.js';
import { explorerProcessAlive, explorerProjectUrl, readExplorerProcessRecord,
  selectExplorerEndpoint } from '../web-discovery.js';

const roots: string[] = [];
const fixture = fileURLToPath(new URL('./web-launcher-fixture.mjs', import.meta.url));
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

async function endpoint() {
  const directory = await mkdtemp(join(tmpdir(), 'ramify-explorer-launch-'));
  await chmod(directory, 0o700); roots.push(directory);
  return selectExplorerEndpoint({ directory, buildKey: '0123456789abcdef' });
}

describe('explorer process discovery and launch', () => {
  it('starts once, proves readiness, reuses compatibly and constructs an opaque URL', async () => {
    const selected = await endpoint();
    const first = await ensureExplorerWebProcess({ endpoint: selected, version: '1.2.3', explorerEntry: fixture, startupMs: 3000 });
    try {
      expect(first.started).toBe(true);
      const second = await ensureExplorerWebProcess({ endpoint: selected, version: '1.2.3', explorerEntry: fixture, startupMs: 1000 });
      expect(second).toMatchObject({ started: false, record: { instanceId: first.record.instanceId, pid: first.record.pid } });
      expect(explorerProjectUrl(first.record, { context: 'ctx/1:with path', generation: 'gen/1:a/b' }))
        .toBe(`${first.record.origin}/explore/ctx%2F1%3Awith%20path/gen%2F1%3Aa%2Fb`);
    } finally { await first.terminateOwned(); }
    expect(await readExplorerProcessRecord(selected)).toMatchObject({ state: 'stopped', stopped: { reason: 'failed' } });
  });

  it('terminates the child it owns when readiness never arrives', async () => {
    const selected = await endpoint();
    await expect(ensureExplorerWebProcess({ endpoint: selected, version: '1.2.3-unready', explorerEntry: fixture, startupMs: 200 }))
      .rejects.toThrow('timed out');
    const pid = Number(await readFile(join(selected.directory, 'unready.pid'), 'utf8'));
    expect(explorerProcessAlive(pid)).toBe(false);
  });
});
