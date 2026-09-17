import { chmod, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ensureExplorerWebProcess, type ExplorerProcessLaunch } from '../web-launcher.js';
import { explorerProcessAlive, explorerProjectKey, explorerProjectUrl, readExplorerProcessRecord,
  reusableExplorerProcess, selectExplorerEndpoint } from '../web-discovery.js';

const roots: string[] = [];
const launched: ExplorerProcessLaunch[] = [];
const fixture = fileURLToPath(new URL('./web-launcher-fixture.mjs', import.meta.url));
const buildKey = '0123456789abcdef';
const contextA = `ctx/1:${'a'.repeat(16)}${'0'.repeat(48)}`;
const contextB = `ctx/1:${'b'.repeat(16)}${'0'.repeat(48)}`;
afterEach(async () => {
  await Promise.all(launched.splice(0).map(item => item.terminateOwned()));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});

async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'ramify-explorer-launch-'));
  await chmod(path, 0o700); roots.push(path);
  return path;
}

/** The fixture reads its identity from the environment the launcher passes on. */
async function launch(endpointDirectory: string, context: string, version: string, startupMs: number) {
  process.env.EXPLORER_FIXTURE_BUILD_KEY = buildKey;
  process.env.EXPLORER_FIXTURE_VERSION = version;
  process.env.EXPLORER_FIXTURE_CONTEXT = context;
  const projectKey = explorerProjectKey(context);
  const result = await ensureExplorerWebProcess({ endpoint: selectExplorerEndpoint({ directory: endpointDirectory, buildKey }, projectKey),
    root: `/projects/${projectKey}`, projectKey, version, explorerEntry: fixture, startupMs });
  launched.push(result);
  return result;
}

describe('explorer process discovery and launch', () => {
  it('derives per-project names and the stable URL', async () => {
    const path = await directory();
    expect(explorerProjectKey(contextA)).toBe('aaaaaaaaaaaaaaaa');
    expect(() => explorerProjectKey('ctx/1:short')).toThrow('Invalid explorer context ID');
    expect(selectExplorerEndpoint({ directory: path, buildKey }, 'aaaaaaaaaaaaaaaa')).toEqual({ directory: path, buildKey,
      projectKey: 'aaaaaaaaaaaaaaaa', record: join(path, `explorer-${buildKey}-aaaaaaaaaaaaaaaa.json`),
      lock: join(path, `explorer-${buildKey}-aaaaaaaaaaaaaaaa.lock`), log: join(path, `explorer-${buildKey}-aaaaaaaaaaaaaaaa.log`) });
    expect(() => selectExplorerEndpoint({ directory: path, buildKey }, 'nothex')).toThrow('Invalid explorer build or project key');
  });

  it('starts once per project with --root, reuses the same project and starts another for a different project', async () => {
    const path = await directory();
    const first = await launch(path, contextA, '1.2.3', 3000);
    expect(first.started).toBe(true);
    expect(first.record).toMatchObject({ root: '/projects/aaaaaaaaaaaaaaaa', context: contextA, state: 'running' });
    expect(explorerProjectUrl(first.record)).toBe(`${first.record.origin}/analysis/latest`);
    const second = await launch(path, contextA, '1.2.3', 1000);
    expect(second).toMatchObject({ started: false, record: { instanceId: first.record.instanceId, pid: first.record.pid } });
    const other = await launch(path, contextB, '1.2.3', 3000);
    expect(other.started).toBe(true);
    expect(other.record.pid).not.toBe(first.record.pid);
    expect(await reusableExplorerProcess(selectExplorerEndpoint({ directory: path, buildKey }, 'bbbbbbbbbbbbbbbb'), '1.2.3'))
      .toMatchObject({ context: contextB });
    await first.terminateOwned();
    const stopped = selectExplorerEndpoint({ directory: path, buildKey }, 'aaaaaaaaaaaaaaaa');
    expect(await readExplorerProcessRecord(stopped)).toMatchObject({ state: 'stopped', stopped: { reason: 'explicit' } });
    expect(await reusableExplorerProcess(stopped, '1.2.3')).toBeNull();
  });

  it('terminates the child it owns when readiness never arrives', async () => {
    const path = await directory();
    await expect(launch(path, contextA, '1.2.3-unready', 200)).rejects.toThrow('timed out');
    const pid = Number(await readFile(join(path, 'unready.pid'), 'utf8'));
    expect(explorerProcessAlive(pid)).toBe(false);
  });
});
