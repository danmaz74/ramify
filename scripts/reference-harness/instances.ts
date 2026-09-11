/** Verification data only: these labels never decide Ramify permissions. */
export const verificationCapabilities = [
  'registry', 'parse', 'acquire', 'metadata', 'catalog', 'link',
  'static-access', 'tags-origin', 'namespace', 'lazy', 'symbol-free',
  'resources', 'coverage', 'session', 'cli', 'build-selection', 'regression',
  'harness-gate',
  'increment', 'contexts', 'daemon-service', 'ipc', 'client', 'daemon-process',
  'lifecycle', 'equivalence', 'resident-measure', 'completion',
] as const;

export type VerificationCapability = (typeof verificationCapabilities)[number];
export type FixtureCode = 'R' | 'F' | 'J' | 'T' | 'M' | 'H' | 'Q' | 'P' | 'S100' | 'S500' | 'S1000' | '—';
export type EvidenceKind = 'api' | 'unit' | 'quick' | 'ipc' | 'process' | 'measurement';
export const plan2Directory = 'docs/plans/iteration-2-resident-verification';
export const plan2InventoryDocument = `${plan2Directory}/subcases.md`;

export const planDirectory = 'docs/plans/done/iteration-1-project-verifier';
export const inventoryDocument = `${planDirectory}/subcases.md`;

export interface ReferenceInstance {
  readonly id: string;
  readonly matrixId: string;
  readonly subcase: string;
  readonly variant: string | null;
  readonly iteration: number;
  readonly families: readonly string[];
  readonly requiredCapabilities: readonly VerificationCapability[];
  /** Retain the reviewed stage-specific meaning, especially resource catalog work. */
  readonly capabilityScope: string;
  readonly evidenceKind?: EvidenceKind;
  readonly fixture: {
    readonly code: FixtureCode;
    readonly root: string | null;
    readonly configuration: string | null;
    readonly registry: string;
    readonly recipe: string;
    /** Exact Plan 2 recipe selection, including wrappers and multiplicity. */
    readonly selection?: string;
  };
  readonly mutation: { readonly summary: string; readonly variant: string | null };
  readonly expectation: { readonly summary: string; readonly variant: string | null };
  readonly expectedCoverage: { readonly convention: string; readonly details: string };
  readonly pointers: readonly string[];
}

/** Explicit leaf data transcribed from the reviewed tables, independent of handlers. */
export type InstanceSeed = readonly [
  id: string, iteration: number, families: readonly string[], capabilities: string,
  fixture: FixtureCode, mutation: string, expectation: string,
  variantMutation: string | null, variantExpectation: string | null,
  resident?: { readonly selection: string; readonly evidence: EvidenceKind },
];

export function capabilitiesFor(scope: string, iteration: number): VerificationCapability[] {
  const labels = scope.split(', ').flatMap((label) => {
    if (label === 'all bounded source forms') {
      return ['static-access', 'tags-origin', 'namespace', 'lazy', 'symbol-free', 'resources', 'coverage'];
    }
    // I6/I7 resources are catalog evidence; I10 checks origin through tags-origin.
    // Requiring I12 resource-access there would introduce a future prerequisite.
    return label === 'resources' && iteration < 12 ? ['catalog'] : [label];
  });
  for (const label of labels) {
    if (!verificationCapabilities.includes(label as VerificationCapability)) {
      throw new Error(`Unknown verification capability: ${label}`);
    }
  }
  return [...new Set(labels)] as VerificationCapability[];
}

