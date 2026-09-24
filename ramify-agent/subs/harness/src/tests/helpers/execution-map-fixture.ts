import type {
  ExecutionCapabilityDetail, ExecutionLink, ExecutionMapPage, ExecutionModuleRelation, ExecutionNode,
  ExecutionScenarioDetail, ExecutionSourceRef,
} from '../../interfaces/protocol/execution-map.js';

/** Scripted projection witness, independent of any future projection implementation. */
export const executionMapFixtureIdentity = {
  planId: 'nested-provider-map', runId: 'run-scripted-map', previousVersion: 41, runVersion: 42,
  roots: ['capability:status-badge', 'capability:accessible-tone'],
  sharedProvider: 'capability:theme-tokens',
  failedGate: 'gate:ga-005', repairedGate: 'gate:ga-006',
} as const;

const version = executionMapFixtureIdentity.runVersion;
const source = (sequence: number, kind: ExecutionSourceRef['kind'] = 'run-event', id = `ev-${sequence}`): ExecutionSourceRef =>
  ({ kind, id, sequence, revision: null });
const moduleAt = (module: string, role: ExecutionModuleRelation['role'], sequence: number): ExecutionModuleRelation =>
  ({ module, role, source: source(sequence) });
const base = (key: string, label: string, sequence: number, modules: ExecutionModuleRelation[] = []) =>
  ({ key, label, runVersion: version, sourceRefs: [source(sequence)], modules });
const complete = (total: number) => ({ state: 'complete' as const, known: total, total });
const methodLimit = 'Two worktree snapshots can miss edits reverted before the second snapshot.' as const;
const fixtureLines = (added: number, deleted: number, textPaths: number, invocationIds: string[], binaryPaths = 0,
  binaryInvocations: string[] = []) => ({ totals: { added, deleted, textPaths, invocationIds }, coverage: 'partial' as const,
    gaps: ['Writer inv-repair has partial coverage.'], binary: { paths: binaryPaths, invocationIds: binaryInvocations }, methodLimit });

