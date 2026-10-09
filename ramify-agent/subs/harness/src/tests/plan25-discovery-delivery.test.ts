import { afterEach, expect, test, vi } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { createScriptedAgent, type SessionScript } from '../../subs/agent/src/scripted.js';
import type { SessionDriverInvocation } from '../../subs/agent/src/interfaces/session-operations.js';
import { HarnessSessionOperations, readSessionPointReference, type HarnessOperationInput } from '../run/session-operations.js';
import { effectiveBlocks } from '../prompts/blocks.js';
import type { TaskPacket } from '../prompts/tasks.js';
import type { BriefingRevision } from '../prompts/briefings.js';
import type { DeliveredInput } from '../prompts/delivered-manifest.js';
import { startingPointsSection, type StartingPointGroup } from '../work/starting-inputs.js';
import { nonfunctionalSourceAllows } from '../nonfunctional/submissions.js';
import type { CandidateSnapshot } from '../reviews/snapshot.js';
import { assign, completionProposed, outline, submit, write } from './helpers/iterations.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { byRole, treeInputs } from './helpers/iterations.js';
import { copyFixture } from './helpers/fixture.js';
import { declaringScenarios } from './helpers/declarations.js';
import { openUnchangedRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { scriptedCandidates } from './helpers/candidates.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { candidates, eventsOf, limit, notes, notesDirectory, plan, reviewRun, reviewTarget, store } from './helpers/reviews.js';
import { installTestRunner, onlyRun, runEventsOnDisk, runPath, startRun } from './helpers/runs.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  try { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); expectNoProcesses(); assertUnchangedGit(); }
  finally { forgetExternalTools(); }
});
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const blockKey = 'brief:support:starting-points';
const set = (text: string) => `# Block ${blockKey}\nCurrent value; replaces any earlier value for this key.\n${text}`;
function group(note: string, producer = 'architect assignment'): StartingPointGroup {
  return { origin: { producer, workItem: 'wi-001', iteration: 'wi-001.i01', invocation: 'iv-001', boundary: 'recorded-source' },
    points: [{ path: 'subs/owner/src/caller.ts', note }] };
}
function request(operationId: string, ref?: string, groups: readonly StartingPointGroup[] = [group('A')]): HarnessOperationInput {
  const name = 'submit_work_item_result';
  const section = startingPointsSection(groups, { projectRoot: '/project' });
  return { runId: 'run', operationId, session: 'logical-session',
    loaded: { role: 'local-architect', package: 'pinned/test', hash: '0'.repeat(64), files: [], submissionKinds: [], system: 'Pinned architect role.', procedure: 'Main procedure; submit through {{submissionTool}}.', skill: '', skillDirectory: '/skills', extraSkill: '', submissionSchema: '{"type":"object"}' },
    brief: { kind: 'assignment', objective: `Perform ${operationId}`, goal: 'G', requirements: ['R'], sections: section === undefined ? [] : [section],
      environment: { projectRoot: '/project', workingDirectory: '/project/subs/owner/src', candidate: 'C1', snapshot: null, limits: { stopSettleMs: 1000 }, availableTools: [name], views: [], supportPaths: [], cucumberConfiguration: null } },
    spec: { role: 'local-architect', scope: { workingDirectory: '/project/subs/owner/src' }, session: ref ? { mode: 'continue', ref } : { mode: 'fresh' },
      context: { compaction: 'forbidden', budgetTokens: null, budgetFraction: null, reportReserveTokens: 0 }, builtinTools: [], tools: [], systemPrompt: 'Legacy composite', prompt: 'Legacy composite',
      submission: { name, description: 'Caller description', inputSchema: { type: 'object' }, accept: async () => ({ accepted: true }) }, onEvent: () => undefined },
    authority: { paths: ['subs/owner/src'] }, validator: { schema: 'test/1' }, destination: { record: operationId }, currentAuthority: async () => true };
}
async function open(script: SessionScript = [{ kind: 'submit', input: {} }], directory?: string) {
  const root = directory ?? await mkdtemp(join(tmpdir(), 'plan25-discovery-'));
  if (directory === undefined) cleanups.push(() => rm(root, { recursive: true, force: true }));
  const agent = createScriptedAgent([], { operationScript: script });
  const adapter = await HarnessSessionOperations.open(root, agent); cleanups.push(async () => { await adapter.close(); });
  return { root, agent, adapter };
}
async function turn(adapter: HarnessSessionOperations, input: HarnessOperationInput) {
  const session = await adapter.start(input); expect((await session.outcome).kind).toBe('submitted'); expect(await session.settled()).toBe('settled'); return session;
}
async function contextAt(root: string, ref: string) {
  const point = readSessionPointReference(ref)!.point;
  return JSON.parse(await readFile(join(root, 'correlations/points', `${hash(JSON.stringify(['run', point]))}.json`), 'utf8')) as { inherited: DeliveredInput[]; history: BriefingRevision[]; revision: string };
}
async function packetAt(root: string, runId: string, invocation: string) {
  const path = join(root, 'plans/.harness/session-operations/correlations/operations', `${hash(JSON.stringify([runId, invocation]))}.json`);
  return (JSON.parse(await readFile(path, 'utf8')) as { packet: TaskPacket }).packet;
}

