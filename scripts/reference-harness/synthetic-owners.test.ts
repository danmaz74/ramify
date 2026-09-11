import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { hundredOwnerFiles } from '../probes/fixtures/hundred-owners.js';
import { syntheticOwnerFiles } from '../probes/fixtures/synthetic-owners.js';
import { repositoryRoot } from './plan.js';

it('preserves every frozen S100 path and byte independently of the new generator', () => {
  const files = syntheticOwnerFiles(100);
  expect([...files]).toEqual([...hundredOwnerFiles()]);
  const entries = [...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  expect(createHash('sha256').update(JSON.stringify(entries)).digest('hex')).toBe('d5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897');
});
it.each([0, -1, 1.5, 1001, NaN, Infinity])('rejects an invalid owner count %s', count => {
  expect(() => syntheticOwnerFiles(count)).toThrow('Owner count');
});
it.each([100, 500, 1000])('materializes S%s in owned ignored scratch space with no overwrite', async count => {
  const scratch = join(repositoryRoot, '.reference-work');
  await mkdir(scratch, { recursive: true });
  const owned = await mkdtemp(join(scratch, 'synthetic-'));
  try {
    const root = join(owned, `S${count}`);
    const argv = ['--import', 'tsx', join(repositoryRoot, 'scripts/measurements/materialize.ts'), root, `S${count}`];
    const run = spawnSync(process.execPath, argv, { cwd: repositoryRoot, encoding: 'utf8', timeout: 30_000 });
    expect([run.error, run.status, run.stderr]).toEqual([undefined, 0, '']);
    const metadata = JSON.parse(run.stdout);
    expect([metadata.owners, metadata.files, metadata.fixture]).toEqual([count, count * 14 + 2, `S${count}`]);
    const files = syntheticOwnerFiles(count);
    expect([...files.keys()].filter(path => path.endsWith('module.ramify'))).toHaveLength(count);
    expect([...files.keys()].filter(path => path.endsWith('.ts'))).toHaveLength(count * 11);
    for (const [path, text] of files) expect(await readFile(join(root, path), 'utf8')).toBe(text);
    expect(spawnSync(process.execPath, argv, { cwd: repositoryRoot, encoding: 'utf8' }).status).toBe(1);
    expect(await readFile(join(root, 'module.ramify'), 'utf8')).toBe(files.get('module.ramify'));
  } finally { await rm(owned, { recursive: true, force: true }); }
}, 60_000);