export const executionMapFixtureNodes: ExecutionNode[] = [
  { ...base('capability:status-badge', 'Status badge', 2, [moduleAt('project/ui', 'owner', 2)]),
    kind: 'capability', level: 'entry', state: 'working', reason: 'The reopened provider requirement needs verification.',
    owner: 'project/ui', proposed: null, scenarios: { coverage: complete(1), passed: 1, failed: 0, other: 0, noRealRun: 0, unavailable: 0 },
    directRequirements: { coverage: complete(1), verified: 0, keys: ['requirement:req-status'] } },
  { ...base('capability:accessible-tone', 'Accessible tone', 3, [moduleAt('project/accessibility', 'owner', 3)]),
    kind: 'capability', level: 'entry', state: 'working', reason: 'Its current scenario has not passed.',
    owner: 'project/accessibility', proposed: null, scenarios: { coverage: complete(1), passed: 0, failed: 1, other: 0, noRealRun: 0, unavailable: 0 },
    directRequirements: { coverage: complete(1), verified: 1, keys: ['requirement:req-accessible'] } },
  { ...base('capability:theme-tokens', 'Theme tokens', 11, [moduleAt('project/theme', 'provider', 11)]),
    kind: 'capability', level: 'lower', state: 'completed', reason: 'Provider conformance passed.',
    owner: 'project/theme', proposed: null, scenarios: { coverage: complete(0), passed: 0, failed: 0, other: 0, noRealRun: 0, unavailable: 0 },
    directRequirements: { coverage: complete(0), verified: 0, keys: [] } },
  { ...base('scenario:sc-status', 'Renders the status badge', 4, [moduleAt('project/ui', 'owner', 4)]), kind: 'scenario', scenarioKind: 'entry',
    state: 'implemented', latestRealResult: 'passed', entry: 'capability:status-badge', detailAvailable: true },
  { ...base('scenario:sc-accessible', 'Provides accessible tone', 5, [moduleAt('project/accessibility', 'owner', 5)]), kind: 'scenario', scenarioKind: 'entry',
    state: 'implemented', latestRealResult: 'failed', entry: 'capability:accessible-tone', detailAvailable: true },
  { ...base('scenario:sc-integration', 'Uses theme tokens across modules', 6, [moduleAt('project/ui', 'owner', 6)]), kind: 'scenario', scenarioKind: 'integration',
    state: 'pending', latestRealResult: 'no-real-run', entry: null, detailAvailable: true },
  { ...base('work-item:wi-status', 'Implement status badge', 7, [moduleAt('project/ui', 'owner', 7)]),
    kind: 'work-item', state: 'working', module: 'project/ui', goal: 'Implement and verify the status badge.' },
  { ...base('work-item:wi-accessible', 'Implement accessible tone', 8, [moduleAt('project/accessibility', 'owner', 8)]),
    kind: 'work-item', state: 'working', module: 'project/accessibility', goal: 'Implement accessible tone.' },
  { ...base('work-item:wi-provider', 'Provide theme tokens', 12, [moduleAt('project/theme', 'owner', 12)]),
    kind: 'work-item', state: 'completed', module: 'project/theme', goal: 'Implement shared theme tokens.' },
  { ...base('work-item:wi-follow-up', 'Verify reopened requirement', 39, [moduleAt('project/ui', 'owner', 39)]),
    kind: 'work-item', state: 'todo', module: 'project/ui', goal: 'Verify the current contract revision.' },
  { ...base('work-item:wi-unplaced', 'Resolve placement', 15), kind: 'work-item', state: 'todo',
    module: null, goal: 'Resolve the remaining placement.' },
  { ...base('iteration:it-status-1', 'Status iteration 1', 16), kind: 'iteration', workItem: 'work-item:wi-status',
    ordinal: 1, outlineRevision: 1, state: 'failed', outcome: 'partial', module: 'project/ui', scopeExceptions: [] },
  { ...base('iteration:it-status-2', 'Status iteration 2', 30), kind: 'iteration', workItem: 'work-item:wi-status',
    ordinal: 2, outlineRevision: 2, state: 'completed', outcome: 'accepted', module: 'project/ui', scopeExceptions: [] },
  { ...base('iteration:it-provider-1', 'Provider iteration 1', 21), kind: 'iteration', workItem: 'work-item:wi-provider',
    ordinal: 1, outlineRevision: 1, state: 'completed', outcome: 'accepted', module: 'project/theme', scopeExceptions: [] },
  { ...base('placement-request:pl-1', 'Place theme tokens', 9, [moduleAt('project/theme', 'candidate', 9)]),
    kind: 'placement-request', state: 'decided', requestedBy: 'iteration:it-status-1' },
  { ...base('contract:ct-theme', 'Theme token contract', 13, [moduleAt('project/ui', 'consumer', 13), moduleAt('project/theme', 'provider', 13)]),
    kind: 'contract', state: 'reopened', revision: 2, mode: 'fake-backed' },
  { ...base('requirement:req-status', 'Status requires theme tokens', 14, [moduleAt('project/ui', 'consumer', 14), moduleAt('project/theme', 'provider', 14)]),
    kind: 'requirement', state: 'reopened', consumer: 'capability:status-badge', contract: 'contract:ct-theme',
    currentRevision: 2, verifiedRevision: 1, providerStage: 'conformed', provider: 'capability:theme-tokens' },
  { ...base('requirement:req-accessible', 'Accessible tone requires theme tokens', 18, [moduleAt('project/accessibility', 'consumer', 18), moduleAt('project/theme', 'provider', 18)]),
    kind: 'requirement', state: 'verified', consumer: 'capability:accessible-tone', contract: 'contract:ct-theme',
    currentRevision: 2, verifiedRevision: 2, providerStage: 'conformed', provider: 'capability:theme-tokens' },
  { ...base('session:ses-local-status', 'Status local architect', 10, [moduleAt('project/ui', 'local-architect', 10)]),
    kind: 'session', role: 'local-architect', state: 'suspended', executor: 'scripted', workItem: 'work-item:wi-status', reach: { kind: 'work-item', workItem: 'wi-status', capability: 'status-badge', module: 'project/ui' }, invocations: ['inv-outline', 'inv-assess', 'inv-resume'] },
  { ...base('session:ses-initial', 'Initial architect', 1),
    kind: 'session', role: 'initial-architect', state: 'finished', executor: 'scripted', workItem: null, reach: { kind: 'run' }, invocations: ['inv-initial'] },
  { ...base('session:ses-global', 'Global placement fork', 9, [moduleAt('project/theme', 'candidate', 9)]),
    kind: 'session', role: 'global-fork', state: 'finished', executor: 'scripted', workItem: null, reach: { kind: 'request', request: 'pl-1', workItem: 'wi-status', capability: 'theme-tokens' }, invocations: ['inv-global'] },
  { ...base('session:ses-local-provider', 'Provider local architect', 19, [moduleAt('project/theme', 'local-architect', 19)]),
    kind: 'session', role: 'local-architect', state: 'finished', executor: 'scripted', workItem: 'work-item:wi-provider', reach: { kind: 'work-item', workItem: 'wi-provider', capability: 'theme-tokens', module: 'project/theme' }, invocations: ['inv-provider-outline'] },
  { ...base('session:ses-contract', 'Contract engineer', 20, [moduleAt('project/theme', 'contract-engineer', 20)]),
    kind: 'session', role: 'contract-engineer', state: 'finished', executor: 'scripted', workItem: 'work-item:wi-provider', reach: { kind: 'work-item', workItem: 'wi-provider', capability: 'theme-tokens', module: 'project/theme' }, invocations: ['inv-contract'] },
  { ...base('session:ses-engineer', 'Status engineer', 29, [moduleAt('project/ui', 'engineer', 29)]),
    kind: 'session', role: 'engineer', state: 'live', executor: 'scripted', workItem: 'work-item:wi-status', reach: { kind: 'work-item', workItem: 'wi-status', capability: 'status-badge', module: 'project/ui' }, invocations: ['inv-status'] },
  { ...base('gate:ga-005', 'Status iteration gate, failed', 27), kind: 'gate', checkpoint: 'iteration',
    verdict: 'failed', audit: 'passed', repairRound: 0, commit: 'commit-failed', auditedCommit: 'commit-failed', active: false, subject: { workItem: 'wi-status', iteration: 'it-status-1' }, cause: 'in-scope', evidencePresent: true },
  { ...base('gate:ga-006', 'Status iteration gate, repaired', 34), kind: 'gate', checkpoint: 'iteration',
    verdict: 'passed', audit: 'incomplete', repairRound: 1, commit: 'commit-repair', auditedCommit: null, active: false, subject: { workItem: 'wi-status', iteration: 'it-status-2' }, cause: null, evidencePresent: false },
  { ...base('gate:ga-provider', 'Provider conformance gate', 24), kind: 'gate', checkpoint: 'contract',
    verdict: 'passed', audit: 'passed', repairRound: 0, commit: 'commit-provider', auditedCommit: 'commit-provider', active: false, subject: { workItem: 'wi-provider', iteration: 'it-provider-1' }, cause: null, evidencePresent: true },
  { ...base('gate:ga-readiness', 'Readiness gate', 15), kind: 'gate', checkpoint: 'readiness',
    verdict: 'passed', audit: 'not-applicable', repairRound: 0, commit: null, auditedCommit: null, active: false, subject: { workItem: null, iteration: null }, cause: null, evidencePresent: false },
];
executionMapFixtureNodes.sort((a, b) =>
  (a.sourceRefs[0]?.sequence ?? Number.MAX_SAFE_INTEGER) - (b.sourceRefs[0]?.sequence ?? Number.MAX_SAFE_INTEGER)
  || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));