test('D7/I01: real discovery task A → B → A, withdrawal/reintroduction and unchanged turns preserve exact bytes', async () => {
  const seen: SessionDriverInvocation[] = [];
  const first = await open(value => { seen.push(value); return [{ kind: 'submit', input: {} }]; });
  const a = await turn(first.adapter, request('a'));
  const b = await turn(first.adapter, request('b', a.ref, [group('B')]));
  const again = await turn(first.adapter, request('a-again', b.ref));
  const unchanged = await turn(first.adapter, request('unchanged', again.ref));
  expect((await first.adapter.packet('run', 'unchanged'))!.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
  const ctx = await contextAt(first.root, unchanged.ref);
  expect(ctx.history.map(entry => entry.sections.at(-1)!.text)).toEqual(['A', 'B', 'A'].map(note => startingPointsSection([group(note)], { projectRoot: '/project' })!.text));
  expect(ctx.history[0]!.contentHash).toBe(ctx.history[2]!.contentHash);
  expect(ctx.history[0]!.revision).not.toBe(ctx.history[2]!.revision);
  const aText = startingPointsSection([group('A')], { projectRoot: '/project' })!.text;
  expect(seen[2]!.task.message).toContain(set(aText));
  expect(seen[2]!.task.message).not.toContain('# Block brief:goal');
  expect(seen[2]!.task.message).not.toContain('# Block brief:requirements');
  const removed = await turn(first.adapter, request('remove', unchanged.ref, []));
  expect((await first.adapter.packet('run', 'remove'))!.additions.find(item => item.block?.key === blockKey)).toMatchObject({ text: `# Block ${blockKey}\nWithdrawn; this block no longer applies.\n`, block: { key: blockKey, effect: 'remove' } });
  const absent = await turn(first.adapter, request('remove-again', removed.ref, []));
  expect((await first.adapter.packet('run', 'remove-again'))!.additions.filter(item => item.kind === 'brief')).toEqual([]);
  const restored = await turn(first.adapter, request('reintroduce', absent.ref));
  expect(effectiveBlocks((await contextAt(first.root, restored.ref)).inherited).get(blockKey)!.text).toBe(set(aText));
  await turn(first.adapter, request('final-unchanged', restored.ref));
  expect((await first.adapter.packet('run', 'final-unchanged'))!.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
  for (const [index, delivery] of ['a', 'b', 'a-again'].entries()) {
    const packet = (await first.adapter.packet('run', delivery))!;
    const input = packet.additions.find(item => item.block?.key === blockKey)!;
    expect(packet.manifest.entries.filter(entry => entry.key === blockKey).at(-1)!.hash).toBe(hash(input.text));
    expect(seen[index]!.session.initialInstructions).toBe(seen[0]!.session.initialInstructions);
  }
});

test('D7/I02: old-point selector and reviewer inherit no later parent or sibling discoveries', async () => {
  const seen: SessionDriverInvocation[] = [];
  const { root, adapter } = await open(value => { seen.push(value); return [{ kind: 'submit', input: {} }]; });
  const a = await turn(adapter, request('parent-a'));
  const parentUpdate = request('parent-b', a.ref, [group('Parent B')]);
  await turn(adapter, { ...parentUpdate, brief: { ...parentUpdate.brief, environment: { ...parentUpdate.brief.environment, candidate: 'Parent-C2' } } });
  const selector = request('selector', a.ref, []); const selectorName = 'submit_context_selection';
  const child = await turn(adapter, { ...selector,
    loaded: { ...selector.loaded, role: 'context-selector', system: 'Pinned selector.' },
    spec: { ...selector.spec, role: 'context-selector', session: { mode: 'fork', from: a.ref }, submission: { ...selector.spec.submission, name: selectorName } },
    brief: { ...selector.brief, kind: 'selection', retainInheritedSections: true, environment: { ...selector.brief.environment, availableTools: [selectorName] } } });
  expect((await adapter.packet('run', 'selector'))!.additions.filter(item => item.kind === 'brief')).toEqual([]);
  await turn(adapter, { ...request('sibling-update', child.ref, [group('Sibling C')]),
    loaded: { ...selector.loaded, role: 'context-selector', system: 'Pinned selector.' }, spec: { ...selector.spec, role: 'context-selector', session: { mode: 'continue', ref: child.ref }, submission: { ...selector.spec.submission, name: selectorName } },
    brief: { ...selector.brief, kind: 'selection', sections: [startingPointsSection([group('Sibling C')], { projectRoot: '/project' })!], environment: { ...selector.brief.environment, availableTools: [selectorName] } } });
  const reviewer = request('reviewer', a.ref, [group('Exact candidate D', 'engineer accepted result')]); const reviewerName = 'submit_review';
  const reviewed = await turn(adapter, { ...reviewer,
    loaded: { ...reviewer.loaded, role: 'reviewer', system: 'Pinned reviewer.', reviewer: { procedures: { code: 'Review the candidate.', scope: '', design: '' }, orientation: { system: '', submissionSchema: '{"type":"object"}' } } },
    spec: { ...reviewer.spec, role: 'reviewer', session: { mode: 'fork', from: a.ref }, scope: { workingDirectory: '/review-workspace' }, submission: { ...reviewer.spec.submission, name: reviewerName } },
    brief: { ...reviewer.brief, kind: 'code', environment: { ...reviewer.brief.environment, snapshot: 'pinned-tree', workingDirectory: '/review-workspace', availableTools: [reviewerName] } }, authority: { writer: false }, validator: { schema: 'review/1' }, destination: { record: 'reviewer-only' } });
  const context = await contextAt(root, reviewed.ref);
  expect(JSON.stringify(context.inherited)).not.toMatch(/Parent B|Sibling C|Parent-C2/u);
  expect(effectiveBlocks(context.inherited).get(blockKey)!.text).toContain('Exact candidate D');
  expect(seen.at(-1)!.session.parent).toEqual(readSessionPointReference(a.ref)!.point);
  expect(seen.at(-1)!.session.activeTools).toEqual([reviewerName]);
  expect(seen.at(-1)!.session.policy).toMatchObject({ authority: { writer: false }, validator: { schema: 'review/1' }, destination: { record: 'reviewer-only' } });
});

test('I04: named discovery append survives restart and immutable retry without duplicate dispatch', async () => {
  let calls = 0; const script: SessionScript = () => { calls++; return [{ kind: 'submit', input: {} }]; };
  const first = await open(script); const a = await turn(first.adapter, request('before-append'));
  const bText = startingPointsSection([group('B')], { projectRoot: '/project' })!.text;
  const b = await first.adapter.append(a.ref, 'discovery-b', bText, 'support:starting-points');
  if (!('ref' in b)) throw new Error('No accepted append point');
  const aText = startingPointsSection([group('A')], { projectRoot: '/project' })!.text;
  const back = await first.adapter.append(b.ref, 'discovery-a', aText, 'support:starting-points');
  if (!('ref' in back)) throw new Error('No accepted A append point');
  await first.adapter.close(); const next = await open(script, first.root);
  expect(await next.adapter.append(a.ref, 'discovery-a', aText, 'support:starting-points')).toEqual({ outcome: 'already-present', ref: back.ref });
  const input = request('after-append', back.ref); await turn(next.adapter, input);
  const original = await next.adapter.packet('run', 'after-append');
  expect(original!.additions.map(item => item.key)).toEqual(['briefing-state', 'task']);
  await turn(next.adapter, { ...request('after-append', back.ref, [group('Changed loaded discoveries')]), restore: true });
  expect(await next.adapter.packet('run', 'after-append')).toEqual(original); expect(calls).toBe(2);
  await expect(next.adapter.start(request('after-append', back.ref, [group('Conflicting retry discoveries')]))).rejects.toThrow('Conflicting harness session correlation');
  const context = await contextAt(first.root, back.ref);
  expect(context.history).toHaveLength(3);
  expect(context.history[0]!.contentHash).toBe(context.history[2]!.contentHash);
  expect(context.history[0]!.revision).not.toBe(context.history[2]!.revision);
  expect(context.inherited.filter(item => item.key === 'append:discovery-a')).toHaveLength(1);
});

test('I04: prepared and uncommitted failure cannot establish delivered discoveries', async () => {
  const { adapter } = await open();
  await expect(adapter.start({ ...request('prepared'), prepared: async () => { throw new Error('prepared only'); } })).rejects.toThrow('prepared only');
  expect(await adapter.operations.operationIdentity('run', 'prepared')).toBeNull();
  const failed = await open([{ kind: 'fail', error: 'provider interrupted' }]);
  const interrupted = await failed.adapter.start(request('interrupted'));
  expect((await interrupted.outcome).kind).toBe('failed'); expect(await interrupted.settled()).toBe('settled'); expect(interrupted.ref).toBe('');
  expect((await failed.adapter.packet('run', 'interrupted'))!.manifest.inheritedPoint).toBeNull();
  await failed.adapter.close(); const restarted = await open(undefined, failed.root);
  await turn(restarted.adapter, request('fresh-after-interruption'));
  const packet = (await restarted.adapter.packet('run', 'fresh-after-interruption'))!;
  expect(packet.manifest.inheritedPoint).toBeNull();
  expect(packet.additions.find(item => item.block?.key === blockKey)!.text).toContain('"note":"A"');
  expect(packet.additions.some(item => item.kind === 'procedure')).toBe(true);
  expect(packet.additions.filter(item => item.kind === 'environment')).toHaveLength(9);
});

test('D11: snapshot hints use captured existence/access and exact pairs coalesce with every origin', () => {
  const snapshot: CandidateSnapshot = { commit: 'reviewed-candidate', base: 'iteration-base', tree: 'pinned-tree',
    entries: new Map([['src/caller.ts', { path: 'src/caller.ts', kind: 'file', mode: '100644', hash: 'blob', bytes: 10 }], ['src/link', { path: 'src/link', kind: 'symlink', mode: '120000', hash: 'link', bytes: 10 }], ['plans/.harness/result.json', { path: 'plans/.harness/result.json', kind: 'file', mode: '100644', hash: 'record', bytes: 10 }]]),
    directories: new Set(['', 'src', 'plans', 'plans/.harness']), changes: [{ status: 'D', path: 'src/deleted.ts' }] };
  const point = { path: 'src/caller.ts', note: 'Unchanged caller; inspect compatibility.' };
  const groups: StartingPointGroup[] = [
    { ...group('A'), points: [point, point, { path: 'src', note: 'Source directory' }, { path: 'src/deleted.ts', note: 'Deleted hint' }, { path: 'src/link/secret', note: 'Link' }, { path: 'src/.ramify', note: 'Generated' }, { path: '.ramify-architect', note: 'Live view' }, { path: 'plans/.harness/result.json', note: 'Run record' }] },
    { ...group('A', 'engineer accepted result'), points: [point, { ...point, note: 'Different note remains separate' }] },
  ];
  const section = startingPointsSection(groups, { projectRoot: '/workspace', snapshot, allows: path => nonfunctionalSourceAllows(path, ['.']) })!;
  const records = section.text.split('\n').filter(line => line.startsWith('- ')).map(line => JSON.parse(line.slice(2)));
  expect(records.map(record => [record.path, record.note])).toEqual([['src/caller.ts', point.note], ['src', 'Source directory'], ['src/caller.ts', 'Different note remains separate']]);
  expect(records[0].origins.map((origin: StartingPointGroup['origin']) => origin.producer)).toEqual(['architect assignment', 'engineer accepted result']);
  expect(section.text).not.toContain('/workspace'); expect(section.text).toContain('pinned candidate reviewed-candidate (tree pinned-tree)');
  expect(section.text).toContain('not verified current facts');
  expect(startingPointsSection([{ ...group('A'), points: undefined }], { projectRoot: '/workspace' })).toBeUndefined();
});

test('D4/D5/D11: actual engineer, architect, code/scope/design tasks carry only the exact iteration/candidate discoveries', async () => {
  const root = await reviewTarget(cleanups);
  const caller = `${notesDirectory}/src/notes.ts`;
  const assignmentPoints = [
    [{ path: store, note: 'Implementation entry' }, { path: `${notesDirectory}/src/tests/notes.test.ts`, note: 'Owned test' }, { path: 'ramify-audit.json', note: 'Configured checks' }, { path: caller, note: 'Unchanged caller' }],
    [{ path: limit, note: 'Second iteration assignment' }],
    [{ path: caller, note: 'Third assignment' }],
  ];
  const resultPoints = [
    [{ path: caller, note: 'Unchanged caller' }, { path: store, note: 'First engineer result' }, { path: 'missing/moved.ts', note: 'Old optional hint' }, { path: 'plans/.harness/result.json', note: 'Run artifact' }, { path: 'src/tests/.ramify/external', note: 'Testing view' }],
    [{ path: limit, note: 'Second engineer result' }],
    [{ path: store, note: 'Third engineer result' }],
  ];
  const clean = (...paths: string[]) => [{ kind: 'submit' as const, input: { inspected: paths, missing: [], concerns: [] } }];
  const index = `${notesDirectory}/src/index.ts`;
  const readme = `${notesDirectory}/README.md`;
  const commits = Object.fromEntries(Object.entries(candidates()).map(([key, value]) => [key, { ...value, files: { ...value.files, [readme]: 'Notes keep a note store in memory.\n' } }]));
  const run = await reviewRun(root, cleanups, {
    policy: { kinds: ['code', 'scope', 'design'] }, commits,
    architect: [submit(assign(notes, { startingPoints: assignmentPoints[0] }, outline())), submit(assign(notes, { startingPoints: assignmentPoints[1] })), submit(assign(notes, { startingPoints: assignmentPoints[2] })), submit(requestCompletion())],
    engineer: [submit(completionProposed('First', { startingPoints: resultPoints[0] }), write(store, 'export const store = new Map(); // v1\n')), submit(completionProposed('Second', { startingPoints: resultPoints[1] }), write(limit, 'export const limit = (text: string) => text.length <= 50;\n')), submit(completionProposed('Third', { startingPoints: resultPoints[2] }), write(store, 'export const store = new Map(); // v3\n'), write(index, 'export * from "./store.js";\n'))],
    reviewers: { orientation: [{ kind: 'submit', input: { read: [readme], summary: 'Keep store in memory.' } }],
      'rq-0001': clean(store), 'rq-0002': clean(store), 'rq-0003': clean(store), 'rq-0004': clean(limit), 'rq-0005': clean(limit), 'rq-0006': clean(limit), 'rq-0007': clean(store, index), 'rq-0008': clean(store, index), 'rq-0009': clean(store, index) },
  });
  expect(onlyRun(run.service, plan).state, JSON.stringify(run.events.slice(-8))).toBe('completed');
  const starts = eventsOf(run.events, 'invocation-started');
  for (const [number, started] of starts.filter(event => event.data.role === 'engineer').entries()) {
    const packet = await packetAt(root, run.runId, started.data.invocation);
    const discovery = packet.additions.find(item => item.block?.key === blockKey)!;
    for (const point of assignmentPoints[number]!) expect(discovery.text).toContain(JSON.stringify({ path: join(root, point.path), note: point.note }).slice(1, -1));
    expect(discovery.text).toContain(`"iteration":"wi-001.i0${number + 1}"`);
    expect(discovery.text).toContain('"producer":"architect assignment"');
    expect(packet.message.split('## Recorded starting points')).toHaveLength(2);
  }
  const locals = starts.filter(event => event.data.role === 'local-architect');
  const resultTasks = await Promise.all(locals.map(event => packetAt(root, run.runId, event.data.invocation)));
  for (const [index, point] of resultPoints.map(points => points[0]!).entries()) {
    const returned = resultTasks.find(packet => packet.additions.some(item => item.block?.key === blockKey && item.text.includes(point.note)))!;
    expect(returned).toBeDefined();
    const entry = returned.additions.find(item => item.block?.key === blockKey)!;
    expect(entry.text).toContain('engineer accepted result'); expect(entry.text).toContain(`"boundary":"revision-0${index + 1}"`);
  }
  for (const started of starts.filter(event => event.data.role === 'reviewer' && event.data.work.iteration !== undefined)) {
    const number = Number(started.data.work.iteration!.slice(-2)) - 1;
    const packet = await packetAt(root, run.runId, started.data.invocation);
    if (packet.submissionTool !== 'submit_review') continue;
    const section = packet.additions.find(item => item.block?.key === blockKey)!;
    expect(section.text).toContain(resultPoints[number]![number === 0 ? 1 : 0]!.note);
    expect(section.text).toContain(`pinned candidate revision-0${number + 1}`);
    expect(section.text).not.toContain(root); expect(section.text).not.toMatch(/Old optional hint|Run artifact|Testing view/u);
    if (number !== 0) expect(section.text).not.toContain('First engineer result');
    if (number !== 1) expect(section.text).not.toContain('Second engineer result');
    if (number === 0) {
      const callerLine = section.text.split('\n').find(line => line.startsWith('- ') && line.includes('Unchanged caller'))!;
      expect(JSON.parse(callerLine.slice(2)).origins).toHaveLength(2);
    }
    expect(packet.additions.filter(item => item.key === 'brief:support:candidate-diff')).toHaveLength(1);
    expect(packet.message).toContain('Use the supplied changed-path list and complete patches');
  }
  run.git.assertComplete();
}, 120_000);

test('D5: an actual partial engineer result is navigation help labeled partial for the local architect', async () => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove); await installTestRunner(fixture.root);
  const point = { path: 'missing/old-caller.ts', note: 'Partial investigation; inspect current source.' };
  const fixed = { tree: 'a'.repeat(40), files: {}, base: 'scenarios-of-review-notes', changes: [] };
  const source = scriptedCandidates(fixture.root, { 'scenarios-of-review-notes': fixed, 'unchanged-fixture-revision': fixed, ['a'.repeat(40)]: fixed });
  const agent = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-note', 'collection-review/workspace/reviews')]))],
    'local-architect': [submit(assign('collection-review/workspace/reviews', {}, outline())), submit(requestCompletion())],
    engineer: [submit({ kind: 'partial', done: ['Inspected caller'], unfinished: ['Implement behavior'], findings: [], startingPoints: [point] })],
  })));
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(), candidates: source,
    unchangedCheckpoints: [scenariosCommit(plan), 'wi-001', `final verification of plan "${plan}"`] });
  cleanups.push(() => opened.service.close()); const receipt = await opened.service.execute(startRun(plan)); await opened.service.settled(plan, receipt.jobId);
  expect(onlyRun(opened.service, plan).state).toBe('completed');
  const returned = agent.sessions.find(session => session.spec.prompt.includes('"producer":"engineer partial result"'))!;
  expect(returned).toBeDefined(); expect(returned.spec.role).toBe('local-architect');
  expect(returned.spec.prompt).toContain(join(fixture.root, point.path)); expect(returned.spec.prompt).toContain(point.note);
  expect(returned.spec.prompt).toContain('unfinished: Implement behavior');
  expect(agent.sessions.filter(session => session.spec.role === 'reviewer')).toHaveLength(0);
}, 120_000);

