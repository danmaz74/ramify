import { describe, expect, it } from 'vitest';
import { membershipCases, membershipWitness, type MembershipCase, type MembershipEvidence } from './retained-membership.js';

const timeout = 120_000;

/** SE-6: one incremental update equals a fresh adapter over the same disk and keeps the warm server. */
function expectFreshEquality(evidence: MembershipEvidence): void {
  expect(evidence.incremental.program).toEqual(evidence.fresh.program);
  expect(evidence.incremental.descriptions).toBe(evidence.fresh.descriptions);
  expect(evidence.incremental.catalog).toBe(evidence.fresh.catalog);
  expect(evidence.incremental.accesses).toBe(evidence.fresh.accesses);
  expect([evidence.sameServer, evidence.liveSnapshots]).toEqual([true, 1]);
}

/** SE-7: every contribution of the affected files that a fresh adapter observes reaches the sink during the update. */
function expectReported(evidence: MembershipEvidence): void {
  expect(evidence.unreported).toEqual([]);
}

/** An update whose program outside the owned files is unchanged and whose file reaches nothing globally. */
const bounded = { added: [], removed: [], global: [], spelled: true };

const pkgReads = { 'node_modules/pkg/other.d.ts': ['file', 'probe'], 'node_modules/pkg/package.json': ['file', 'probe'] };
const probes = (paths: readonly string[]): Record<string, string[]> => Object.fromEntries(paths.map(path => [path, ['probe']]));

async function witness(change: MembershipCase): Promise<MembershipEvidence> {
  const evidence = await membershipWitness(change);
  expectFreshEquality(evidence);
  expectReported(evidence);
  return evidence;
}

describe('membership-incremental-equal, membership-reads-reported, membership-identity-equals-batch: a created or deleted file without a whole invalidation', () => {
  it('a created unreferenced file is read, described alone and reported with its own contributions', async () => {
    const evidence = await witness(membershipCases['created unreferenced']);
    expect(evidence.reach).toEqual(bounded);
    expect(evidence.recomputed).toEqual(['src/fresh.ts']);
    expect(evidence.reread).toEqual(['src/fresh.ts', 'tsconfig.json']);
    expect(evidence.affected).toEqual(['src/fresh.ts']);
    expect(evidence.contributed).toEqual(['src/api.ts', 'src/fresh.ts']);
    expect(evidence.changedFile).toEqual(['file', 'probe']);
    // Specifier spellings are candidates, never observations.
    expect(evidence.unobserved).toEqual(['src/api.js']);
    expect(evidence.freshNotReported).toEqual(pkgReads);
    expect(evidence.obsoleteUnattributed).toEqual({});
  }, timeout);

  it('a created file satisfying an importer\'s absence probe is reported as read, and the importer\'s contributions are reported', async () => {
    const evidence = await witness(membershipCases['created satisfying a probed specifier']);
    expect(evidence.reach).toEqual(bounded);
    expect(evidence.recomputed).toEqual(['src/hub.ts', 'src/later.ts']);
    expect(evidence.reread).toEqual(['src/later.ts', 'tsconfig.json']);
    expect(evidence.affected).toEqual(['src/consumer.ts', 'src/hub.ts', 'src/later.ts']);
    expect(evidence.contributed).toEqual(['src/api.ts', 'src/consumer.ts', 'src/hub.ts', 'src/later.ts', 'src/remove.ts']);
    expect(evidence.changedFile).toEqual(['file', 'probe']);
    expect(evidence.freshNotReported).toEqual(pkgReads);
    // The compiler's own resolution probes of the old failure: no contribution names them.
    expect(evidence.obsoleteUnattributed).toEqual(probes(['src/later.js.d.ts', 'src/later.js.js', 'src/later.js.jsx', 'src/later.js.ts', 'src/later.js.tsx']));
  }, timeout);

  it('a created file satisfying an extensionless specifier recomputes the re-exporter whose absent base it completes', async () => {
    const evidence = await witness(membershipCases['created satisfying an extensionless specifier']);
    expect(evidence.reach).toEqual(bounded);
    expect(evidence.recomputed).toEqual(['src/barehub.ts', 'src/soon.ts']);
    expect(evidence.reread).toEqual(['src/soon.ts', 'tsconfig.json']);
    expect(evidence.affected).toEqual(['src/bare.ts', 'src/barehub.ts', 'src/soon.ts']);
    expect(evidence.contributed).toEqual(['src/bare.ts', 'src/barehub.ts', 'src/soon.ts']);
    expect(evidence.changedFile).toEqual(['file', 'probe']);
    expect(evidence.freshNotReported).toEqual(pkgReads);
    expect(evidence.obsoleteUnattributed).toEqual(probes(['src/soon.d.ts', 'src/soon.js', 'src/soon.jsx', 'src/soon.tsx']));
  }, timeout);

  it('a deleted referenced file leaves the program and its importers\' new absence probes are reported', async () => {
    const evidence = await witness(membershipCases['deleted referenced']);
    expect(evidence.incremental.program['src/remove.ts']).toBe(false);
    expect(evidence.reach).toEqual(bounded);
    expect(evidence.recomputed).toEqual(['src/hub.ts']);
    expect(evidence.reread).toEqual(['tsconfig.json']);
    expect(evidence.affected).toEqual(['src/hub.ts', 'src/remove.ts', 'src/user.ts']);
    expect(evidence.contributed).toEqual(['src/hub.ts', 'src/later.d.ts', 'src/later.js', 'src/later.jsx', 'src/later.ts', 'src/later.tsx',
      'src/remove.d.ts', 'src/remove.js', 'src/remove.jsx', 'src/remove.ts', 'src/remove.tsx', 'src/user.ts']);
    expect(evidence.changedFile).toEqual(['probe']);
    expect(evidence.freshNotReported).toEqual(pkgReads);
    expect(evidence.obsoleteUnattributed).toEqual(probes(['src/ghost.js.d.ts', 'src/ghost.js.js', 'src/ghost.js.jsx', 'src/ghost.js.ts', 'src/ghost.js.tsx']));
  }, timeout);

  it('a deleted unreferenced file leaves the program with the dependency package only it reached', async () => {
    const evidence = await witness(membershipCases['deleted unreferenced']);
    expect([evidence.incremental.program['src/lonely.ts'], evidence.incremental.program['node_modules/pkg/other.d.ts']]).toEqual([false, false]);
    // The package leaves the program with its sole importer: the session cannot keep its reads.
    expect(evidence.reach).toEqual({ ...bounded, removed: ['node_modules/pkg/index.d.ts', 'node_modules/pkg/other.d.ts'] });
    expect(evidence.recomputed).toEqual([]);
    expect(evidence.reread).toEqual(['tsconfig.json']);
    expect(evidence.affected).toEqual(['src/lonely.ts']);
    expect(evidence.contributed).toEqual([]);
    expect(evidence.freshNotReported).toEqual({});
    // The package's reads and probes are reached through the deleted file, but only its
    // index declaration is a candidate of it.
    expect(evidence.obsoleteUnattributed).toEqual({ ...probes(['node_modules/pkg', 'node_modules/pkg.d.ts', 'node_modules/pkg.ts', 'node_modules/pkg.tsx']),
      ...pkgReads, ...probes(['node_modules/pkg/other.ts', 'node_modules/pkg/other.tsx', 'src/node_modules']) });
  }, timeout);
});
