import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { packageRoot, sha256 } from './common.mjs';
import { filesUnder, treeIdentity } from './identities.mjs';

/** Shared by `plan2a.mjs` (which records it) and `verify-plan2a-evidence.mjs`
 * (which recomputes it fresh and requires an exact match), matching
 * `fast-inputs.mjs`'s own role for the Plan 5 fast recipe: generated
 * measurements are outputs, every executable recipe and source tree is an
 * input. */
export function plan2aInputs() {
  const hash = path => ({ path, sha256: sha256(readFileSync(join(packageRoot, path))) });
  return {
    build: treeIdentity(join(packageRoot, 'dist')),
    source: { root: treeIdentity(join(packageRoot, 'src')), owners: treeIdentity(join(packageRoot, 'subs')) },
    manifests: ['package.json', 'package-lock.json', 'module.ramify'].map(hash),
    recipes: filesUnder(join(packageRoot, 'scripts/measurements')).filter(path => /\.(mjs|ts)$/.test(path))
      .map(path => hash(relative(packageRoot, path))),
    reference: treeIdentity(join(packageRoot, 'examples/collection-review')),
    fixtureGenerator: hash('scripts/probes/fixtures/synthetic-owners.ts'),
  };
}
export function plan2aDependencies() {
  return Object.fromEntries(['typescript', 'tsx'].map(name =>
    [name, JSON.parse(readFileSync(join(packageRoot, 'node_modules', name, 'package.json'), 'utf8')).version]));
}
