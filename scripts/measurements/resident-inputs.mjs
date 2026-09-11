import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { packageRoot, sha256 } from './common.mjs';
import { filesUnder, treeIdentity } from './identities.mjs';

/** Generated measurements are outputs; every executable recipe is an input. */
export function residentInputs() {
  const hash = path => ({ path, sha256: sha256(readFileSync(join(packageRoot, path))) });
  return {
    build: treeIdentity(join(packageRoot, 'dist')),
    source: { root: treeIdentity(join(packageRoot, 'src')), owners: treeIdentity(join(packageRoot, 'subs')) },
    manifests: ['package.json', 'package-lock.json', 'module.ramify', 'docs/plans/iteration-2-resident-verification/scope.md'].map(hash),
    recipes: filesUnder(join(packageRoot, 'scripts/measurements')).filter(path => /\.(mjs|ts)$/.test(path))
      .map(path => hash(relative(packageRoot, path))),
    fixtureGenerator: hash('scripts/probes/fixtures/synthetic-owners.ts'),
    reference: treeIdentity(join(packageRoot, 'examples/collection-review')),
  };
}
export function residentDependencies() {
  return Object.fromEntries(['typescript', 'tsx'].map(name =>
    [name, JSON.parse(readFileSync(join(packageRoot, 'node_modules', name, 'package.json'), 'utf8')).version]));
}
