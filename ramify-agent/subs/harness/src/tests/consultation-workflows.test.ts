import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createScriptedAgent, type Script } from '../../subs/agent/src/scripted.js';
import { noMessageDetail, type SessionSpec } from '../../subs/agent/src/interfaces/port.js';
import { loadPromptPackages } from '../prompts/packages.js';
import { constructStep } from '../steps/construct.js';
import { parseStepInputs } from '../steps/inputs.js';
import { runDependencyGate } from './helpers/dependency-flow.js';
import { runPath } from './helpers/runs.js';
import { consultationLayout, consultationStartSchema, consultationOutcomeSchema } from '../consultations/records.js';
import { runSessionScenario } from './helpers/session-scenario.js';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { SessionDriverRuntime } from '../../subs/agent/src/interfaces/session-operations.js';
import { readSessionPointReference } from '../run/session-operations.js';
import { consultationId } from '../consultations/records.js';
import { consultationOutcome } from '../consultations/store.js';
import { InvocationBounds } from '../run/port-events.js';
import { runLayout } from '../run/records.js';
import { readTranscript } from '../transcripts/writer.js';
import { answer, ask, consultationFixture, retainConsultationExample } from './helpers/consultations.js';
const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); vi.useRealTimers(); });
async function retainWorkflow(directory: string, name: string) {
  const root = process.env['RAMIFY_PLAN33_WORKFLOW_EVIDENCE'];
  if (!root) return;
  const target = join(root, name); await mkdir(target, { recursive: true });
  for (const artifact of ['job.json', 'events.jsonl', 'invocations', 'transcripts', 'blobs', 'consultations', 'architecture', 'capabilities', 'work-items']) {
    await cp(join(directory, artifact), join(target, artifact), { recursive: true }).catch(error => { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; });
  }
  await writeFile(join(target, 'original-directory.txt'), directory + '\n');
}
function deferred() { let resolve!: () => void; const promise = new Promise<void>(done => resolve = done); return { promise, resolve }; }