const shown = (key: string) => ({ coverage: 'shown' as const, key });
const link = (id: string, kind: ExecutionLink['kind'], from: string, to: string, sequence: number): ExecutionLink =>
  ({ id, kind, from: shown(from), to: shown(to), source: source(sequence), runVersion: version });

export const executionMapFixtureLinks: ExecutionLink[] = [
  link('l01', 'started-for', 'capability:status-badge', 'work-item:wi-status', 7),
  link('l02', 'started-for', 'capability:accessible-tone', 'work-item:wi-accessible', 8),
  link('l03', 'started-for', 'capability:theme-tokens', 'work-item:wi-provider', 12),
  link('l04', 'tracks-scenario', 'capability:status-badge', 'scenario:sc-status', 4),
  link('l05', 'tracks-scenario', 'capability:accessible-tone', 'scenario:sc-accessible', 5),
  link('l06', 'assigned-iteration', 'work-item:wi-status', 'iteration:it-status-1', 16),
  link('l07', 'assigned-iteration', 'work-item:wi-status', 'iteration:it-status-2', 30),
  link('l08', 'assigned-iteration', 'work-item:wi-provider', 'iteration:it-provider-1', 21),
  link('l09', 'follows', 'iteration:it-status-1', 'iteration:it-status-2', 30),
  link('l10', 'requested-by', 'placement-request:pl-1', 'iteration:it-status-1', 9),
  link('l11', 'proposed-by', 'capability:theme-tokens', 'placement-request:pl-1', 11),
  link('l12', 'established-by', 'contract:ct-theme', 'placement-request:pl-1', 13),
  link('l13', 'provider-for', 'capability:theme-tokens', 'requirement:req-status', 14),
  link('l14', 'provider-for', 'capability:theme-tokens', 'requirement:req-accessible', 18),
  link('l15', 'verification-of', 'requirement:req-status', 'contract:ct-theme', 38),
  link('l16', 'verification-of', 'requirement:req-accessible', 'contract:ct-theme', 36),
  link('l17', 'session-for', 'session:ses-local-status', 'work-item:wi-status', 10),
  link('l18', 'session-for', 'session:ses-local-provider', 'work-item:wi-provider', 19),
  link('l19', 'session-for', 'session:ses-contract', 'contract:ct-theme', 20),
  link('l20', 'session-for', 'session:ses-engineer', 'iteration:it-status-2', 29),
  link('l20a', 'session-for', 'session:ses-global', 'placement-request:pl-1', 9),
  link('l21', 'gate-for', 'gate:ga-005', 'iteration:it-status-1', 27),
  link('l22', 'gate-for', 'gate:ga-006', 'iteration:it-status-2', 34),
  link('l22a', 'gate-for', 'gate:ga-provider', 'iteration:it-provider-1', 24),
  link('l23', 'repair-of', 'gate:ga-006', 'gate:ga-005', 34),
  link('l24', 'follows', 'work-item:wi-status', 'work-item:wi-follow-up', 39),
  link('l25', 'depends-on', 'capability:status-badge', 'capability:theme-tokens', 14),
  link('l26', 'depends-on', 'capability:theme-tokens', 'capability:status-badge', 40),
];
executionMapFixtureLinks.sort((a, b) =>
  (a.source.sequence ?? Number.MAX_SAFE_INTEGER) - (b.source.sequence ?? Number.MAX_SAFE_INTEGER)
  || a.id.localeCompare(b.id));

