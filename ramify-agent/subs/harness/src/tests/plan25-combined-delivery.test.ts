import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import type { AgentSessionSnapshot, ContinueSessionInput, SessionOperations } from '../../subs/agent/src/interfaces/session-operations.js';
import { intakeToolName } from '../analysis/extraction.js';
import { coordinatorAssessmentToolName } from '../nonfunctional/submissions.js';
import { deliveredManifestViewSchema, metricsResponseSchema } from '../interfaces/protocol/runs.js';
import type { TaskPacket } from '../prompts/tasks.js';
import type { DeliveredInput } from '../prompts/delivered-manifest.js';
import type { BriefingRevision } from '../prompts/briefings.js';
import { effectiveBlocks } from '../prompts/blocks.js';
import { deliveredScopeInputs } from '../kpi/capture.js';
import { HarnessSessionOperations } from '../run/session-operations.js';
import { RunQueries } from '../projections/queries.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { declaringScenarios } from './helpers/declarations.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { gateGit, scenariosCommit } from './helpers/gate-git.js';
import { notes, notesDirectory, reviewTarget, store } from './helpers/reviews.js';
import { onlyRun, openRuns, runEventsOnDisk, startRun, testPolicy, runPath } from './helpers/runs.js';
import { testReviewPolicy } from './helpers/candidates.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); expectNoProcesses(); }
  finally { vi.restoreAllMocks(); forgetExternalTools(); }
});
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40);
const pointKey = 'brief:support:starting-points';
type Intent = { packet: TaskPacket; context: { inherited: DeliveredInput[]; history: BriefingRevision[]; revision: string } };

