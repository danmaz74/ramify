import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syntheticOwnerFiles } from '../probes/fixtures/synthetic-owners.js';

/** Importable by sequence and measurement consumers; preserves the CLI recipe. */
export type SyntheticFixture = 'S100' | 'S500' | 'S1000' | 'X100';
const syntheticFixtures: readonly SyntheticFixture[] = ['S100', 'S500', 'S1000', 'X100'];

/** X100 is Plan 8's exposing variant of S100: the same owners and files, with exposures. */
export async function materializeSynthetic(destination: string, fixture: SyntheticFixture = 'S100') {
  assert.ok(syntheticFixtures.includes(fixture), 'Unknown synthetic fixture');
  const root = resolve(destination);
  // Validate and construct bytes before creating the destination. Existing paths
  // are never overwritten; callers own ignored scratch space and its cleanup.
  const ownerCount = Number(fixture.slice(1));
  const exposures = fixture.startsWith('X');
  const files = syntheticOwnerFiles(ownerCount, { exposures });
  await mkdir(root, { recursive: false });
  const entries = [...files.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const contentMapSha256 = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  if (ownerCount === 100 && !exposures) assert.equal(contentMapSha256, 'd5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897');
  for (const [path, text] of entries) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return { generator: 'scripts/probes/fixtures/synthetic-owners.ts', fixture, owners: ownerCount, ...(exposures ? { exposures } : {}),
    contentMapSha256, files: entries.length, bytes: entries.reduce((total, [, text]) => total + Buffer.byteLength(text), 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length === 2) {
    const parent = resolve('.reference-work');
    await mkdir(parent, { recursive: true });
    const directory = await mkdtemp(join(parent, 'fast-fixtures-'));
    for (const name of ['S100', 'S500', 'S1000'] as const) {
      const destination = join(directory, name);
      process.stdout.write(JSON.stringify({ destination, ...await materializeSynthetic(destination, name) }) + '\n');
    }
    process.exit(0);
  }
  const destination = process.argv[2], fixture = process.argv[3] ?? 'S100';
  assert.ok(process.argv.length <= 4 && syntheticFixtures.includes(fixture as SyntheticFixture), 'Usage: materialize.ts <new-directory> [S100|S500|S1000|X100]');
  assert.ok(destination, 'Supply a new, owned synthetic-fixture directory');
  process.stdout.write(JSON.stringify(await materializeSynthetic(destination, fixture as SyntheticFixture)) + '\n');
}
