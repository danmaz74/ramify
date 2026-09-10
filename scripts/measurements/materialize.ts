import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { hundredOwnerFiles } from '../probes/fixtures/hundred-owners.js';

const destination = process.argv[2];
assert.ok(destination, 'Supply a new, owned synthetic-fixture directory');
const root = resolve(destination);
await mkdir(root, { recursive: false });
const files = hundredOwnerFiles();
const entries = [...files.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
const contentMapSha256 = createHash('sha256').update(JSON.stringify(entries)).digest('hex');
assert.equal(contentMapSha256, 'd5b77b9ff57c443b35f386f40598506ff20c51c4ec75b800371f0cec089c0897');
for (const [path, text] of entries) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), text);
}
process.stdout.write(JSON.stringify({ generator: 'scripts/probes/fixtures/hundred-owners.ts',
  contentMapSha256, files: entries.length, bytes: entries.reduce((total, [, text]) => total + Buffer.byteLength(text), 0) }) + '\n');