export const executionMapFixtureCapabilityDetail: ExecutionCapabilityDetail = {
  schema: 'execution-map/1', runVersion: version, key: 'capability:status-badge',
  detail: { state: 'available', level: 'entry',
    description: 'Render a status badge whose tone uses the shared theme contract and whose text remains accessible.',
    source: { kind: 'analysis-entry', id: 'status-badge', sequence: 2, revision: null } },
};

export const executionMapFixtureScenarioDetail: ExecutionScenarioDetail = {
  schema: 'execution-map/1', runVersion: version, key: 'scenario:sc-status',
  detail: { state: 'available', name: 'Renders the status badge',
    source: ['Scenario: Renders the status badge', '  Given a valid status', '  When the badge renders', '  Then the visible tone and text match the status'],
    gates: [],
    record: { kind: 'tracked-scenario', id: 'sc-status', sequence: 4, revision: null } },
};

/** Structured inputs the later projection tests can build into durable records. */
export const executionMapFixtureScript = {
  sessionInvocations: [
    { session: 'ses-local-status', invocation: 'inv-outline', sequence: 10, reach: 'wi-status', action: 'outline' },
    { session: 'ses-local-status', invocation: 'inv-assess', sequence: 28, reach: 'it-status-1', action: 'assess-failure' },
    { session: 'ses-local-status', invocation: 'inv-resume', sequence: 38, reach: 'wi-follow-up', action: 'resume' },
    { session: 'ses-local-provider', invocation: 'inv-provider-outline', sequence: 19, reach: 'wi-provider', action: 'outline' },
  ],
  events: [
    { sequence: 9, type: 'placement-requested', id: 'pl-1' },
    { sequence: 13, type: 'contract-established', id: 'ct-theme', revision: 1 },
    { sequence: 24, type: 'gate-recorded', id: 'ga-provider', verdict: 'passed', audit: 'passed' },
    { sequence: 27, type: 'gate-recorded', id: 'ga-005', verdict: 'failed', audit: 'passed' },
    { sequence: 34, type: 'gate-recorded', id: 'ga-006', verdict: 'passed', audit: 'incomplete', repairRound: 1 },
    { sequence: 37, type: 'contract-reopened', id: 'ct-theme', revision: 2 },
    { sequence: 39, type: 'work-item-created', id: 'wi-follow-up' },
    { sequence: 40, type: 'dependency-cycle', members: ['status-badge', 'theme-tokens'] },
  ],
  capturedWriterChanges: [
    { invocation: 'inv-status', path: 'subs/ui/src/badge.tsx', module: 'project/ui', added: 12, deleted: 3, binary: false, coverage: 'complete' },
    { invocation: 'inv-provider', path: 'subs/theme/src/icon.png', module: 'project/theme', added: null, deleted: null, binary: true, coverage: 'complete' },
    { invocation: 'inv-repair', path: 'scratch/unknown.ts', module: null, added: 4, deleted: 1, binary: false, coverage: 'complete' },
    { invocation: 'inv-repair', path: 'subs/ui/src/badge.tsx', module: 'project/ui', added: 2, deleted: 0, binary: false, coverage: 'partial' },
  ],
  modules: { proposed: 'project/ui/proposed', unplacedWorkItem: 'wi-unplaced' },
} as const;

