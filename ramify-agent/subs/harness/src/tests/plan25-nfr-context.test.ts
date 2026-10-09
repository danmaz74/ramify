import { afterEach, expect, test, vi } from 'vitest';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { boundedNonfunctionalTools, coordinatorAssessmentToolName, coordinatorActionToolName, nonfunctionalRepairToolName } from '../nonfunctional/submissions.js';
import { snapshotTools, snapshotReadLimits, type CandidateSnapshot, type SnapshotComparison } from '../reviews/snapshot.js';
import { intakeToolName, principleToolName } from '../analysis/extraction.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { copyFixture } from './helpers/fixture.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { mockGit } from './helpers/mock-git.js';
import { gateGit, scenariosCommit } from './helpers/gate-git.js';
import { notes, notesDirectory, reviewTarget, store } from './helpers/reviews.js';
import { freeze, onlyRun, openRuns, runEventsOnDisk, runPath, staleCrashLock, startRun, until } from './helpers/runs.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { runLayout } from '../run/records.js';
import { RunService } from '../run/service.js';
import { HarnessSessionOperations, type HarnessOperationInput } from '../run/session-operations.js';
import { buildDeliveredManifest, type DeliveredInput } from '../prompts/delivered-manifest.js';
import type { TaskPacket } from '../prompts/tasks.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); expectNoProcesses(); } finally { forgetExternalTools(); } });
const signal = new AbortController().signal;
const root = '/project';
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const historical = [{ status: 'M', path: 'src/badge.ts' }, { status: 'D', path: 'src/old-name.ts' }, { status: 'A', path: 'src/new-name.ts' }, { status: 'D', path: 'src/deleted.ts' }];
const recent = [{ status: 'M', path: 'src/badge.ts' }, { status: 'A', path: 'src/added.ts' }];
const files = { 'src/badge.ts': 'export const tone = "success";\n', 'src/new-name.ts': 'export const renamed = true;\n', 'src/added.ts': 'export const added = true;\n', 'src/unchanged-caller.ts': 'badge();\n',
  '.ramify-architect/README.md': 'generated', 'src/.ramify/api.json': 'generated', 'plans/.harness/run.json': 'run', 'src/link': { symlink: '/etc' } };

function toolsFixture() {
  const source = scriptedCandidates(root, { [C]: { tree: C, base: B, changes: recent, files, comparisons: {
    [A]: { changes: historical, patches: { 'src/badge.ts': 'A→C tone patch\n', 'src/old-name.ts': 'A→C deleted old name\n', 'src/new-name.ts': 'A→C added new name\n', 'src/deleted.ts': 'A→C deletion\n' } },
    [B]: { changes: recent, patches: { 'src/badge.ts': 'B→C repair patch\n', 'src/added.ts': 'x'.repeat(snapshotReadLimits.patchBytes + 10) } },
  } } });
  const snapshot: CandidateSnapshot = { commit: C, base: B, tree: C, entries: new Map(Object.entries(files).filter(([,content]) => typeof content === 'string').map(([path,content]) => [path, { path, kind: 'file', bytes: Buffer.byteLength(content as string) }])), directories: new Set(['', 'src']), changes: recent };
  const comparisons: SnapshotComparison[] = [{ name: 'run-start', base: A, target: C, changes: historical }, { name: 'accepted-boundary', base: B, target: C, changes: recent }];
  return { source, snapshot, comparisons };
}

