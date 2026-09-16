import { chmod, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { selectEndpoint } from '../../subs/daemon/src/discovery.js';
import { repositoryRoot, tracedProcess } from './process.js';

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe('explorer process boundary', () => {
  it('reports daemon unavailability without loading or spawning an analyzer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ramify-ex6-'));
    await chmod(directory, 0o700); roots.push(directory);
    const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version: '0.0.0', endpointDirectory: directory });
    const result = await tracedProcess(join(repositoryRoot, 'dist/src/explorer-entry.js'),
      ['--endpoint-dir', directory, '--build-key', endpoint.buildKey, '--version', '0.0.0'],
      { cwd: repositoryRoot, env: { RAMIFY_ENDPOINT_DIR: directory }, timeoutMs: 5000 });
    expect([result.code, result.signal]).toEqual([1, null]);
    expect(result.stderr).toContain('No compatible daemon is running');
    expect(result.events.filter(event => event.event === 'spawn')).toEqual([]);
    const loaded = result.events.flatMap(event => [event.url ?? '', ...event.commonjs ?? []]);
    expect(loaded.filter(path => /\/dist\/subs\/analysis\/src\/(?:session-engine|session-worker|session-host)\.js$/.test(path)
      || /\/node_modules\/typescript\//.test(path))).toEqual([]);
    expect((await readdir(directory)).filter(path => /^explorer-.*\.json$/.test(path))).toEqual([]);
  });
});
