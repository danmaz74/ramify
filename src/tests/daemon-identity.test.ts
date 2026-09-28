import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { selectEndpoint } from '../../subs/daemon/src/discovery.js';
import { packageEngine, packageVersion, repositoryRoot } from './process.js';
import { withProcessScope } from './lifecycle-process.js';

describe('compiled daemon startup build identity', () => {
  it('rejects foreign build and engine identities before writing any record', async () => {
    await withProcessScope(async scope => {
      const endpoint = await selectEndpoint({ packageRoot: repositoryRoot, version: packageVersion, endpointDirectory: scope.endpointDirectory });
      for (const [buildKey, engine] of [['0000000000000000', packageEngine], [endpoint.buildKey, 'foreign-engine']]) {
        const child = scope.start({ cwd: repositoryRoot, timeoutMs: 5000, args: [join(repositoryRoot, 'dist/src/daemon-entry.js'),
          '--endpoint-dir', endpoint.directory, '--build-key', buildKey, '--version', packageVersion, '--engine', engine] });
        expect((await child.waitForExit(5000)).code).toBe(1);
        expect(child.stderr).toMatch(/identity|build|engine/i);
      }
      expect((await readdir(endpoint.directory)).filter(path => /^daemon-.*\.json$/.test(path))).toEqual([]);
    });
  });
});