test('D9: shared NFR tools select only captured comparisons, preserve delete/add rename patches, bounds and observations', async () => {
  const { source, snapshot, comparisons } = toolsFixture();
  const tools = snapshotTools(snapshot, source, root, comparisons);
  const diff = tools.definitions.find(tool => tool.name === 'snapshot_diff')!;
  expect((await diff.execute({}, signal)).text).toBe(`Comparison run-start: base ${A}; target ${C}\nM\tsrc/badge.ts\nD\tsrc/old-name.ts\nA\tsrc/new-name.ts\nD\tsrc/deleted.ts`);
  expect((await diff.execute({ comparison: 'accepted-boundary' }, signal)).text).toBe(`Comparison accepted-boundary: base ${B}; target ${C}\nM\tsrc/badge.ts\nA\tsrc/added.ts`);
  expect((await diff.execute({ path: 'src/badge.ts' }, signal)).text).toContain('A→C tone patch');
  expect((await diff.execute({ path: 'src/badge.ts', comparison: 'accepted-boundary' }, signal)).text).toBe(`Comparison accepted-boundary: base ${B}; target ${C}\nB→C repair patch\n`);
  for (const path of ['src/old-name.ts', 'src/new-name.ts', 'src/deleted.ts']) expect((await diff.execute({ path }, signal)).isError).toBeUndefined();
  const bounded = await diff.execute({ comparison: 'accepted-boundary', path: 'src/added.ts' }, signal);
  expect(bounded.text).toContain(`the first ${snapshotReadLimits.patchBytes} are shown`);
  expect(bounded.text).not.toContain('x'.repeat(snapshotReadLimits.patchBytes + 1));
  const count = source.calls.length;
  for (const input of [{ comparison: A }, { base: A }, { comparison: 'future' }]) expect((await diff.execute(input, signal)).isError).toBe(true);
  expect(source.calls).toHaveLength(count);
  expect(diff.action!({ path: 'src/deleted.ts', comparison: 'run-start' })).toEqual({ kind: 'read', path: '/project/src/deleted.ts', range: null });
  await tools.definitions.find(tool => tool.name === 'snapshot_read')!.execute({ path: 'src/badge.ts' }, signal);
  expect([...tools.read().keys()]).toEqual(['src/badge.ts']);
  expect([...tools.inspected()]).toEqual(['src/badge.ts', 'src/old-name.ts', 'src/new-name.ts', 'src/deleted.ts', 'src/added.ts']);
  expect((await diff.execute({ path: '.ramify-architect/README.md' }, signal)).isError).toBe(true);
  expect(tools.denials()).toMatchObject([{ tool: 'snapshot_diff', denial: 'live-view' }]);
});

test('D9/I05: bounded source tools filter both captured lists and patches, restrict reads/search, and reuse captured entries', async () => {
  const { source, snapshot, comparisons } = toolsFixture();
  const withExcluded = comparisons.map(item => ({ ...item, changes: [...item.changes, { status: 'A', path: 'plans/.harness/run.json' }, { status: 'A', path: 'src/.ramify/api.json' }] }));
  const tools = boundedNonfunctionalTools({ source, projectRoot: root, candidate: C, base: B, snapshot, comparisons: withExcluded, scope: ['src/badge.ts'] });
  const call = (name: string, input: unknown) => tools.find(tool => tool.name === name)!.execute(input, signal);
  for (const comparison of ['run-start', 'accepted-boundary']) {
    const listed = await call('snapshot_diff', { comparison });
    expect(listed.text).toContain('src/badge.ts'); expect(listed.text).not.toMatch(/old-name|added.ts|run.json|api.json/u);
  }
  for (const path of ['src/new-name.ts', 'plans/.harness/run.json', 'src/.ramify/api.json']) {
    expect((await call('snapshot_diff', { path })).isError).toBe(true);
    expect((await call('snapshot_read', { path })).isError).toBe(true);
  }
  expect((await call('snapshot_search', { pattern: 'badge' })).text).toBe('No match');
  expect(source.calls).toEqual([`grepTree ${C} badge`]);
  const fallback = boundedNonfunctionalTools({ source, projectRoot: root, candidate: C, base: B, snapshot, comparisons: [comparisons[1]!] });
  expect(fallback.find(tool => tool.name === 'snapshot_diff')!.description).toContain('Default: accepted-boundary');
  expect((await fallback.find(tool => tool.name === 'snapshot_diff')!.execute({ comparison: 'run-start' }, signal)).isError).toBe(true);
});

