import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { syntheticOwnerFiles } from '../probes/fixtures/synthetic-owners.js';

/** Importable by sequence and measurement consumers; preserves the CLI recipe. */
export async function materializeSynthetic(destination: string, fixture: 'S100' | 'S500' | 'S1000' = 'S100') {
  assert.ok(['S100', 'S500', 'S1000'].includes(fixture), 'Unknown synthetic fixture');
  const root = resolve(destination);
  // Validate and construct bytes before creating the destination. Existing paths
  // are never overwritten; callers own ignored scratch space and its cleanup.
  const ownerCount = Number(fixture.slice(1));
  const files = syntheticOwnerFiles(ownerCount);
  await mkdir(root, { recursive: false });
  const entries = [...files.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const contentMapSha256 = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
  if (ownerCount === 100) assert.equal(contentMapSha256, 'd5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897');
  for (const [path, text] of entries) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  }
  return { generator: 'scripts/probes/fixtures/synthetic-owners.ts', fixture, owners: ownerCount,
    contentMapSha256, files: entries.length, bytes: entries.reduce((total, [, text]) => total + Buffer.byteLength(text), 0) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const destination = process.argv[2], fixture = process.argv[3] ?? 'S100';
  assert.ok(process.argv.length <= 4 && ['S100', 'S500', 'S1000'].includes(fixture), 'Usage: materialize.ts <new-directory> [S100|S500|S1000]');
  assert.ok(destination, 'Supply a new, owned synthetic-fixture directory');
  process.stdout.write(JSON.stringify(await materializeSynthetic(destination, fixture as 'S100' | 'S500' | 'S1000')) + '\n');
}
