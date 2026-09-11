import { cp, mkdir, readdir, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { repositoryRoot } from '../../plan.js';
import type { ProjectFixture } from '../../mutation.js';

export const referenceRoot = join(repositoryRoot, 'examples/collection-review');
export const referenceEditFixture: ProjectFixture = { kind: 'copy', sourceRoot: referenceRoot };
export const workspaceDescription = 'subs/workspace/module.ramify';
export const coreDirectory = 'subs/workspace/subs/catalog/subs/core';
export const coreDescription = `${coreDirectory}/module.ramify`;
export const vocabulary = 'subs/workspace/subs/contracts/src/interfaces/vocabulary.ts';
export const cssShim = 'node_modules/vite/client.d.ts';

/** Dependencies of a disposable R copy. Only the shim variant owns Vite bytes. */
export async function prepareReferenceEdits(root: string, mutableCssShim = false): Promise<void> {
  const source = join(referenceRoot, 'node_modules');
  const target = join(root, 'node_modules');
  if (!mutableCssShim) {
    await symlink(source, target);
    return;
  }
  // Never edit through the ordinary shared node_modules symlink. Copy Vite,
  // including its relative declaration references, and link other dependencies.
  await mkdir(target);
  for (const entry of await readdir(source)) {
    if (entry === 'vite') await cp(join(source, entry), join(target, entry), { recursive: true, dereference: true });
    else await symlink(join(source, entry), join(target, entry));
  }
}