for (const mode of ['ordinary', 'restart', 'repair', 'legacy-restart', 'current-restart', 'missing-intent-restart'] as const) test(`D8/D12/D13/I05: actual ${mode} multi-item NFR packet carries accepted A→B changes with empty B→B and all obligations`, async () => {
  const legacy = mode === 'legacy-restart', pending = mode === 'current-restart' || mode === 'missing-intent-restart',
    missingIntent = mode === 'missing-intent-restart', restart = mode === 'restart' || legacy || pending, repair = mode === 'repair';
  const repairedTree = 'd'.repeat(40), repairedCommit = 'e'.repeat(40);
  const project = await reviewTarget(cleanups);
  const core = 'collection-review/workspace/reviews/core', coreDir = 'subs/workspace/subs/reviews/subs/core';
  const caller = `${coreDir}/src/unchanged-caller.ts`, testPath = `${notesDirectory}/src/tests/notes.test.ts`;
  const nfr = 'Badge tone must preserve omitted-tone callers.', fixed = 'Badge text must remain readable.';
  const plan = join(project, 'plans/review-notes/plan.md'); await writeFile(plan, `${await readFile(plan, 'utf8')}\n${nfr}\n`);
  await writeFile(join(project, 'badge.principles.md'), `# Badge\n\n${fixed}\n`);
  const item1 = entry('badge', notes), item2 = entry('caller', core);
  const bFiles = { [store]: 'export const store = new Map();\n', [caller]: 'export const caller = true;\n', [testPath]: 'test("omitted tone", () => {});\n', [`${notesDirectory}/README.md`]: 'Notes', [`${notesDirectory}/module.ramify`]: 'module notes',
    [`${coreDir}/README.md`]: 'Core', [`${coreDir}/module.ramify`]: 'module core' };
  const changes = [{ status: 'A', path: store }, { status: 'A', path: caller }, { status: 'M', path: testPath }, { status: 'A', path: 'plans/.harness/run.json' }, { status: 'A', path: 'src/.ramify/api.json' }];
  const source = scriptedCandidates(project, { [A]: { tree: A, files: {}, base: A, changes: [] },
    [B]: { tree: C, files: bFiles, base: A, changes },
    [C]: { tree: C, files: bFiles, base: B, changes: [], comparisons: { [A]: { changes, patches: { [store]: 'historical accepted badge patch' } } } },
    [repairedTree]: { tree: repairedTree, files: { ...bFiles, [store]: 'export const store = new Map(); // repaired\n' }, base: B, changes: [{ status: 'M', path: store }], comparisons: { [A]: { changes } } },
    [repairedCommit]: { tree: repairedTree, files: bFiles, base: B, changes: [{ status: 'M', path: store }] },
  });
  const git = gateGit(project, { head: A, commits: [scenariosCommit('review-notes', 'scenarios-00', A), { commit: B, changes: [{ status: 'A', path: store }] }, { commit: null }, { commit: null }, { commit: null }, { commit: repair ? repairedCommit : null, changes: repair ? [{ status: 'M', path: store }] : [] }], previews: Array.from({ length: repair ? 9 : 5 }, (_, index) => ({ repositoryRoot: project, head: repair && index === 8 ? repairedCommit : B, tree: repair && index >= 4 ? repairedTree : C })) });
  const roles = byRole({ 'initial-architect': [submit(analysis([item1, item2]))],
    'local-architect': [submit(assign(notes, { startingPoints: [{ path: caller, note: 'Omitted-tone caller; inspect compatibility' }, { path: 'src/.ramify/api.json', note: 'excluded view' }] }, outline())), submit(requestCompletion()),
      submit(assign(core, { startingPoints: [{ path: caller, note: 'Second work item caller' }] }, outline())), submit(requestCompletion())],
    'engineer': [submit(completionProposed('Badge implemented', { startingPoints: [{ path: store, note: 'Badge source; prior acceptance is not satisfaction' }, { path: testPath, note: 'Owned omitted-tone test' }, { path: 'missing.ts', note: 'absent optional hint' }, { path: 'plans/.harness/run.json', note: 'excluded run' }] }), write(store, bFiles[store]!)),
      submit(completionProposed('Caller inspected', { startingPoints: [{ path: caller, note: 'Second accepted result caller' }] }))],
  });
  let assessmentCount = 0;
  const script = (spec: Parameters<Exclude<typeof roles, readonly unknown[]>>[0]) => {
    if (spec.submission.name === intakeToolName) return submit({ goal: 'Preserve badge compatibility.', elements: [{ key: 'tone', kind: 'non-functional', document: 'doc-001', text: nfr, conditions: [{ text: 'when tone is omitted', source: 'stated' }], uncertainty: '' }], incorporation: { documents: [{ document: 'doc-001', scenarios: true, uncertainty: '' }], missing: [] } });
    if (spec.submission.name === principleToolName) return submit({ elements: [{ key: 'readable', kind: 'fixed', document: 'doc-002', text: fixed, conditions: [], uncertainty: '' }] });
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: ['nfr-001', 'fix-001'].map(nfr => ({ nfr, result: repair && nfr === 'nfr-001' && assessmentCount++ === 0 ? 'not-satisfied' : 'satisfied', inspectedScope: [store, caller], evidence: ['Independent scripted candidate inspection'], uncertainty: '' })) },
      { kind: 'tool', tool: 'snapshot_read', input: { path: caller } }, { kind: 'tool', tool: 'snapshot_diff', input: legacy ? {} : { path: store } }, { kind: 'tool', tool: 'snapshot_diff', input: { comparison: 'accepted-boundary' } });
    if (spec.submission.name === coordinatorActionToolName) return submit({ kind: 'repair', nfrs: ['nfr-001'], startingModule: notes, task: 'Repair badge tone preserving callers', evidence: ['Candidate source inspected'], uncertainty: '' });
    if (spec.submission.name === nonfunctionalRepairToolName) return submit({ kind: 'completed', summary: 'Repaired badge', evidence: ['Current source edited'], remaining: [] }, write(store, 'export const store = new Map(); // repaired\n'));
    return typeof roles === 'function' ? roles(spec) : roles;
  };
  const inputs = treeInputs(); const capture = inputs.capture.bind(inputs);
  const configuredInputs = { ...inputs, capture: async (...args: Parameters<typeof inputs.capture>) => ({ ...await capture(...args), source: { commit: A, dirty: true } }) };
  let frozen = false;
  let legacyIntentPath = '', legacyIntentBytes = '', legacyPrepared = false;
  const legacySystem = 'Original recorded assessment system bytes.', legacyPrompt = 'Original recorded assessment prompt bytes.';
  if (legacy) {
    type Start = { startInvocation(...args: unknown[]): Promise<unknown> };
    const prototype = RunService.prototype as unknown as Start;
    const originalStart = prototype.startInvocation;
    const startSpy = vi.spyOn(prototype, 'startInvocation').mockImplementation(async function (this: Start, ...args) {
      const request = args[2] as { toolName: string; systemPrompt: string; prompt: string; equip: () => unknown };
      if (request.toolName === coordinatorAssessmentToolName) {
        request.systemPrompt = legacySystem; request.prompt = legacyPrompt;
        request.equip = () => ({ builtinTools: [], tools: boundedNonfunctionalTools({ source, projectRoot: project, candidate: C, base: B }) });
      }
      return originalStart.apply(this, args);
    });
    const originalOperationStart = HarnessSessionOperations.prototype.start;
    const operationSpy = vi.spyOn(HarnessSessionOperations.prototype, 'start').mockImplementation(async function (this: HarnessSessionOperations, input: HarnessOperationInput) {
      if (input.spec.submission.name !== coordinatorAssessmentToolName || legacyPrepared) return originalOperationStart.call(this, input);
      const declaration = { name: coordinatorAssessmentToolName, description: `Submit this task using exactly this JSON schema: ${JSON.stringify(JSON.parse(input.loaded.submissionSchema))}`, inputSchema: { type: 'object' as const }, mutating: false };
      const sections = [{ key: 'goal', text: '# Goal\nAssess the original prepared badge candidate.' },
        { key: 'requirements', text: `# Requirements\n${input.brief.requirements.join('\n')}` },
        { key: 'support:nonfunctional-source', text: JSON.stringify({ base: B, head: B, tree: C, comparison: 'prepared-source-versus-current-accepted-boundary', changedPaths: [], readScope: ['.'] }) }];
      const additions: DeliveredInput[] = [
        { key: 'role:nonfunctional-coordinator', kind: 'role-instructions', text: 'Original pinned NFR role prefix.', source: 'old/system.md', revision: 'old-pinned' },
        { key: `tool:${declaration.name}`, kind: 'tool-declaration', text: JSON.stringify(declaration), source: null, revision: null },
        ...sections.map(section => ({ key: `brief:${section.key}`, kind: 'brief' as const, text: section.text, source: null, revision: 'old-nfr-revision' })),
        { key: 'procedure:assessment', kind: 'procedure', text: 'Inspect this prepared candidate independently and assess every fixed/NFR element.', source: 'old/procedure.md', revision: 'old-pinned' },
        { key: 'task', kind: 'task', text: `Original assessment task; submit through ${declaration.name}.`, source: null, revision: 'old-nfr-revision' },
      ];
      const message = additions.filter(item => !['role-instructions', 'tool-declaration'].includes(item.kind)).map(item => item.text).join('\n\n');
      const packet = { roleInstructions: 'Original pinned NFR role prefix.', message, submissionTool: declaration.name, declaration, additions,
        manifest: buildDeliveredManifest({ inheritedPoint: null, inherited: [], appended: additions, currentMessage: message }) };
      const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
      const policy = { context: input.spec.context, authority: input.authority, validator: input.validator, destination: input.destination };
      const task = { role: input.spec.role, message, submissionTool: declaration.name,
        environment: { workingDirectory: project, candidate: C, snapshot: C, limits: input.brief.environment.limits },
        policyIdentity: hash(policy), validatorIdentity: hash(input.validator), destinationIdentity: hash(input.destination) };
      const declarations = [...input.spec.tools.map(({ name, description, inputSchema, mutating }) => ({ name, description, inputSchema, mutating: mutating ?? false })), declaration];
      const intent = { schema: 'ramify-agent.harness-operation/1', runId: input.runId, operationId: input.operationId, session: input.session,
        source: null, mode: 'fresh', packet, context: { inherited: additions, history: [{ revision: 'old-nfr-revision', sections }], revision: 'old-nfr-revision' }, policy, task, declarations };
      legacyIntentPath = join(project, 'plans/.harness/session-operations/correlations/operations', `${hash([input.runId, input.operationId])}.json`);
      legacyIntentBytes = JSON.stringify(intent); await mkdir(dirname(legacyIntentPath), { recursive: true }); await writeFile(legacyIntentPath, legacyIntentBytes);
      legacyPrepared = true;
      return originalOperationStart.call(this, { ...input, restore: true, prepared: async packet => { await input.prepared?.(packet); frozen = true; await freeze(); } });
    });
    cleanups.push(async () => { startSpy.mockRestore(); operationSpy.mockRestore(); });
  }
  if (pending) {
    const originalOperationStart = HarnessSessionOperations.prototype.start;
    const operationSpy = vi.spyOn(HarnessSessionOperations.prototype, 'start').mockImplementation(async function (this: HarnessSessionOperations, input: HarnessOperationInput) {
      if (input.spec.submission.name !== coordinatorAssessmentToolName) return originalOperationStart.call(this, input);
      const hash = createHash('sha256').update(JSON.stringify([input.runId, input.operationId])).digest('hex');
      legacyIntentPath = join(project, 'plans/.harness/session-operations/correlations/operations', `${hash}.json`);
      return originalOperationStart.call(this, { ...input, prepared: async packet => { await input.prepared?.(packet); frozen = true; await freeze(); } });
    });
    cleanups.push(async () => { operationSpy.mockRestore(); });
  }
  const opened = await openRuns(project, { git: git.git, candidates: source, inputs: configuredInputs, script,
    ...(mode === 'restart' ? { afterWrite: async (write: string) => { if (legacy ? write === 'invocation-prepared' && legacyPrepared : write === 'candidate-prepared') { frozen = true; await freeze(); } } } : {}) });
  let active = opened; const receipt = await opened.service.execute(startRun('review-notes'));
  if (restart) { await until(() => frozen || onlyRun(opened.service, 'review-notes').state === 'failed', 30_000); expect(frozen, JSON.stringify((await runEventsOnDisk(project, 'review-notes', receipt.jobId)).slice(-4))).toBe(true); if (legacy || pending) vi.restoreAllMocks(); if (missingIntent) await rm(legacyIntentPath); await staleCrashLock(project); active = await openRuns(project, { git: git.git, candidates: source, inputs: configuredInputs, script }); }
  cleanups.push(() => active.service.close()); await active.service.settled('review-notes', receipt.jobId);
  const events = await runEventsOnDisk(project, 'review-notes', receipt.jobId);
  expect(onlyRun(active.service, 'review-notes').state, JSON.stringify(events.slice(-8))).toBe('completed');
  const coordinators = events.filter(event => event.type === 'invocation-started' && event.data.role === 'nonfunctional-coordinator');
  if (pending) expect(coordinators).toHaveLength(missingIntent ? 2 : 1);
  if (missingIntent) expect(events.some(event => event.type === 'invocation-ended' && event.data.invocation === (coordinators[0]?.type === 'invocation-started' ? coordinators[0].data.invocation : '') && event.data.ended === 'failed')).toBe(true);
  const started = missingIntent ? coordinators.at(-1)! : coordinators[0]!;
  if (started.type !== 'invocation-started') throw new Error('Missing NFR invocation');
  const hash = createHash('sha256').update(JSON.stringify([receipt.jobId, started.data.invocation])).digest('hex');
  const packet = (JSON.parse(await readFile(join(project, 'plans/.harness/session-operations/correlations/operations', `${hash}.json`), 'utf8')) as { packet: TaskPacket }).packet;
  if (legacy) {
    expect(events.filter(event => event.type === 'invocation-started' && event.data.role === 'nonfunctional-coordinator')).toHaveLength(1);
    expect(packet.manifest.schema).toBe('ramify-agent.delivered-inputs/1');
    expect(packet.message).toContain('Original assessment task'); expect(packet.roleInstructions).toBe('Original pinned NFR role prefix.');
    expect(packet.message).toContain(nfr); expect(packet.message).toContain(fixed);
    expect(await readFile(legacyIntentPath, 'utf8')).toBe(legacyIntentBytes);
    const invocation = JSON.parse(await readFile(runPath(project, 'review-notes', receipt.jobId, runLayout.invocation(started.data.invocation)), 'utf8'));
    expect(invocation.prompt.requestedInputsHash).toBe(createHash('sha256').update([legacySystem, legacyPrompt].join('\n\0\n')).digest('hex'));
    const session = active.agent!.sessions.find(session => session.spec.submission.name === coordinatorAssessmentToolName)!;
    expect(session.results.find(result => result.tool === 'snapshot_diff' && result.text === 'The candidate changed nothing'), JSON.stringify(session.results)).toBeDefined();
    expect(session.results.find(result => result.tool === 'snapshot_diff' && result.isError)).toBeDefined();
    expect(session.spec.tools.find(tool => tool.name === 'snapshot_diff')!.inputSchema).toEqual(boundedNonfunctionalTools({ source, projectRoot: project, candidate: C, base: B }).find(tool => tool.name === 'snapshot_diff')!.inputSchema);
    expect(source.calls.filter(call => call.startsWith('diffPatch'))).toEqual([]);
    git.assertComplete(); return;
  }
  const text = packet.message; const sourceText = packet.additions.find(item => item.key === 'brief:support:nonfunctional-source')!.text;
  const sourceBrief = JSON.parse(sourceText.slice(sourceText.indexOf('{')));
  expect(sourceBrief.comparisons).toEqual([{ name: 'run-start', base: A, target: C, changedPaths: changes.slice(0,3).sort((a,b) => a.path.localeCompare(b.path)) }, { name: 'accepted-boundary', base: B, target: C, changedPaths: [] }]);
  expect(sourceBrief.originalSource).toEqual({ commit: A, dirty: true });
  expect(sourceBrief.defaultComparison).toBe('run-start');
  for (const value of [nfr, fixed, 'when tone is omitted', 'Omitted-tone caller', 'Badge source', 'Owned omitted-tone test', 'Second work item caller', 'Second accepted result caller', 'assigned module/source/test locations', '"workItem":"wi-001"', '"workItem":"wi-002"']) expect(text).toContain(value);
  for (const value of ['excluded view', 'excluded run', 'absent optional hint', project]) expect(packet.additions.find(item => item.key === 'brief:support:starting-points')!.text).not.toContain(value);
  expect(text).toContain('Make your own semantic judgment for every element'); expect(text).toContain('Explore beyond stale or unhelpful hints across the whole allowed tree');
  expect(text).toContain('no pathless diff is required'); expect(text).toContain('Dirty original capture excludes uncommitted starting bytes');
  const session = active.agent!.sessions.find(session => session.spec.submission.name === coordinatorAssessmentToolName)!;
  expect(session.results.find(result => result.tool === 'snapshot_diff' && result.text.includes('historical accepted badge patch'))).toBeDefined();
  expect(session.results.find(result => result.tool === 'snapshot_diff' && result.text.includes('Comparison accepted-boundary'))!.text).toContain('The candidate changed nothing');
  const observations = await readFile(runPath(project, 'review-notes', receipt.jobId, runLayout.observations(started.data.invocation)), 'utf8');
  expect(observations).toContain(store);
  expect(observations).toContain('snapshot_diff');
  expect(session.spec.tools.find(tool => tool.name === 'snapshot_diff')!.action!({ path: store, comparison: 'run-start' })).toMatchObject({ kind: 'read', path: join(project, store) });

  if (repair) {
    const repairSession = active.agent!.sessions.find(session => session.spec.submission.name === nonfunctionalRepairToolName)!;
    expect(repairSession.spec.prompt).toContain(join(project, caller));
    expect(repairSession.spec.prompt).toContain('Paths below resolve from the project root');
    expect(repairSession.spec.prompt).not.toContain('use snapshot tools');
    expect(repairSession.spec.tools.some(tool => tool.name.startsWith('snapshot_'))).toBe(false);
    expect(repairSession.spec.prompt).toContain(`"candidate": "${C}"`);
    const finalSession = active.agent!.sessions.filter(session => session.spec.submission.name === coordinatorAssessmentToolName).at(-1)!;
    for (const name of ['run-start', 'accepted-boundary']) expect(finalSession.spec.prompt).toContain(`"name":"${name}"`);
    expect(finalSession.spec.prompt).toContain(`"target":"${repairedTree}"`);
    expect(finalSession.spec.prompt).toContain(`pinned candidate ${repairedTree}`);
    expect(finalSession.spec.prompt).not.toContain(`pinned candidate ${C}`);
    expect(finalSession.spec.prompt).toContain(`"boundary":"${B}"`);
    expect(finalSession.spec.prompt).toContain(nfr); expect(finalSession.spec.prompt).toContain(fixed);
    const finalDiff = finalSession.results.find(result => result.tool === 'snapshot_diff' && result.text.includes('Comparison accepted-boundary'))!;
    expect(finalDiff.text).toContain(`base ${B}; target ${repairedTree}`); expect(finalDiff.text).toContain(`M\t${store}`);
  }
  git.assertComplete();
}, 120_000);

