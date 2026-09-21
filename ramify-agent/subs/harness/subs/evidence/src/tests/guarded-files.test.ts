import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { guardedConfigurationFiles, guardedFilesHash } from '../guarded-files.js';
import { temporaryDirectory } from './helpers/temporary.js';

/** One hash per guarded file, so that a change names the file that changed. */
describe('guardedFilesHash', () => {
  let directory: { path: string; remove: () => Promise<void> };
  const write = (path: string, content: string) => writeFile(join(directory.path, path), content);

  beforeEach(async () => {
    directory = await temporaryDirectory();
    await write('package.json', '{"name":"project"}\n');
    await write('tsconfig.json', '{"files":[]}\n');
    await write('vitest.config.ts', 'export default {};\n');
  });
  afterEach(async () => {
    await directory.remove();
  });

  it('hashes the configuration and the manifests, and records an absent one as absent', async () => {
    const hashes = await guardedFilesHash(directory.path);

    expect(hashes.map(file => file.path)).toEqual([...guardedConfigurationFiles].sort());
    expect(hashes.find(file => file.path === 'package.json')?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashes.find(file => file.path === 'package-lock.json')?.hash).toBeNull();
  });

  it('hashes exactly the captured set when one is given, once each and in path order', async () => {
    const hashes = await guardedFilesHash(directory.path, ['tsconfig.json', 'package.json', 'tsconfig.json']);

    expect(hashes.map(file => file.path)).toEqual(['package.json', 'tsconfig.json']);
  });

  it('names the file that changed and the file that was deleted', async () => {
    const captured = await guardedFilesHash(directory.path, ['package.json', 'tsconfig.json', 'vitest.config.ts']);

    await write('vitest.config.ts', 'export default { test: { include: [] } };\n');
    await rm(join(directory.path, 'tsconfig.json'));
    const current = await guardedFilesHash(directory.path, captured.map(file => file.path));

    const changes = captured
      .filter((file, index) => current[index]?.hash !== file.hash)
      .map((file, _index) => ({ path: file.path, after: current.find(now => now.path === file.path)?.hash ?? null }));
    expect(changes).toEqual([
      { path: 'tsconfig.json', after: null },
      { path: 'vitest.config.ts', after: expect.stringMatching(/^[0-9a-f]{64}$/) },
    ]);
  });

  it('refuses a path that leaves the project it describes', async () => {
    await mkdir(join(directory.path, 'inner'), { recursive: true });

    await expect(guardedFilesHash(join(directory.path, 'inner'), ['../package.json'])).rejects.toBeInstanceOf(RangeError);
  });
});