// Independent fixture answers name the original commit, accepted commit and
// prepared tree separately. No Git, producer or process runs in this workflow.
for (const mode of ['retained', 'fresh-fallback', 'legacy-records'] as const) test(`Q01–Q03/I06: ${mode} combined orientation, selection, implementation, reviews and NFR delivery`, async () => {
  const root = await reviewTarget(cleanups);
  const caller = `${notesDirectory}/src/notes.ts`;
  const testPath = `${notesDirectory}/src/tests/notes.test.ts`;
  const readme = `${notesDirectory}/README.md`;
  const nfr = 'Existing callers keep their behavior when note storage is introduced.';
  const planFile = join(root, 'plans/review-notes/plan.md');
  await writeFile(planFile, `${await readFile(planFile, 'utf8')}\n${nfr}\n`);
  const explicit = mode !== 'legacy-records';
  const orientationPoint = { path: caller, note: 'Orientation caller: inspect compatibility' };
  const assignmentPoint = { path: caller, note: 'Assignment caller: preserve existing use' };
  const resultPoint = { path: store, note: 'Engineer result: inspect candidate implementation' };
  const files = { [store]: 'export const store = new Map();\n', [caller]: 'export const noteLimit = 500;\n', [testPath]: 'test("caller compatibility", () => {});\n', [readme]: 'Notes keep their store in memory.\n', [`${notesDirectory}/module.ramify`]: 'module notes' };
  const changes = [{ status: 'A', path: store }];
  const source = scriptedCandidates(root, {
    [A]: { tree: A, files: {}, base: A, changes: [] },
    [B]: { tree: C, files, base: 'scenarios-00', changes, comparisons: { [A]: { changes } } },
    [C]: { tree: C, files, base: B, changes: [], comparisons: { [A]: { changes, patches: { [store]: 'original-to-candidate note-store patch\n' } } } },
  });
  const git = gateGit(root, { head: A,
    commits: [scenariosCommit('review-notes', 'scenarios-00', A), { commit: B, changes }, { commit: null }, { commit: null }],
    previews: Array.from({ length: 5 }, () => ({ repositoryRoot: root, head: B, tree: C })) });
  const roles = declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('note-store', notes)]))],
    'local-architect': [submit(assign(notes, explicit ? { startingPoints: [assignmentPoint] } : {}, outline())), submit(requestCompletion())],
    engineer: [submit(completionProposed('Store implemented', explicit ? { startingPoints: [resultPoint, { path: 'missing.ts', note: 'Unavailable optional hint' }] } : {}), write(store, files[store]))],
  }));
  const agent = createScriptedAgent(spec => {
    if (spec.submission.name === intakeToolName) return submit({ goal: 'Introduce note storage while preserving callers.', elements: [{ key: 'compatibility', kind: 'non-functional', document: 'doc-001', text: nfr, conditions: [], uncertainty: '' }], incorporation: { documents: [{ document: 'doc-001', scenarios: true, uncertainty: '' }], missing: [] } });
    if (spec.submission.name === 'submit_work_orientation') return submit({ focus: 'Note storage and callers', currentUnderstanding: 'Inspect existing callers before assigning implementation.', questions: [], ...(explicit ? { startingPoints: [orientationPoint] } : {}) });
    if (spec.submission.name === 'submit_context_selection') return submit({ selected: [{ id: 'nfr-001', reason: 'Caller compatibility constrains note storage.', conditions: [], uncertainty: '' }] });
    if (spec.submission.name === 'submit_orientation') return submit({ read: [readme], summary: 'Keep the store in memory.' });
    if (spec.submission.name === 'submit_review') return submit({ inspected: [store], missing: [], concerns: [] });
    if (spec.submission.name === coordinatorAssessmentToolName) return submit({ kind: 'assessment', results: [{ nfr: 'nfr-001', result: 'satisfied', inspectedScope: [store, caller], evidence: ['Independent candidate inspection'], uncertainty: '' }] },
      { kind: 'tool', tool: 'snapshot_read', input: { path: caller } },
      { kind: 'tool', tool: 'snapshot_diff', input: { path: store } },
      { kind: 'tool', tool: 'snapshot_diff', input: { comparison: 'accepted-boundary' } });
    return typeof roles === 'function' ? roles(spec) : roles;
  });
  const boundary = new Map<string, { input: ContinueSessionInput; before: AgentSessionSnapshot }>();
  let admittedOperations: SessionOperations;
  const bind = agent.bindSessionStore.bind(agent);
  agent.bindSessionStore = store => {
    const operations = bind(store); admittedOperations = operations;
    return { ...operations, async continue(input) {
      const before = await operations.inspect(input.runId, input.sessionId, input.expectedPoint);
      if (!before) throw new Error('Missing admitted session point');
      boundary.set(input.operationId, { input, before });
      return operations.continue(input);
    } };
  };
  if (mode === 'fresh-fallback') {
    const original = HarnessSessionOperations.prototype.start;
    vi.spyOn(HarnessSessionOperations.prototype, 'start').mockImplementation(async function (this: HarnessSessionOperations, input) {
      const session = await original.call(this, input);
      return input.spec.submission.name === 'submit_work_orientation' ? { ...session, ref: '' } : session;
    });
  }
  const inputs = treeInputs(); const capture = inputs.capture.bind(inputs);
  const opened = await openRuns(root, { agent, git: git.git, candidates: source,
    inputs: { ...inputs, capture: async (...args: Parameters<typeof inputs.capture>) => ({ ...await capture(...args), source: { commit: A, dirty: false } }) },
    policy: projectRoot => testPolicy(projectRoot, { reviews: testReviewPolicy({ kinds: ['code', 'scope', 'design'] }) }) });
  cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('review-notes')); await opened.service.settled('review-notes', receipt.jobId);
  const events = await runEventsOnDisk(root, 'review-notes', receipt.jobId);
  expect(onlyRun(opened.service, 'review-notes').state, JSON.stringify(events.slice(-8))).toBe('completed');
  const starts = events.filter(event => event.type === 'invocation-started');
  const intents = new Map<string, Intent>();
  for (const started of starts) {
    const id = started.data.invocation;
    const intent = JSON.parse(await readFile(join(root, 'plans/.harness/session-operations/correlations/operations', `${hash(JSON.stringify([receipt.jobId, id]))}.json`), 'utf8')) as Intent;
    intents.set(id, intent);
    const packet = intent.packet, manifest = packet.manifest;
    expect(deliveredManifestViewSchema.safeParse(manifest).success).toBe(true);
    expect(manifest.schema).toBe('ramify-agent.delivered-inputs/2');
    expect(manifest.currentMessage).toEqual({ hash: hash(packet.message), bytes: Buffer.byteLength(packet.message) });
    const inherited = intent.context.inherited.slice(0, intent.context.inherited.length - packet.additions.length);
    // Check every physical entry against original text/provenance, including
    // superseded inputs. This deliberately does not use the manifest builder.
    expect(manifest.entries).toEqual([...inherited.map(item => ({ item, delivery: 'inherited' })), ...packet.additions.map(item => ({ item, delivery: 'appended' }))].map(({ item, delivery }) => ({ key: item.key, kind: item.kind, source: item.source, revision: item.revision, hash: hash(item.text), bytes: Buffer.byteLength(item.text), delivery, sources: item.sources ?? [], ...(item.block ? { block: item.block } : {}) })));
    expect(manifest.hash).toBe(hash(JSON.stringify({ inheritedPoint: manifest.inheritedPoint, entries: manifest.entries, currentMessage: manifest.currentMessage })));
    expect(new Set(intent.context.history.map(item => item.revision)).size).toBe(intent.context.history.length);
    expect(intent.context.history.at(-1)!.revision).toBe(intent.context.revision);
    expect(packet.additions.find(item => item.key === 'briefing-state')!.text).toContain(`Briefing revision: ${intent.context.revision};`);
    for (const occurrence of intent.context.history) {
      expect(occurrence.contentHash).toBe(hash(JSON.stringify(occurrence.sections.map(section => ({ key: section.key, text: section.text, source: section.source ?? null, ...(section.effect ? { effect: section.effect } : {}) })))));
    }
    for (const item of packet.additions.filter(item => item.kind === 'brief')) expect(intent.context.history.some(occurrence => occurrence.revision === item.revision)).toBe(true);
    const admitted = boundary.get(id)!;
    const identity = await admittedOperations!.operationIdentity(receipt.jobId, id);
    expect(identity).not.toBeNull();
    const after = await admittedOperations!.inspect(receipt.jobId, identity!.sessionId);
    expect(after!.initialInstructions).toBe(admitted.before.initialInstructions);
    expect(after!.transcript.slice(0, admitted.before.transcript.length)).toEqual(admitted.before.transcript);
    expect(after!.additions.slice(0, admitted.before.additions.length)).toEqual(admitted.before.additions);
    expect(after!.declarations.slice(0, admitted.before.declarations.length)).toEqual(admitted.before.declarations);
    expect(admitted.input.task.message).toBe(packet.message);
    expect(admitted.input.task.submissionTool).toBe(packet.submissionTool);
    const selected = packet.message.match(/Selected procedure: (\S+); SHA-256: ([a-f0-9]{64})/u);
    expect(selected, packet.message.slice(-1200)).not.toBeNull();
    expect(effectiveBlocks(intent.context.inherited).get(selected![1]!)!.text).toSatisfy((text: string) => hash(text) === selected![2]);
    const actual = deliveredScopeInputs({ exactOwners: [], subtrees: [], apiViews: false, architectView: false, supportDocuments: [] }, packet.manifest);
    const uniqueBriefs = new Map(manifest.entries.filter(item => item.kind === 'brief').map(item => [item.hash, item.bytes]));
    expect(actual.scope.brief).toBe([...uniqueBriefs.values()].reduce((sum, bytes) => sum + bytes, 0));
    for (const support of actual.supplementary) expect(manifest.entries.some(item => item.sources.some(value => value.path === support.path && value.bytes === support.bytes) || (item.sources.length === 0 && (item.source === support.path || support.path === `delivered-inputs/${item.kind}/${item.hash}`) && item.bytes === support.bytes))).toBe(true);
  }
  const packets = [...intents.values()].map(intent => intent.packet);
  const selection = packets.find(packet => packet.submissionTool === 'submit_context_selection')!;
  const architect = packets.filter(packet => packet.submissionTool === 'submit_work_item_result');
  const engineer = packets.find(packet => packet.submissionTool === 'submit_iteration_result')!;
  const reviews = packets.filter(packet => packet.submissionTool === 'submit_review');
  const nfrPacket = packets.find(packet => packet.submissionTool === coordinatorAssessmentToolName)!;
  expect(architect).toHaveLength(2); expect(reviews, JSON.stringify(events.filter(event => /review/u.test(event.type)))).toHaveLength(3);
  expect(agent.sessions.find(session => session.spec.submission.name === 'submit_context_selection')!.start.mode).toBe(mode === 'fresh-fallback' ? 'fresh' : 'fork');
  expect(selection.manifest.inheritedPoint === null).toBe(mode === 'fresh-fallback');
  if (explicit) {
    const recorded = events.find(event => event.type === 'work-orientation-recorded')!;
    if (recorded.type !== 'work-orientation-recorded' || !recorded.data.packet) throw new Error('Missing orientation packet');
    expect(await readFile(runPath(root, 'review-notes', receipt.jobId, recorded.data.packet), 'utf8')).toContain(orientationPoint.note);
    expect(selection.message.includes(orientationPoint.note)).toBe(mode === 'fresh-fallback');
    expect(engineer.message).toContain(assignmentPoint.note);
    expect(architect[1]!.message).toContain(resultPoint.note);
    for (const review of reviews) {
      const pointers = review.additions.find(item => item.key === pointKey)!.text;
      expect(pointers).toContain(assignmentPoint.note); expect(pointers).toContain(resultPoint.note);
      expect(pointers).toContain(`pinned candidate ${B}`); expect(pointers).not.toContain(root);
      expect(pointers).not.toContain('Unavailable optional hint');
    }
    const origins = nfrPacket.additions.find(item => item.key === pointKey)!.text;
    expect(origins).toContain('"producer":"architect assignment"'); expect(origins).toContain('"producer":"engineer accepted result"');
    expect(origins).toContain('"workItem":"wi-001"'); expect(origins).toContain('"iteration":"wi-001.i01"'); expect(origins).toContain(`"boundary":"${B}"`);
  } else expect(packets.some(packet => packet.message.includes('Engineer result:'))).toBe(false);
  expect(architect[1]!.message).not.toContain('# Block procedure:local-architect:main');
  expect(architect[1]!.manifest.entries.some(item => item.delivery === 'inherited' && item.block?.key === 'procedure:local-architect:main')).toBe(true);
  const comparisonText = nfrPacket.additions.find(item => item.key === 'brief:support:nonfunctional-source')!.text;
  const comparisons = JSON.parse(comparisonText.slice(comparisonText.indexOf('{')));
  expect(comparisons.comparisons).toEqual([{ name: 'run-start', base: A, target: C, changedPaths: changes }, { name: 'accepted-boundary', base: B, target: C, changedPaths: [] }]);
  expect(comparisons.defaultComparison).toBe('run-start'); expect(nfrPacket.message).toContain(nfr);
  expect(nfrPacket.message).toContain('Make your own semantic judgment for every element');
  const assessed = agent.sessions.find(session => session.spec.submission.name === coordinatorAssessmentToolName)!;
  expect(assessed.results.find(result => result.tool === 'snapshot_diff' && result.text.includes('original-to-candidate note-store patch'))).toBeDefined();
  expect(assessed.results.find(result => result.tool === 'snapshot_diff' && result.text === `Comparison accepted-boundary: base ${B}; target ${C}\nThe candidate changed nothing`)).toBeDefined();
  expect(assessed.spec.builtinTools).toEqual([]); expect(assessed.spec.tools.every(tool => !tool.mutating)).toBe(true);
  const metrics = await new RunQueries(opened.service).metrics('review-notes', receipt.jobId);
  expect(metricsResponseSchema.safeParse(metrics).success).toBe(true);
  for (const evaluation of metrics.evaluation.invocations) {
    expect(evaluation.efficiency!.manifest).toEqual(intents.get(evaluation.invocation)!.packet.manifest);
    expect(evaluation.efficiency!.chargeTotal).toBeNull();
    expect(evaluation.efficiency!.charges).toEqual([]);
  }
  expect(agent.sessions.filter(session => session.spec.submission.name === 'submit_iteration_result')).toHaveLength(1);
  expect(agent.sessions.filter(session => session.spec.submission.name === coordinatorAssessmentToolName)).toHaveLength(1);
  git.assertComplete();
}, 120_000);