export function instanceFromSeed(seed: InstanceSeed): ReferenceInstance {
  if (seed[9]) return plan2InstanceFromSeed(seed);
  const [id, iteration, families, capabilityScope, code, mutation, expectation,
    variantMutation, variantExpectation] = seed;
  const [group, variant = null] = id.split('/');
  const [matrixId, subcase] = group.split(':');
  const disk = code !== 'M' && code !== 'H';
  return {
    id, matrixId, subcase, variant, iteration, families, capabilityScope,
    requiredCapabilities: capabilitiesFor(capabilityScope, iteration),
    fixture: {
      code,
      root: code === 'M' ? null : `.reference-work/<run-id>/${id}/project/`,
      configuration: disk ? 'tsconfig.json (discover; whole-project)' : null,
      registry: code === 'M' ? 'Explicit resolved registry per independent row expectation'
        : code === 'H' ? 'Not applicable'
        : id === 'I1-04:syntax-valid/custom-tag' ? 'Default plus custom-tag required-importer; parser receives text only'
        : 'Default resolved registry',
      recipe: `${inventoryDocument}#fixture-and-assertion-conventions`,
    },
    mutation: { summary: mutation, variant: variantMutation },
    expectation: { summary: expectation, variant: variantExpectation },
    expectedCoverage: {
      convention: `${inventoryDocument}#fixture-and-assertion-conventions`,
      details: [expectation, variantExpectation].filter(Boolean).join(' '),
    },
    pointers: [
      `${planDirectory}/main-plan.md#reference-acceptance-matrix`,
      `${inventoryDocument}#required-matrix-subcases`,
      ...(variant ? [`${inventoryDocument}#explicit-variant-execution-records`] : []),
      'docs/plans/reference-project/cases.md',
      'docs/plans/reference-project/contract-map.md#exposing-statements',
      ...([...new Set(families.map((family) => family.replace(/\d+$/, '')))]
        .flatMap((prefix) => prefix === 'DA' ? ['docs/architecture/daemon.md#acceptance-evidence']
          : prefix === 'PC' ? ['docs/architecture/processes-and-clients.md#acceptance-evidence']
          : prefix === 'QT' ? ['docs/architecture/quick-testing.spec.md#complementary-verification'] : [])),
      `${planDirectory}/iterations/iteration${iteration}.md`,
    ],
  };
}

/** Plan 2 meanings never inherit Plan 1 resource-stage or fixture recipes. */
function plan2InstanceFromSeed(seed: InstanceSeed): ReferenceInstance {
  const [id, iteration, families, capabilityScope, code, mutation, expectation, , , resident] = seed;
  if (!resident) throw new Error(`Missing Plan 2 metadata: ${id}`);
  const [matrixId, subcase] = id.split(':');
  const requiredCapabilities = capabilityScope.split(', ') as VerificationCapability[];
  for (const capability of requiredCapabilities) {
    if (!verificationCapabilities.includes(capability)) throw new Error(`Unknown Plan 2 capability: ${capability}`);
  }
  const disk = code !== 'M' && code !== 'H';
  return {
    id, matrixId, subcase, variant: null, iteration, families, capabilityScope,
    requiredCapabilities, evidenceKind: resident.evidence,
    fixture: {
      code, root: disk ? `.reference-work/<run-id>/${id}/project/` : null,
      configuration: disk && !['P', '—'].includes(resident.selection) ? 'tsconfig.json (discover; whole-project)' : null,
      registry: disk ? 'Default resolved registry' : 'Not applicable; scripted fixture',
      recipe: `${plan2InventoryDocument}#fixture-and-evidence-conventions`, selection: resident.selection,
    },
    mutation: { summary: mutation, variant: null }, expectation: { summary: expectation, variant: null },
    expectedCoverage: { convention: `${plan2InventoryDocument}#fixture-and-evidence-conventions`, details: expectation },
    pointers: [
      `${plan2Directory}/main-plan.md#acceptance-matrix`,
      `${plan2InventoryDocument}#required-matrix-subcases`,
      `${plan2Directory}/iterations/iteration${iteration}.md`,
      'docs/plans/reference-project/contract-map.md',
      ...([...new Set(families.map(family => family.replace(/\d+$/, '')))]
        .flatMap(prefix => prefix === 'DA' ? ['docs/architecture/daemon.md#acceptance-evidence']
          : prefix === 'PC' ? ['docs/architecture/processes-and-clients.md#acceptance-evidence']
          : prefix === 'ML' ? ['docs/architecture/memory-lifecycle.md#measurement-and-acceptance']
          : prefix === 'QT' ? ['docs/architecture/quick-testing.spec.md#complementary-verification'] : [])),
    ],
  };
}