describe('Plan 33 awaited consultation workflows', () => {
  test('C06/C07/C08: engineer → local → global → local → engineer, with distinct isolated identities and unchanged architect parents', async () => {
    const fixture = await consultationFixture(cleanup, input => {
      if (input.task.submissionTool !== 'answer_architect_consultation') return [ask('Explain boundary'), { kind: 'message', payload: { text: 'Engineer continued' } }, { kind: 'submit', input: {} }];
      if (input.task.role === 'local-architect') return [ask('Local new facts for global', 'global-question'), { kind: 'message', payload: { text: 'Local received global result and chose its advice' } }, answer('Local composed the final answer')];
      return [{ kind: 'tool', tool: 'consult_architect', input: { message: 'Forbidden extra level' } }, answer('Global advised the local architect')];
    }, base => ({ dispatch: (input, runtime) => {
      if (input.task.submissionTool === 'answer_architect_consultation') {
        const global = input.task.role === 'global-fork';
        runtime.onEvent({ type: 'message', role: 'assistant', observation: { sourceId: `${input.key.operationId}:scripted-usage` }, blocks: [], text: '',
          usage: global ? { input: 100, output: 2, cacheRead: 20, cacheWrite: 30, total: 152 } : { input: 10, output: 1, cacheRead: 2, cacheWrite: 3, total: 16 }, detail: noMessageDetail });
      }
      return base.dispatch(input, runtime);
    } }));
    const G0 = fixture.seeds['global-fork']!; const L0 = fixture.seeds['local-architect']!;
    const outer = await fixture.caller('engineer', L0, G0);
    expect(outer.ended, outer.error).toBe('submitted');
    const starts = fixture.run.log.all('consultation-started'); expect(starts).toHaveLength(2);
    const first = consultationOutcome(fixture.run.log, starts[0]!.data.consultation)!;
    const second = consultationOutcome(fixture.run.log, starts[1]!.data.consultation)!;
    expect(starts[1]!.data.parent).toBe(first.id);
    expect(first).toMatchObject({ status: 'answered', delivery: 'recorded', accepted: { answer: { text: 'Local composed the final answer' } } });
    expect(second).toMatchObject({ status: 'answered', delivery: 'recorded', accepted: { answer: { text: 'Global advised the local architect' } } });
    expect(new Set([outer.session, first.child!.session, second.child!.session]).size).toBe(3);
    const global = fixture.seen.find(input => input.key.operationId === second.child!.invocation)!;
    expect(global.session.activeTools).toEqual(['read', 'grep', 'ls', 'answer_architect_consultation']);
    expect(global.session.parent).toEqual(readSessionPointReference(G0.ref)!.point);
    expect(global.task.message).toContain('Local new facts for global');
    expect(global.task.message).not.toContain('Local received global result');
    expect(fixture.run.log.all('invocation-started').filter(event => event.data.work.request === first.id)).toHaveLength(1);
    const original = await Promise.all(Object.values(fixture.seeds).map(seed => fixture.operations.inspect('R', readSessionPointReference(seed.ref)!.point.sessionId)));
    expect(original).toEqual(fixture.parents);
    const globalTranscript = await readTranscript(fixture.run.path(runLayout.transcript(second.child!.session!)));
    expect(globalTranscript.entries.some(entry => entry.type === 'message' && entry.role === 'tool-result' && entry.tool === 'consult_architect' && entry.isError)).toBe(true);
    // Ordinary orientation and work turns use the identical global tool factory.
    const direct = await fixture.caller('local-architect', G0);
    expect(direct.ended, direct.error).toBe('submitted');
    expect(consultationOutcome(fixture.run.log, consultationId(direct.id, 'ask'))).toMatchObject({ status: 'answered' });
    await retainConsultationExample(fixture, 'nested-and-direct-global');
  });
  test('C06/C12: normal workflow constructors and actual bindings agree, selector remains without consultation', async () => {
    let original!: Script; let engineerAsked = false; let localAsked = false;
    const specs: SessionSpec[] = [];
    const scenario = await runSessionScenario({ cleanup: close => cleanup.push(close), onOpened: (_opened, _boundaries, supplied) => { original = supplied; },
      port: () => createScriptedAgent(spec => {
        specs.push(spec);
        if (spec.submission.name === 'answer_architect_consultation') return [{ kind: 'submit', input: { answer: 'Normal workflow advisory answer' } }];
        const steps = typeof original === 'function' ? original(spec) : original;
        if (spec.role === 'engineer' && !engineerAsked && spec.tools.some(tool => tool.name === 'consult_architect')) {
          engineerAsked = true; return [{ kind: 'tool', tool: 'consult_architect', input: { message: 'Normal engineer question' } }, ...steps];
        }
        if (spec.role === 'local-architect' && !localAsked && spec.tools.some(tool => tool.name === 'consult_architect')) {
          localAsked = true; return [{ kind: 'tool', tool: 'consult_architect', input: { message: 'Normal local question to global' } }, ...steps];
        }
        return steps;
      }) });
    expect(engineerAsked).toBe(true); expect(localAsked).toBe(true);
    const { packages } = await loadPromptPackages({ capabilityWorkflow: false });
    const ordinary = scenario.events.filter(event => event.type === 'invocation-started' && ['engineer', 'local-architect', 'context-selector'].includes(event.data.role) && event.data.work.request?.startsWith('consult-') !== true);
    for (const event of ordinary) {
      if (event.type !== 'invocation-started') continue;
      const inputs = parseStepInputs(await readFile(scenario.path(runLayout.stepInputs(event.data.invocation)), 'utf8'));
      const constructed = constructStep(inputs, { projectRoot: scenario.root, packages });
      const transcript = await readTranscript(scenario.path(runLayout.transcript(event.data.session)));
      const started = transcript.entries.find(entry => entry.type === 'started' && entry.invocation === event.data.invocation)!;
      if (started.type !== 'started') throw new Error('Transcript start missing');
      expect(constructed.brief.environment.availableTools).toEqual(started.declarations!.names);
      if (inputs.role === 'context-selector') expect(constructed.equipment.tools.map(tool => tool.name)).not.toContain('consult_architect');
    }
    expect(scenario.events.filter(event => event.type === 'consultation-started')).toHaveLength(2);
    expect(specs.filter(spec => spec.submission.name === 'answer_architect_consultation').map(spec => spec.role)).toEqual(['global-fork', 'local-architect']);
  }, 60_000);
  test('C17: normal dispatch, assignment, nested advice and ordinary submission preserve workflow semantics', async () => {
    let original!: Script; let asked = false;
    const scenario = await runSessionScenario({ cleanup: close => cleanup.push(close),
      onOpened: (_opened, _boundaries, supplied) => { original = supplied; },
      port: () => createScriptedAgent(spec => {
        if (spec.submission.name === 'answer_architect_consultation') return spec.role === 'local-architect'
          ? [{ kind: 'tool', tool: 'consult_architect', input: { message: 'Explain the global rationale' } },
            { kind: 'submit', input: { answer: 'Local interpreted the global rationale' } }]
          : [{ kind: 'submit', input: { answer: 'Global rationale from pinned dispatch' } }];
        const steps = typeof original === 'function' ? original(spec) : original;
        if (spec.role === 'engineer' && !asked) { asked = true; return [
          { kind: 'tool', tool: 'consult_architect', input: { message: 'Explain my assignment' } }, ...steps]; }
        return steps;
      }) });
    const starts = scenario.events.filter(event => event.type === 'consultation-started');
    expect(starts).toHaveLength(2);
    const outer = consultationStartSchema.parse(JSON.parse(await readFile(scenario.path(consultationLayout.start(starts[0]!.data.consultation)), 'utf8')));
    const inner = consultationStartSchema.parse(JSON.parse(await readFile(scenario.path(consultationLayout.start(starts[1]!.data.consultation)), 'utf8')));
    const assigning = scenario.events.find(event => event.type === 'iteration-assigned' && event.data.iteration === outer.caller.work.iteration)!;
    if (!('invocation' in outer.target.point)) throw new Error('Assignment target is not an invocation');
    expect(assigning).toMatchObject({ data: { architectRef: { ref: outer.target.ref, session: outer.target.session }, invocation: outer.target.point.invocation } });
    expect(inner.parent).toBe(outer.id); expect(inner.target.role).toBe('global-fork');
    const dispatch = scenario.events.find(event => event.type === 'work-item-started' && event.data.workItem === outer.caller.work.workItem)!;
    expect(dispatch).toMatchObject({ data: { globalTarget: inner.target } });
    for (const start of [outer, inner]) {
      const outcome = consultationOutcomeSchema.parse(JSON.parse(await readFile(scenario.path(consultationLayout.outcome(start.id, 2)), 'utf8')));
      expect(outcome, JSON.stringify({ start, outcome })).toMatchObject({ status: 'answered', delivery: 'recorded' });
      const transcript = await readTranscript(scenario.path(runLayout.transcript(start.caller.session)));
      expect(transcript.entries.some(entry => entry.type === 'message' && entry.role === 'tool-result' && entry.callId === start.caller.toolCall)).toBe(true);
    }
    expect(scenario.events.some(event => event.type === 'invocation-ended' && event.data.invocation === outer.caller.invocation && event.data.ended === 'submitted')).toBe(true);
    expect(scenario.events.some(event => event.type === 'invocation-started' && event.data.role === 'local-architect' && event.sequence > starts[1]!.sequence && event.data.work.request?.startsWith('consult-') !== true)).toBe(true);
    // The scenario's placement, contract need, failed provider gate/repair, yield,
    // resumed assignment and final completion all still run their ordinary paths.
    expect(scenario.events.filter(event => event.type === 'placement-requested')).toHaveLength(1);
    expect(scenario.events.filter(event => event.type === 'job-completed')).toHaveLength(1);
    await retainWorkflow(scenario.path(), 'ordinary-nested');
  }, 60_000);
  test('C17: capability and nested-task engineers consult their own assigning coordinators before ordinary handback', async () => {
    await runDependencyGate(false, false, {
      script: original => spec => {
        if (spec.submission.name === 'answer_architect_consultation') {
          expect(['capability-architect', 'local-architect']).toContain(spec.role);
          return [...(spec.role === 'capability-architect' ? [
            { kind: 'tool' as const, tool: 'consult_architect', input: { message: 'No onward capability consultation' } },
            { kind: 'tool' as const, tool: 'update_capability_plan', input: {} },
          ] : []), { kind: 'submit', input: { answer: 'Coordinator advisory evidence for this assignment' } }];
        }
        const steps = typeof original === 'function' ? original(spec) : original;
        if (spec.role === 'engineer') return [{ kind: 'tool', tool: 'consult_architect', input: { message: 'Explain the current assigning coordinator rationale' } }, ...steps];
        return steps;
      },
      inspect: async (root, runId, events) => {
        const read = async (path: string) => JSON.parse(await readFile(runPath(root, 'need', runId, path), 'utf8'));
        const starts = events.filter(event => event.type === 'consultation-started');
        const capabilityStarts = [];
        for (const event of starts) {
          const start = consultationStartSchema.parse(await read(consultationLayout.start(event.data.consultation)));
          const outcome = consultationOutcomeSchema.parse(await read(consultationLayout.outcome(start.id, 2)));
          expect(outcome, JSON.stringify({ start, outcome })).toMatchObject({ status: 'answered', delivery: 'recorded' });
          if (start.target.role !== 'capability-architect') continue;
          capabilityStarts.push(start);
          expect(start.caller.work.task).toBe(start.target.task);
          const assigning = events.find(event => event.type === 'capability-assigned' && event.data.assignment === start.caller.work.iteration)!;
          if (!('invocation' in start.target.point)) throw new Error('Assignment target is not an invocation');
          expect(assigning).toMatchObject({ data: { architectRef: { ref: start.target.ref, session: start.target.session }, invocation: start.target.point.invocation, task: start.target.task } });
          expect(events.some(event => event.type === 'invocation-ended' && event.data.invocation === start.caller.invocation && event.data.ended === 'submitted')).toBe(true);
          const transcript = await readTranscript(runPath(root, 'need', runId, runLayout.transcript(outcome.child!.session!)));
          expect(transcript.entries.filter(entry => entry.type === 'message' && entry.role === 'tool-result' && entry.isError)).toHaveLength(2);
          const child = events.find(event => event.type === 'session-opened' && event.data.session === outcome.child!.session)!;
          expect(child).toMatchObject({ data: { role: 'capability-architect', fork: { reason: 'architect-consultation', from: start.target.point } } });
        }
        expect(capabilityStarts.map(start => start.caller.work.iteration)).toEqual(['cap-001.i01', 'cap-002.i01', 'cap-002.i02', 'cap-001.i01']);
        expect(capabilityStarts[0]!.target).toEqual(capabilityStarts[3]!.target);
        expect(capabilityStarts[1]!.target.session).not.toBe(capabilityStarts[0]!.target.session);
        expect(events.filter(event => event.type === 'capability-assigned')).toHaveLength(3);
        expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(1);
        expect(events.filter(event => event.type === 'capability-plan-revised')).toHaveLength(1);
        await retainWorkflow(runPath(root, 'need', runId), 'capability-nested-handback');
      },
    });
  }, 180_000);
  test('C09: inner global error is delivered to local, which still answers engineer', async () => {
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool !== 'answer_architect_consultation' ? [ask(), { kind: 'submit', input: {} }]
      : input.task.role === 'local-architect' ? [ask('Need global help', 'inner'), answer('Local uncertainty after global failure')]
        : [{ kind: 'fail', error: 'Global provider failed' }]);
    const caller = await fixture.caller('engineer', fixture.seeds['local-architect']!, fixture.seeds['global-fork']!);
    expect(caller.ended, caller.error).toBe('submitted');
    const starts = fixture.run.log.all('consultation-started');
    expect(consultationOutcome(fixture.run.log, starts[0]!.data.consultation)).toMatchObject({ status: 'answered' });
    expect(consultationOutcome(fixture.run.log, starts[1]!.data.consultation)).toMatchObject({ status: 'failed', delivery: 'recorded', error: { code: 'provider-failure' } });
  });
  test('C10/C11: cancellation during nested wait stops both forks and records unknown delivery without late answer or implicit retry', async () => {
    const reached = deferred(); const wait = deferred(); const controller = new AbortController();
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool !== 'answer_architect_consultation' ? [ask(), { kind: 'submit', input: {} }]
      : input.task.role === 'local-architect' ? [ask('Inner await', 'inner'), answer('Late local answer')]
        : [{ kind: 'await', until: () => { reached.resolve(); return wait.promise; } }, answer('Late global answer')]);
    const active = fixture.caller('engineer', fixture.seeds['local-architect']!, fixture.seeds['global-fork']!, { signal: controller.signal });
    await reached.promise;
    expect(fixture.run.live.size).toBe(3);
    controller.abort();
    const caller = await active; wait.resolve();
    expect(caller.ended).toBe('stopped'); expect(fixture.run.live.size).toBe(0);
    const starts = fixture.run.log.all('consultation-started'); expect(starts).toHaveLength(2);
    for (const start of starts) expect(consultationOutcome(fixture.run.log, start.data.consultation)).toMatchObject({ status: 'cancelled', accepted: null, delivery: 'unknown', result: null });
    expect(fixture.seen.filter(input => input.task.submissionTool === 'answer_architect_consultation')).toHaveLength(2);
    const interrupted = await fixture.store.read('R', `operation:${caller.id}`);
    expect(interrupted?.body['effects']).toMatchObject([{ callId: 'ask', phase: 'intent', result: null }]);
    const count = fixture.run.log.all('invocation-started').length;
    const retried = await fixture.operations.retry({ runId: 'R', operationId: caller.id, bindings: fixture.bindings.get(caller.id)! });
    expect((await retried.receipt).status).toBe('stopped'); await retried.settled();
    expect(fixture.run.log.all('invocation-started')).toHaveLength(count);
    await retainConsultationExample(fixture, 'interrupted-before-answer');
  });
  test('C10: controlled nested idle holds preserve both waits, absolute deadline still stops them, listeners and holds release', async () => {
    const reached = deferred(); const wait = deferred(); let globalRuntime!: SessionDriverRuntime;
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool !== 'answer_architect_consultation' ? [ask(), { kind: 'submit', input: {} }]
      : input.task.role === 'local-architect' ? [ask('Global wait', 'inner'), answer()]
        : [{ kind: 'await', until: () => { reached.resolve(); return wait.promise; } }, answer()], base => ({ dispatch: (input, runtime) => {
          if (input.task.role === 'global-fork' && input.task.submissionTool === 'answer_architect_consultation') globalRuntime = runtime;
          return base.dispatch(input, runtime);
        } }));
    fixture.run.invocationLimits = { ...fixture.run.policy.limits, invocationIdleMs: 10, invocationAbsoluteMs: 100 };
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const originalHold = InvocationBounds.prototype.hold; const released: string[] = [];
    const holds = vi.spyOn(InvocationBounds.prototype, 'hold').mockImplementation(function(this: InvocationBounds, timeoutMs) {
      const release = originalHold.call(this, timeoutMs); return () => { released.push('released'); release(); };
    });
    const add = vi.spyOn(AbortSignal.prototype, 'addEventListener'); const remove = vi.spyOn(AbortSignal.prototype, 'removeEventListener');
    const controller = new AbortController();
    const active = fixture.caller('engineer', fixture.seeds['local-architect']!, fixture.seeds['global-fork']!, { signal: controller.signal });
    await reached.promise; expect(holds).toHaveBeenCalledTimes(2);
    for (let tick = 0; tick < 19; tick++) {
      await vi.advanceTimersByTimeAsync(5);
      globalRuntime.onEvent({ type: 'tool-started', callId: `read-${tick}`, tool: 'read', input: {}, action: { kind: 'read', path: 'facts', range: null }, mutating: false });
      globalRuntime.onEvent({ type: 'tool-finished', callId: `read-${tick}`, tool: 'read', isError: false, reachedTool: true });
    }
    expect(fixture.run.live.size).toBe(3); expect(released).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(5);
    const caller = await active; wait.resolve();
    expect(caller.interruption).toBe('absolute-timeout'); expect(fixture.run.live.size).toBe(0); expect(released).toHaveLength(2);
    const stopListeners = add.mock.calls.filter(([event, listener]) => event === 'abort' && typeof listener === 'function' && listener.name === 'stop');
    expect(stopListeners).toHaveLength(3);
    for (const [, listener] of stopListeners) expect(remove.mock.calls.some(([event, removed]) => event === 'abort' && removed === listener)).toBe(true);
    holds.mockRestore(); add.mockRestore(); remove.mockRestore(); vi.useRealTimers();
    await retainConsultationExample(fixture, 'absolute-bound');
  });
  test('C11: interruption after answer acceptance and effect completion preserves unknown caller delivery on neutral replay', async () => {
    const accepted = deferred(); const wait = deferred(); const controller = new AbortController();
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool === 'answer_architect_consultation' ? [answer('Accepted before transport interruption')] : [], base => ({
      dispatch: async (input, runtime) => {
        if (input.task.role !== 'engineer') return base.dispatch(input, runtime);
        const result = await runtime.callTool('accepted', 'consult_architect', { message: 'Question before transport interruption' });
        expect(result.text).toBe('Accepted before transport interruption'); accepted.resolve();
        await new Promise<void>(resolve => runtime.signal.addEventListener('abort', () => resolve(), { once: true }));
        return { kind: 'stopped' };
      },
    }));
    const active = fixture.caller('engineer', fixture.seeds['local-architect']!, null, { signal: controller.signal });
    await accepted.promise; controller.abort(); const caller = await active; wait.resolve();
    expect(consultationOutcome(fixture.run.log, consultationId(caller.id, 'accepted'))).toMatchObject({ status: 'answered', accepted: { answer: { text: 'Accepted before transport interruption' } }, delivery: 'unknown', result: null });
    const effect = await fixture.store.read('R', `operation:${caller.id}`);
    expect(effect?.body['effects']).toMatchObject([{ callId: 'accepted', phase: 'completed', result: { text: 'Accepted before transport interruption' } }]);
    const retried = await fixture.operations.retry({ runId: 'R', operationId: caller.id, bindings: fixture.bindings.get(caller.id)! });
    expect((await retried.receipt).status).toBe('stopped'); await retried.settled();
    expect(fixture.run.log.all('consultation-started')).toHaveLength(1);
    expect(fixture.seen.filter(input => input.task.submissionTool === 'answer_architect_consultation')).toHaveLength(1);
    await retainConsultationExample(fixture, 'accepted-undelivered');
  });
  test('C10/C11: accepted fork answer remains known when cancellation interrupts before child outcome delivery', async () => {
    const accepted = deferred(); const controller = new AbortController();
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool === 'answer_architect_consultation' ? [] : [ask(), { kind: 'submit', input: {} }], base => ({
      dispatch: async (input, runtime) => {
        if (input.task.submissionTool !== 'answer_architect_consultation') return base.dispatch(input, runtime);
        expect((await runtime.submit('answer-before-stop', { answer: 'Fork accepted before cancellation' })).accepted).toBe(true);
        accepted.resolve();
        await new Promise<void>(resolve => runtime.signal.addEventListener('abort', () => resolve(), { once: true }));
        return { kind: 'stopped' };
      },
    }));
    const active = fixture.caller('engineer', fixture.seeds['local-architect']!, null, { signal: controller.signal });
    await accepted.promise; controller.abort(); const caller = await active;
    expect(caller.ended).toBe('stopped');
    expect(consultationOutcome(fixture.run.log, consultationId(caller.id, 'ask'))).toMatchObject({ status: 'cancelled',
      accepted: { answer: { text: 'Fork accepted before cancellation' } }, delivery: 'unknown', result: null });
    expect(fixture.run.log.all('consultation-started')).toHaveLength(1);
    await retainConsultationExample(fixture, 'accepted-before-cancellation');
  });
  test('C05/C11: simultaneous same-name calls retain actual neutral call IDs and replay one completed effect', async () => {
    let responses: { text: string }[] = [];
    const fixture = await consultationFixture(cleanup, input => input.task.submissionTool === 'answer_architect_consultation' ? [answer(input.task.message.includes('Left question') ? 'Left answer' : 'Right answer')] : [], base => ({
      dispatch: async (input, runtime) => {
        if (input.task.role !== 'engineer') return base.dispatch(input, runtime);
        const send = (callId: string, message: string) => {
          const description = runtime.describeTool('consult_architect', { message });
          runtime.onEvent({ type: 'tool-started', callId, tool: 'consult_architect', input: { message }, ...description });
          return runtime.callTool(callId, 'consult_architect', { message });
        };
        // Both start events arrive before either neutral effect's queued store work finishes.
        responses = await Promise.all([send('left', 'Left question'), send('right', 'Right question')]);
        responses.push(await send('left', 'Left question'));
        const verdict = await runtime.submit('done', {}); expect(verdict.accepted).toBe(true);
        return { kind: 'submitted', input: {} };
      },
    }));
    const caller = await fixture.caller('engineer', fixture.seeds['local-architect']!);
    expect(caller.ended, caller.error).toBe('submitted');
    expect(responses).toEqual([{ text: 'Left answer' }, { text: 'Right answer' }, { text: 'Left answer' }]);
    expect(fixture.run.log.all('consultation-started').map(event => event.data.toolCall).sort()).toEqual(['left', 'right']);
    expect(fixture.run.log.all('consultation-finished')).toHaveLength(2);
    expect(fixture.run.log.all('invocation-started').filter(event => event.data.role === 'local-architect')).toHaveLength(3);
    // This custom transport deliberately emitted no display result: acceptance proves no delivery.
    for (const id of ['left', 'right']) expect(consultationOutcome(fixture.run.log, consultationId(caller.id, id))).toMatchObject({ status: 'answered', delivery: 'unknown', result: null });
  });
});