export const executionMapFixturePage: ExecutionMapPage = {
  schema: 'execution-map/1', runVersion: version, cursor: null, nextCursor: null,
  tree: { status: 'available', revision: 'tree-rev-1', input: 'tree-input-1', modules: [
    { module: 'project', dir: '', parent: null },
    { module: 'project/ui', dir: 'subs/ui', parent: 'project' },
    { module: 'project/accessibility', dir: 'subs/accessibility', parent: 'project' },
    { module: 'project/theme', dir: 'subs/theme', parent: 'project' },
  ] },
  moduleMap: {
    tree: { status: 'available', revision: 'tree-rev-1', input: 'tree-input-1', modules: [
      { module: 'project', dir: '', parent: null },
      { module: 'project/ui', dir: 'subs/ui', parent: 'project' },
      { module: 'project/accessibility', dir: 'subs/accessibility', parent: 'project' },
      { module: 'project/theme', dir: 'subs/theme', parent: 'project' },
    ] },
    modules: [
      { module: 'project', parent: null, dir: '', direct: [], workedIn: false, involvedDescendants: 2,
        lines: fixtureLines(0, 0, 0, []) },
      { module: 'project/ui', parent: 'project', dir: 'subs/ui',
        direct: [{ element: 'capability:status-badge', role: 'owner', source: source(2) },
          { element: 'scenario:sc-status', role: 'owner', source: source(4) },
          { element: 'session:ses-local-status', role: 'local-architect', source: source(10) },
          { element: 'session:ses-engineer', role: 'engineer', source: source(29) }],
        workedIn: true, involvedDescendants: 0, lines: fixtureLines(14, 3, 2, ['inv-status', 'inv-repair']) },
      { module: 'project/accessibility', parent: 'project', dir: 'subs/accessibility', direct: [], workedIn: false,
        involvedDescendants: 0, lines: fixtureLines(0, 0, 0, []) },
      { module: 'project/theme', parent: 'project', dir: 'subs/theme',
        direct: [{ element: 'contract:ct-theme', role: 'provider', source: source(13) },
          { element: 'session:ses-contract', role: 'contract-engineer', source: source(20) }],
        workedIn: true, involvedDescendants: 0, lines: fixtureLines(0, 0, 0, [], 1, ['inv-provider']) },
    ], outsideTree: [], proposed: [],
    unplaced: [{ element: 'work-item:wi-unplaced', reason: 'The work item has no retained module placement.' }],
    unmapped: { totals: { added: 4, deleted: 1, textPaths: 1, invocationIds: ['inv-repair'] }, coverage: 'partial',
      gaps: ['Writer inv-repair has partial coverage.'], binary: { paths: 0, invocationIds: [] }, methodLimit },
    lines: { totals: { added: 18, deleted: 4, textPaths: 3, invocationIds: ['inv-status', 'inv-repair'] }, coverage: 'partial',
      gaps: ['Writer inv-repair has partial coverage.'], binary: { paths: 1, invocationIds: ['inv-provider'] }, methodLimit },
  },
  current: { awaitedSession: 'session:ses-engineer', runningGate: null, source: source(41) },
  nodes: executionMapFixtureNodes, links: executionMapFixtureLinks, moduleRelations: [], lineRefs: [],
  coverage: { nodes: { shown: executionMapFixtureNodes.length, total: executionMapFixtureNodes.length },
    links: { shown: executionMapFixtureLinks.length, total: executionMapFixtureLinks.length },
    modules: { shown: 5, total: 5 }, moduleRelations: { shown: 0, total: 0 },
    lineRefs: { shown: 0, total: 0 }, gaps: [] },
};

