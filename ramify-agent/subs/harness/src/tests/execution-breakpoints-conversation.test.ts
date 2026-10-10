import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { debugInspectionSchema, debugExchangeSchema, startRunCommandSchema, type DebugMessageCommand } from '../interfaces/protocol/runs.js';
import { openSessionStore } from '../run/session-store.js';
import { readSessionPointReference } from '../run/session-operations.js';
import { analysis, entry } from './helpers/analysis.js';
import { copyFixture } from './helpers/fixture.js';
import { assign, byRole, completionProposed, outline, submit, treeInputs } from './helpers/iterations.js';
import { installTestRunner, startRun, stopRun, testPolicy, until } from './helpers/runs.js';
import { scenariosCommit } from './helpers/scripted-git.js';
import { openUnchangedRuns, assertUnchangedGit } from './helpers/unchanged-run.js';
import { gate } from './helpers/reviews.js';
import { declaringScenarios } from './helpers/declarations.js';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import type { ScriptStep } from '../../subs/agent/src/scripted.js';

const plan = 'review-notes';
const module = 'collection-review/workspace/reviews';
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  assertUnchangedGit();
});

async function ordinary(engineer: readonly (readonly ScriptStep[])[], options: Parameters<typeof openUnchangedRuns>[1] = {}) {
  const copied = await copyFixture();
  cleanups.push(copied.remove);
  await installTestRunner(copied.root);
  const opened = await openUnchangedRuns(copied.root, { inputs: treeInputs(), unchangedCheckpoints: [scenariosCommit(plan)],
    script: byRole({ 'initial-architect': [submit(analysis([entry('review-note', module)]))],
      'local-architect': [submit(assign(module, {}, outline())), submit(assign(module))], engineer }), ...options });
  cleanups.push(() => opened.service.close());
  const start = startRunCommandSchema.parse({ ...startRun(plan, 'scripted', 'debug-start'),
    payload: { planId: plan, agent: 'scripted', breakpoint: 'before-agent:engineer' } });
  const receipt = await opened.service.execute(start);
  await until(() => opened.service.debugState(plan, receipt.jobId)?.state === 'paused');
  return { ...opened, root: copied.root, runId: receipt.jobId, pause: opened.service.debugState(plan, receipt.jobId)! };
}

type Opened = Awaited<ReturnType<typeof ordinary>>;
function message(opened: Opened, text: string, commandId = 'message-1', revision = opened.pause.revision): DebugMessageCommand {
  return { commandId, expectedVersion: 0, type: 'debug-message', payload: { planId: plan, jobId: opened.runId,
    pauseId: opened.pause.pauseId, expectedRevision: revision, message: text } };
}
async function settled(opened: Opened, commandId = 'message-1') {
  await until(() => opened.service.debugResult(plan, opened.runId, commandId)?.status !== 'admitted');
  return opened.service.debugResult(plan, opened.runId, commandId)!;
}
async function stop(opened: Opened) {
  await opened.service.execute(stopRun(plan, opened.runId, opened.service.getRun(plan, opened.runId)!.version));
  await until(() => opened.service.getRun(plan, opened.runId)?.state === 'stopped');
}
function resume(opened: Opened, revision: number, text?: string) {
  return { commandId: 'resume-1', expectedVersion: 0, type: 'debug-resume' as const,
    payload: { planId: plan, jobId: opened.runId, pauseId: opened.pause.pauseId, expectedRevision: revision,
      ...(text === undefined ? {} : { message: text }) } };
}

const explain = (text: string): readonly ScriptStep[] => [{ kind: 'message', text }, { kind: 'end', message: text }];