test('D10: missing historical provenance omits run-start without consulting HEAD; recorded legacy recovery remains usable', async () => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove);
  const source = scriptedCandidates(fixture.root, { [C]: { tree: C, files: { 'src/badge.ts': 'badge' }, base: B, changes: recent } });
  const { service } = await openRuns(fixture.root, { git: mockGit(), candidates: source }); cleanups.push(() => service.close());
  const boundary = service as unknown as {
    recordedRunBase(record: unknown, log: unknown): string | undefined;
    nonfunctionalSourceInputs(run: unknown, candidate: unknown): Promise<{ sections: { key: string; text: string }[]; comparisons: SnapshotComparison[] }>;
  };
  const record = { manifest: { source: null } }, log = { ledger: { replay: () => [] } };
  expect(boundary.recordedRunBase(record, log)).toBeUndefined();
  const captured = await boundary.nonfunctionalSourceInputs({ record, log, base: B }, { head: B, tree: C });
  expect(captured.comparisons.map(item => item.name)).toEqual(['accepted-boundary']);
  expect(JSON.parse(captured.sections[0]!.text).defaultComparison).toBe('accepted-boundary');
  expect(source.calls).toEqual([`diffNameStatus ${C} ${B}`, `treeEntries ${C}`]);
  const legacy = (body: unknown) => ({ ledger: { replay: () => [{ transaction: { records: [{ body }] } }] } });
  expect(boundary.recordedRunBase(record, legacy({ schema: 'ramify-agent.invocation/1', base: A }))).toBe(A);
  expect(boundary.recordedRunBase(record, legacy({ schema: 'ramify-agent.gate-attempt/3', head: A }))).toBe(A);
  expect(boundary.recordedRunBase({ manifest: { source: { commit: B, dirty: true } } }, legacy({ schema: 'ramify-agent.invocation/1', base: A }))).toBe(B);
});

for (const failure of ['diffNameStatus', 'treeEntries'] as const) test(`D10: authoritative ${failure} failure remains an error instead of an empty/current-HEAD historical comparison`, async () => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove);
  const source = scriptedCandidates(fixture.root, { [C]: { tree: C, files: {}, base: A, changes: [] } }); source.fail(failure, C);
  const { service } = await openRuns(fixture.root, { git: mockGit(), candidates: source }); cleanups.push(() => service.close());
  const boundary = service as unknown as { nonfunctionalSourceInputs(run: unknown, candidate: unknown): Promise<unknown> };
  await expect(boundary.nonfunctionalSourceInputs({ record: { manifest: { source: { commit: A, dirty: false } } }, base: A, log: { ledger: { replay: () => [] } } }, { head: A, tree: C })).rejects.toThrow(`fatal: ${failure}`);
});