for (const row of executionMapFixturePage.moduleMap.modules) {
  executionMapFixturePage.moduleRelations.push(...row.direct.map(relation => ({ module: row.module, ...relation })));
  row.direct.length = 0;
}
for (const row of executionMapFixturePage.moduleMap.outsideTree) {
  executionMapFixturePage.moduleRelations.push(...row.direct.map(relation => ({ module: row.module, ...relation })));
  row.direct.length = 0;
}
const fixtureLineRefs = (scope: ExecutionMapPage['lineRefs'][number]['scope'], module: string | null,
  lines: ExecutionMapPage['moduleMap']['lines']) => {
  executionMapFixturePage.lineRefs.push(...lines.totals.invocationIds.map(value =>
    ({ scope, module, field: 'text-invocation' as const, value })));
  executionMapFixturePage.lineRefs.push(...lines.binary.invocationIds.map(value =>
    ({ scope, module, field: 'binary-invocation' as const, value })));
  executionMapFixturePage.lineRefs.push(...lines.gaps.map(value => ({ scope, module, field: 'gap' as const, value })));
  lines.totals.invocationIds.length = 0;
  lines.binary.invocationIds.length = 0;
  lines.gaps.length = 0;
};
for (const row of executionMapFixturePage.moduleMap.modules) fixtureLineRefs('module', row.module, row.lines);
for (const row of executionMapFixturePage.moduleMap.outsideTree) fixtureLineRefs('outside', row.module, row.lines);
fixtureLineRefs('unmapped', null, executionMapFixturePage.moduleMap.unmapped);
fixtureLineRefs('all', null, executionMapFixturePage.moduleMap.lines);
executionMapFixturePage.coverage.moduleRelations.shown = executionMapFixturePage.moduleRelations.length;
executionMapFixturePage.coverage.moduleRelations.total = executionMapFixturePage.moduleRelations.length;
executionMapFixturePage.coverage.lineRefs.shown = executionMapFixturePage.lineRefs.length;
executionMapFixturePage.coverage.lineRefs.total = executionMapFixturePage.lineRefs.length;

/** A separate page state before a running gate has produced any verdict. */
export const executionMapRunningGateFixturePage: ExecutionMapPage = {
  ...executionMapFixturePage,
  cursor: null,
  nextCursor: 'opaque-next-page',
  current: { awaitedSession: null, runningGate: 'gate:ga-running', source: source(41) },
  nodes: [{ ...base('gate:ga-running', 'Running committing gate', 41), kind: 'gate',
    checkpoint: 'iteration', verdict: null, audit: 'not-started', repairRound: 0,
    commit: null, auditedCommit: null, active: true, subject: { workItem: 'wi-status', iteration: 'it-status-2' }, cause: null, evidencePresent: false }],
  links: [],
  coverage: { nodes: { shown: 1, total: executionMapFixtureNodes.length + 1 },
    links: { shown: 0, total: executionMapFixtureLinks.length }, modules: { shown: 5, total: 5 },
    moduleRelations: { shown: executionMapFixturePage.moduleRelations.length, total: executionMapFixturePage.moduleRelations.length },
    lineRefs: { shown: executionMapFixturePage.lineRefs.length, total: executionMapFixturePage.lineRefs.length }, gaps: [] },
};
