import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { residentInputs, residentDependencies } from './resident-inputs.mjs';
import { packageRoot, sha256 } from './common.mjs';

export function fastInputs() {
  return { ...residentInputs(), plan5: ['scope.md', 'contracts.md', 'subcases.md'].map(name => {
    const path = `docs/plans/iteration-5-fast-incremental-checks/${name}`;
    return { path, sha256: sha256(readFileSync(join(packageRoot, path))) };
  }) };
}
export const fastDependencies = residentDependencies;