test('B05 B06 B07: preview, two plain returns and resumed implementation retain normal task, tools and both histories', async () => {
  const opened = await ordinary([explain('I will implement a note.'), explain('I understand the boundary.'), submit(completionProposed())],
    { unchangedCheckpoints: [scenariosCommit(plan), 'wi-001.i01'] });
  const { service, agent, root, runId, pause } = opened;
  const before = service.events(plan, runId)!.length;
  const inspection = debugInspectionSchema.parse(await service.debugInspect(plan, runId, pause.pauseId));
  expect(inspection.preview).toBe(true);
  expect(inspection.input.continuity).toBe('fresh');
  expect(inspection.input.tools.map(tool => tool.name)).toEqual(expect.arrayContaining(['read', 'grep', 'ls', 'edit', 'write', 'shell', 'submit_iteration_result']));
  expect(inspection.input.message).toContain('Current task: engineering');
  expect(inspection.input.roleInstructions).toBeTruthy();
  expect(inspection.input.scope.guarded).toBeTruthy();
  expect(inspection.input.bounds.invocationAbsoluteMs).toBeGreaterThan(0);
  expect(service.events(plan, runId)!).toHaveLength(before);
  expect(agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(0);
  const firstText = 'Explain your understanding. Do not edit or submit.\nKeep this exact line.\n';
  const command = message(opened, firstText);
  const admitted = await service.execute(command);
  expect(await service.execute(command)).toEqual(admitted);
  const first = debugExchangeSchema.parse(await settled(opened));
  expect(first).toMatchObject({ status: 'settled', taskState: 'pending', answer: 'I will implement a note.', outcome: 'ended', revision: 2 });
  const engineer1 = agent!.sessions.filter(session => session.spec.role === 'engineer')[0]!;
  expect(engineer1.spec.prompt).toBe(`${inspection.input.message}\n\n${firstText}`);
  expect(engineer1.spec.tools.filter(tool => tool.name === 'shell').map(tool => ({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema, mutating: tool.mutating ?? false })))
    .toEqual(inspection.input.tools.filter(tool => tool.name === 'shell'));
  expect(await service.execute(command)).toEqual(admitted);
  await expect(service.execute({ ...command, payload: { ...command.payload, message: 'Different' } })).rejects.toMatchObject({ code: 'conflict' });
  await expect(service.execute(message(opened, 'stale', 'stale', 1))).rejects.toMatchObject({ code: 'stale-version' });
  const followup = message(opened, 'What about the tests?', 'message-2', 2);
  await service.execute(followup);
  const second = await settled(opened, 'message-2');
  expect(second.taskState).toBe('pending');
  const continued = await service.debugInspect(plan, runId, pause.pauseId);
  expect(continued.input.continuity).toBe('retained');
  expect(continued.input.source).toBe(second.point);
  expect(continued.input.inherited.some(input => input.text === firstText)).toBe(true);
  expect(continued.input.inherited.some(input => input.text === 'What about the tests?')).toBe(true);
  expect(continued.input.roleInstructions).toBe(inspection.input.roleInstructions);
  expect(continued.input.additions.some(input => input.kind === 'role-instructions')).toBe(false);
  expect(continued.input.effective.find(input => input.kind === 'role-instructions')?.text).toBe(inspection.input.roleInstructions);
  expect(continued.input.effective.some(input => input.block?.key.startsWith('procedure:') && input.text.includes('Current procedure'))).toBe(true);
  expect(continued.input.effective.some(input => input.block?.key === 'environment:workingDirectory' && input.text.includes(root))).toBe(true);
  expect(continued.input.effective.some(input => input.block?.key === 'brief:goal' && input.text.includes(pause.goal))).toBe(true);
  const chat = agent!.sessions.filter(session => session.spec.role === 'engineer');
  expect(chat).toHaveLength(2);
  expect(chat[1]!.spec.session).toMatchObject({ mode: 'continue', ref: JSON.stringify(readSessionPointReference(first.point!)!.point) });
  expect(service.events(plan, runId)!.filter(event => event.sequence > pause.cursor && ['gate-started', 'iteration-closed'].includes(event.type))).toHaveLength(0);
  const correlations = join(root, 'plans', '.harness', 'session-operations', 'correlations', 'operations');
  // Recorded packet text is the delivered text, not merely a retained caller annotation.
  const files = await readdir(correlations);
  const packets = await Promise.all(files.map(file => readFile(join(correlations, file), 'utf8').then(text => JSON.parse(text))));
  expect(packets.find(packet => packet.operationId === first.invocation)?.packet.message).toBe(engineer1.spec.prompt);
  const release = resume(opened, 3, 'Now implement the ordinary task.');
  const receipt = await service.execute(release);
  expect(await service.execute(release)).toEqual(receipt);
  await until(() => service.debugState(plan, runId)?.pauseId !== pause.pauseId);
  await until(() => service.debugState(plan, runId)?.state === 'paused');
  const calls = agent!.sessions.filter(session => session.spec.role === 'engineer');
  expect(calls).toHaveLength(3);
  expect(calls[2]!.spec.session).toMatchObject({ mode: 'continue', ref: JSON.stringify(readSessionPointReference(second.point!)!.point) });
  expect(calls[2]!.spec.prompt).toContain('Now implement the ordinary task.');
  const point = readSessionPointReference(second.point!)!.point;
  const store = await openSessionStore({ directory: join(root, 'plans', '.harness', 'session-operations', 'store') });
  const retained = await agent!.bindSessionStore(store).inspect(runId, point.sessionId, point);
  const native = await Promise.all(retained!.transcript.filter(item => item.kind === 'provider').map(async item => {
    const payload = await store.getPayload(item.payloadId); return new TextDecoder().decode(payload!);
  }));
  await store.close();
  expect(native.join('\n')).toContain('I will implement a note.');
  expect(native.join('\n')).toContain('I understand the boundary.');
  expect(service.debugResult(plan, runId, 'message-1')).toEqual(first);
  await stop(opened);
});

test.each(['completion-proposed', 'partial'] as const)('B09 B11: accepted %s is held, messages refused and resume consumes once without a model call', async kind => {
  const input = kind === 'completion-proposed' ? completionProposed() : { kind: 'partial', done: ['Useful partial work'], unfinished: ['Remaining task'], findings: [], startingPoints: [] };
  const opened = await ordinary([submit(input)], { unchangedCheckpoints: kind === 'completion-proposed' ? [scenariosCommit(plan), 'wi-001.i01'] : [scenariosCommit(plan)] });
  const command = message(opened, 'Perform the task.');
  await opened.service.execute(command);
  const result = await settled(opened);
  expect(result.taskState).toBe('accepted');
  expect(result.verdicts).toEqual([expect.objectContaining({ accepted: true })]);
  expect(opened.service.events(plan, opened.runId)!.some(event => event.sequence > opened.pause.cursor && (event.type === 'gate-started' || event.type === 'iteration-closed'))).toBe(false);
  await expect(opened.service.execute(message(opened, 'Replace result', 'replace', 2))).rejects.toMatchObject({ code: 'conflict' });
  const release = resume(opened, 2);
  const receipt = await opened.service.execute(release);
  expect(await opened.service.execute(release)).toEqual(receipt);
  await until(() => opened.service.debugState(plan, opened.runId)?.pauseId !== opened.pause.pauseId);
  await until(() => opened.service.debugState(plan, opened.runId)?.state === 'paused');
  expect(opened.agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
  expect(opened.service.events(plan, opened.runId)!.filter(event => event.type === 'debug-resumed')).toHaveLength(1);
  await stop(opened);
});

test('B10: final submission rejection remains terminal, keeps actual verdict and refuses further chat', async () => {
  const opened = await ordinary([[...submit({ wrong: true }), ...submit({ wrong: true }), ...submit({ wrong: true })]]);
  await opened.service.execute(message(opened, 'Try invalid submission.'));
  const result = await settled(opened);
  expect(result).toMatchObject({ taskState: 'terminal', outcome: 'invalid-submission' });
  expect(result.verdicts.length).toBeGreaterThan(0);
  expect(result.verdicts.every(verdict => !verdict.accepted)).toBe(true);
  expect(result.verdicts[0]!.answer).toContain('kind');
  expect(opened.service.getRun(plan, opened.runId)?.state).toBe('running');
  await expect(opened.service.execute(message(opened, 'Try again', 'again', 2))).rejects.toMatchObject({ code: 'conflict' });
  await stop(opened);
});

test('B10: explicit continuity loss rebuilds normal task and retains current caller text before fresh admission', async () => {
  const opened = await ordinary([explain('First explanation'), explain('Fresh explanation')]);
  await opened.service.execute(message(opened, 'First question'));
  const first = await settled(opened);
  expect(opened.agent!.loseSession(readSessionPointReference(first.point!)!.point)).toBe(true);
  const inspection = await opened.service.debugInspect(plan, opened.runId, opened.pause.pauseId);
  expect(inspection.input).toMatchObject({ continuity: 'unavailable' });
  expect(inspection.input.continuityReason).toBeTruthy();
  const text = 'Current question survives fallback.\nExact ending.\n';
  await opened.service.execute(message(opened, text, 'message-2', 2));
  const second = await settled(opened, 'message-2');
  expect(second, JSON.stringify(second)).toMatchObject({ taskState: 'pending', answer: 'Fresh explanation' });
  expect(second.continuityLoss).toBeTruthy();
  const calls = opened.agent!.sessions.filter(session => session.spec.role === 'engineer');
  expect(calls[1]!.spec.session.mode).toBe('fresh');
  expect(calls[1]!.spec.prompt).toContain('Current task: engineering');
  expect(calls[1]!.spec.prompt.endsWith(text)).toBe(true);
  expect(calls[1]!.inherited).toHaveLength(0);
  await stop(opened);
});

test('B03 B11: model exchange executes outside command mutex, stale/concurrent commands are refused, caller waits excluded and exchange charged', async () => {
  let clock = new Date('2026-10-10T12:00:00Z');
  const started = gate(); const release = gate();
  const opened = await ordinary([[{ kind: 'await', until: async () => { started.open(); await release.opened; clock = new Date(clock.getTime() + 2_000); } }, ...explain('Bounded discussion')]],
    { now: () => clock, policy: root => { const policy = testPolicy(root); return { ...policy, limits: { ...policy.limits, runAbsoluteMs: 1_000 } }; } });
  clock = new Date(clock.getTime() + 100_000);
  const command = message(opened, 'Discuss');
  const receipt = await opened.service.execute(command);
  await started.opened;
  expect(opened.service.debugState(plan, opened.runId)?.state).toBe('exchanging');
  expect(opened.service.debugResult(plan, opened.runId, command.commandId)?.status).toBe('admitted');
  expect(await opened.service.execute(command)).toEqual(receipt);
  await expect(opened.service.execute(message(opened, 'Race', 'race'))).rejects.toMatchObject({ code: 'busy' });
  await expect(opened.service.execute(resume(opened, 1))).rejects.toMatchObject({ code: 'busy' });
  release.open();
  await settled(opened);
  clock = new Date(clock.getTime() + 100_000);
  await opened.service.execute(resume(opened, 2));
  await until(() => opened.service.getRun(plan, opened.runId)?.state === 'failed');
  expect(opened.agent!.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
  expect(opened.service.events(plan, opened.runId)!.find(event => event.type === 'job-failed')?.data).toMatchObject({ reason: 'limit-exceeded' });
});

test('B04 B11: stop cancels active exchange, keeps truthful result and prevents later messages or held release', async () => {
  const started = gate(); const release = gate();
  const opened = await ordinary([[{ kind: 'await', until: async () => { started.open(); await release.opened; } }, ...submit(completionProposed())]]);
  const command = message(opened, 'Work');
  await opened.service.execute(command);
  await started.opened;
  const stopping = stop(opened);
  release.open();
  await stopping;
  const result = opened.service.debugResult(plan, opened.runId, command.commandId)!;
  expect(result).toMatchObject({ status: 'stopped', taskState: 'terminal' });
  expect(result.summary).not.toContain('conversation settled');
  await expect(opened.service.execute(resume(opened, 1))).rejects.toMatchObject({ code: 'conflict' });
  await expect(opened.service.execute(message(opened, 'Again', 'again'))).rejects.toMatchObject({ code: 'conflict' });
  expect(opened.service.events(plan, opened.runId)!.some(event => event.sequence > opened.pause.cursor && event.type === 'gate-started')).toBe(false);
});

test('B08: debug exchange preserves scope guard and records an out-of-scope refusal without widening authority', async () => {
  const opened = await ordinary([[{ kind: 'tool', tool: 'write', input: { path: '../../outside.txt', content: 'Forbidden replacement' } }, ...explain('I respected the refusal.')]]);
  const before = await readFile(join(opened.root, 'README.md'), 'utf8');
  await opened.service.execute(message(opened, 'Write outside your scope, then explain.'));
  const result = await settled(opened);
  expect(result).toMatchObject({ status: 'settled', taskState: 'pending' });
  expect(await readFile(join(opened.root, 'README.md'), 'utf8')).toBe(before);
  const engineer = opened.agent!.sessions.find(session => session.spec.role === 'engineer')!;
  expect(engineer.results.map(result => result.text).join('\n')).toContain('scope');
  expect(result.evidence.some(path => path.endsWith('observations.jsonl'))).toBe(true);
  await stop(opened);
});

test.each(['failed', 'context-budget-reached'] as const)('B08 B10: %s remains a held real terminal invocation outcome', async outcome => {
  const opened = await ordinary([outcome === 'failed' ? [{ kind: 'fail', error: 'Provider failed' }] : [{ kind: 'context', tokens: 1_000_000, window: 1_000_000 }]]);
  await opened.service.execute(message(opened, 'Discuss normally'));
  const result = await settled(opened);
  expect(result).toMatchObject({ taskState: 'terminal', outcome });
  if (outcome === 'failed') expect(result.error).toBe('Provider failed');
  expect(opened.service.events(plan, opened.runId)!.some(event => event.sequence > opened.pause.cursor && event.type === 'iteration-closed')).toBe(false);
  await expect(opened.service.execute(message(opened, 'More', 'more', 2))).rejects.toMatchObject({ code: 'conflict' });
  await stop(opened);
});

test.each(['stop', 'close'] as const)('B04 B14: %s after admission and before invocation-started wins; no model effect follows', async action => {
  const admitted = gate(); const release = gate();
  const opened = await ordinary([explain('Must not execute')], {
    afterWrite: async write => { if (write === 'debug-exchange-admitted') { admitted.open(); await release.opened; } },
  });
  const command = message(opened, 'Admitted preflight');
  await opened.service.execute(command);
  await admitted.opened;
  expect(opened.service.debugResult(plan, opened.runId, command.commandId)?.status).toBe('admitted');
  if (action === 'stop') {
    const stopping = stop(opened); release.open(); await stopping;
    await opened.service.settled(plan, opened.runId);
    expect(opened.service.debugResult(plan, opened.runId, command.commandId)?.status).toBe('stopped');
  } else {
    const closing = opened.service.close(); release.open(); await closing;
    const restarted = await openUnchangedRuns(opened.root, { script: [] });
    cleanups.push(() => restarted.service.close());
    expect(restarted.recovery.interrupted).toEqual([`${plan}/${opened.runId}`]);
    expect(restarted.service.debugResult(plan, opened.runId, command.commandId)).toMatchObject({ status: 'interrupted', taskState: 'terminal' });
    expect(await restarted.service.execute(command)).toMatchObject({ commandId: command.commandId });
    expect(restarted.agent!.sessions).toHaveLength(0);
  }
  expect(opened.agent!.sessions.some(session => session.spec.role === 'engineer')).toBe(false);
});

test('B14: host shutdown during admitted model exchange retains interruption and never restores workflow or conversation', async () => {
  const started = gate();
  const opened = await ordinary([[{ kind: 'await', until: async () => { started.open(); await new Promise(() => undefined); } }]]);
  const command = message(opened, 'Persist admitted identity');
  const receipt = await opened.service.execute(command);
  await started.opened;
  await opened.service.close();
  const restarted = await openUnchangedRuns(opened.root, { script: [] });
  cleanups.push(() => restarted.service.close());
  expect(restarted.recovery.interrupted).toEqual([`${plan}/${opened.runId}`]);
  expect(restarted.recovery.effects).toEqual([]);
  expect(restarted.service.debugResult(plan, opened.runId, command.commandId)).toMatchObject({ status: 'interrupted', taskState: 'terminal' });
  expect(await restarted.service.execute(command)).toEqual(receipt);
  expect(restarted.agent!.sessions).toHaveLength(0);
  expect(restarted.service.events(plan, opened.runId)!.some(event => event.sequence > opened.pause.cursor && event.type === 'iteration-closed')).toBe(false);
});


test('B08: unconfirmed settlement blocks exchanges and gates while resume consumes the held failure once without a model', async () => {
  const barrier = gate();
  const scripted = createScriptedAgent(declaringScenarios(byRole({
    'initial-architect': [submit(analysis([entry('review-note', module)]))],
    'local-architect': [submit(assign(module, {}, outline()))], engineer: [explain('A return is not settlement.')],
  })));
  const opened = await ordinary([], { script: undefined,
    agent: { ...scripted, bindSessionStore(store) { const operations = scripted.bindSessionStore(store); return {
      ...operations, async continue(input) {
        const handle = await operations.continue(input);
        return input.task.role === 'engineer' ? { ...handle, settled: () => barrier.opened.then(() => handle.settled()) } : handle;
      },
    }; } },
    policy: root => { const policy = testPolicy(root); return { ...policy, limits: { ...policy.limits, writerSettleMs: 20, stopSettleMs: 20 } }; },
  });
  // Its intentional unconfirmed writer makes close retain the lock; this
  // fixture has no external process and asserts that refusal explicitly.
  cleanups.pop();
  cleanups.push(async () => { barrier.open(); await expect(opened.service.close()).rejects.toThrow('settlement was not confirmed'); });
  await opened.service.execute(message(opened, 'Use normal equipment.'));
  const result = await settled(opened);
  expect(result.taskState).toBe('terminal');
  expect(result.settlementConfirmed).toBe(false);
  expect(result.summary).toContain('settlement was not confirmed');
  await expect(opened.service.execute(message(opened, 'Again', 'again', 2))).rejects.toMatchObject({ code: 'conflict' });
  const released = resume(opened, 2);
  const receipt = await opened.service.execute(released);
  expect(await opened.service.execute(released)).toEqual(receipt);
  await until(() => opened.service.getRun(plan, opened.runId)?.state === 'failed');
  expect(opened.service.debugState(plan, opened.runId)).toBeNull();
  expect(scripted.sessions.filter(session => session.spec.role === 'engineer')).toHaveLength(1);
  expect(opened.service.events(plan, opened.runId)!.some(event => event.sequence > opened.pause.cursor && event.type === 'gate-started')).toBe(false);
  expect(opened.service.getRun(plan, opened.runId)?.writer.unsettled).not.toBeNull();
});
