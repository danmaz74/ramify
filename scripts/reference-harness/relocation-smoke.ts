import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { plan1Instances } from './cases.js';
import { runIsolatedProject } from './mutation.js';
import { repositoryRoot } from './plan.js';
import { assertRelocatedDenial, denyRelocatedReference, prepareRelocatedPackage } from './relocation.js';
import { Assertions } from './runner.js';

/**
 * The relocated-package checks without the copied toolkit's own test suite:
 * the clean copy, build and type check, the packed tarball's entries,
 * stylesheet and optional peers, every installed entry import, and the
 * installed command's baseline and denial. No matrix credit: I1-28 still
 * requires `testRelocatedPackage` through `npm run reference:verify`.
 *
 *     npx tsx scripts/reference-harness/relocation-smoke.ts
 */
const instance = plan1Instances.find(item => item.id === 'I1-28:relocated-package');
if (!instance) throw new Error('I1-28:relocated-package is not a reviewed instance');
const baseline = new Assertions(), negative = new Assertions();
const result = await runIsolatedProject({ workRoot: join(tmpdir(), 'ramify-relocation-work'), instanceId: instance.id,
  fixture: { kind: 'copy', sourceRoot: repositoryRoot } }, async project => {
  await prepareRelocatedPackage({ ...project, instance, assertions: baseline });
  await denyRelocatedReference(project);
  await assertRelocatedDenial({ ...project, instance, assertions: negative });
});
const evidence = [...baseline.finish(), ...negative.finish()];
console.log(JSON.stringify({ evidence: 'relocated-package-without-toolkit-tests', node: process.version,
  at: new Date().toISOString(), passed: result.ok, assertions: evidence.length,
  failed: evidence.filter(item => item.status === 'failed'),
  ...result.ok ? {} : { error: String(result.error instanceof Error ? result.error.stack ?? result.error.message : result.error) },
  names: evidence.map(item => item.name) }, null, 2));
if (!result.ok || evidence.some(item => item.status === 'failed')) process.exitCode = 1;
