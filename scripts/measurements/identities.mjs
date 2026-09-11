import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { sha256 } from './common.mjs';

export function filesUnder(root) {
  return readdirSync(root, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
    if (entry.isSymbolicLink() || ['node_modules', 'dist', '.reference-work', '.git'].includes(entry.name)) return [];
    const path = join(root, entry.name);
    return entry.isDirectory() ? filesUnder(path) : entry.isFile() ? [path] : [];
  });
}

export function treeIdentity(root) {
  const entries = filesUnder(root).map(path => [relative(root, path), sha256(readFileSync(path))]);
  return { files: entries.length, sha256: sha256(JSON.stringify(entries)) };
}