test.each(['retained', 'no-point', 'missing-packet', 'lost-parent', 'legacy', 'legacy-missing-submission'] as const)('D6/D7/I03: actual %s orientation context delivers available discoveries once on fresh consumers', async mode => {
  const fixture = await copyFixture(); cleanups.push(fixture.remove); await installTestRunner(fixture.root);
  const point = { path: 'subs/foreign/src/unchanged-caller.ts', note: 'Orientation-only caller; inspect compatibility.' };
  if (mode === 'no-point' || mode === 'legacy-missing-submission') {
    const original = HarnessSessionOperations.prototype.start;
    const spy = vi.spyOn(HarnessSessionOperations.prototype, 'start').mockImplementation(async function (this: HarnessSessionOperations, input) {
      const session = await original.call(this, input);
      return input.spec.submission.name === 'submit_work_orientation' ? { ...session, ref: '' } : session;
    }); cleanups.push(async () => { spy.mockRestore(); });
  }
  const rest = declaringScenarios(byRole({ 'initial-architect': [submit(analysis([entry('review-summary', 'collection-review/workspace/reviews/core')]))], 'local-architect': [submit(requestCompletion())] }));
  const agent = createScriptedAgent(spec => {
    if (spec.submission.name === 'submit_work_orientation') return submit({ focus: 'Caller', currentUnderstanding: 'Inspect compatibility', questions: [], ...(mode.startsWith('legacy') ? {} : { startingPoints: [point] }) });
    if (mode === 'lost-parent' && spec.role === 'context-selector') {
      const parent = agent.sessions.find(session => session.spec.submission.name === 'submit_work_orientation')!;
      expect(agent.loseSession(JSON.parse(parent.ref))).toBe(true);
    }
    return typeof rest === 'function' ? rest(spec) : rest;
  });
  const opened = await openUnchangedRuns(fixture.root, { agent, inputs: treeInputs(),
    unchangedCheckpoints: [scenariosCommit('revision-diff'), 'wi-001', 'final verification of plan "revision-diff"'],
    afterWrite: async (write, jobId) => {
      if (!['missing-packet', 'legacy-missing-submission'].includes(mode) || write !== 'work-orientation-recorded') return;
      const events = await runEventsOnDisk(fixture.root, 'revision-diff', jobId);
      const event = events.find(event => event.type === 'work-orientation-recorded')!;
      await rm(runPath(fixture.root, 'revision-diff', jobId, mode === 'missing-packet' ? event.data.packet! : `invocations/${event.data.invocation}/submission.json`));
    } }); cleanups.push(() => opened.service.close());
  const receipt = await opened.service.execute(startRun('revision-diff')); await opened.service.settled('revision-diff', receipt.jobId);
  expect(onlyRun(opened.service, 'revision-diff').state).toBe('completed');
  const selector = agent.sessions.find(session => session.spec.role === 'context-selector')!;
  const architect = agent.sessions.find(session => session.spec.submission.name === 'submit_work_item_result')!;
  expect(agent.sessions.filter(session => session.spec.submission.name === 'submit_work_orientation')).toHaveLength(1);
  for (const consumer of [selector, architect]) {
    if (consumer.start.mode === 'fresh' && !mode.startsWith('legacy')) {
      expect(consumer.spec.prompt).toContain('## Recorded starting points');
      expect(consumer.spec.prompt.split(point.note)).toHaveLength(2);
      expect(consumer.spec.prompt).toContain(join(fixture.root, point.path));
      expect(consumer.spec.prompt).toContain('"producer":"local architect orientation"');
      expect(consumer.spec.prompt).toContain('"boundary":"scenarios-of-revision-diff"');
    } else {
      expect(consumer.spec.prompt).not.toContain(point.note);
      expect(consumer.spec.prompt).not.toContain('## Recorded starting points');
    }
    expect(consumer.spec.prompt).toContain('Selected procedure:');
    expect(consumer.spec.prompt).toContain('Submit only through');
  }
  if (mode === 'no-point' || mode === 'missing-packet') expect(selector.start.mode).toBe('fresh');
  if (mode === 'lost-parent') expect(architect.start.mode).toBe('fresh');
  if (mode === 'legacy-missing-submission') {
    expect(selector.start.mode).toBe('fresh');
    expect(selector.spec.prompt).toContain('Focus: Caller');
    expect(selector.spec.prompt).toContain('Current understanding: Inspect compatibility');
  }
}, 120_000);
