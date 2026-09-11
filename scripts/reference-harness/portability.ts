import { realpath } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { repositoryRoot } from './plan.js';

/** Preserve useful source paths while removing machine and scratch locations. */
export function portableValue<T>(value: T, roots: readonly (readonly [string, string])[]): T {
  const ordered = roots.map(([root, label]) => [root.replace(/\/+$/, ''), label] as const)
    .filter(([root]) => root.length > 1).sort(([a], [b]) => b.length - a.length);
  return JSON.parse(JSON.stringify(value, (_key, item: unknown) => {
    if (typeof item !== 'string') return item;
    let text = item;
    for (const [root, label] of ordered) text = text.replaceAll(root, label);
    return text.replace(/\.reference-work\/run-[^/\s"']+/g, '.reference-work/<run>');
  })) as T;
}

export async function evidenceRoots(): Promise<readonly (readonly [string, string])[]> {
  return [
    [resolve(repositoryRoot, 'examples/collection-review'), '<reference>'], [resolve(repositoryRoot), '<toolkit>'],
    [await realpath(join(repositoryRoot, 'node_modules')), '<toolkit-dependencies>'],
    [tmpdir(), '<temporary>'], [homedir(), '<home>'], [process.execPath, 'node'],
  ];
}
