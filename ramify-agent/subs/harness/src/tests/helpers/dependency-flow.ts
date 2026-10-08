import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { Script } from '../../../subs/agent/src/scripted.js';
import { gitService } from '../../../subs/evidence/src/git.js';
import { checkCommand } from '../../checks/records.js';
import { testReviewPolicy } from './candidates.js';
import { commitCapabilityTransition } from '../../capability/ledger.js';
import { committedRecords, refOf } from '../../work/committed.js';
import { replayCapabilityState } from '../../capability/state.js';
import { capabilityLayout } from '../../capability/records.js';
import { RunLog } from '../../run/log.js';
import { runLayout } from '../../run/records.js';
import { copyCapabilityFixture, openCapabilityRuns } from './capability.js';
import { analysis, entry } from './analysis.js';
import { assign, edit, installMiniRunner, outline, submit, treeInputs, write } from './iterations.js';
import { freeze, initRepository, runEventsOnDisk, runPath, staleCrashLock, startRun, stopRun, testPolicy, until } from './runs.js';
import { decision, forkDecision, forkPartial } from './placement.js';
import { localCommandAudit } from './direct-check-execution.js';

import { dependencyBoundaries } from './dependency-boundaries.js';

async function completionGateDiagnostic(root: string, runId: string): Promise<unknown> {
  const path = join(root, 'plans', 'need', '.harness', 'jobs', runId, 'gates', 'ga-0004', 'attempt.json');
  return readFile(path, 'utf8').then(JSON.parse, error => ({ unavailable: String(error) }));
}

export async function runDependencyScheduling(): Promise<void> {

  const fixture = await copyCapabilityFixture(true);
  const cleanups: Array<() => Promise<void>> = [fixture.remove];
  let flowError: unknown;
  try {
    const boundaries = dependencyBoundaries(fixture.root, 'scheduling');
    cleanups.push(async () => boundaries.assertComplete());
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    const c = 'capability-coordination/c';
    let engineerTurns = 0;
    let parentTurns = 0;
    let childTurns = 0;
    let childReturned = false;
    let resumedBPrompt = '';
    let resumedScratchObserved = '';
    let sourceCaptures = 0;
    let closing: Promise<void> | undefined;
    let closeFirst: (() => Promise<void>) | undefined;
    const starts: string[] = [];
    const script: Script = spec => {
      starts.push(`${spec.role}:${spec.submission.name}:${spec.session.mode}`);
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2],
          provider: ids[1] === 'need-001' ? b : c, placementReason: 'Source owner supplies its own behavior',
          constraints: [], requirementRefs: [] });
      }
      if (spec.role === 'engineer') {
        engineerTurns += 1;
        if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
          need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
        } });
        if (engineerTurns === 2) { boundaries.stage('parent'); return submit({ kind: 'capability-needed', summary: 'B needs C normalization', request: {
          need: 'Normalize source in C for B', usage: [{ path: 'subs/b/src/fact.ts', use: 'Normalize B source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'normalizes source', code: 'expect(normalizeSource("B")).toBe("B")', designation: 'pseudocode' }],
          suggestedProvider: { module: c, reason: 'C owns normalization' },
        } }, edit('fact.ts', "return 'old';", "return 'old from C';"), write('tmp/parent.txt', 'parent scratch\n')); }
        if (!childReturned) throw new Error('B resumed before child handback');
        resumedBPrompt = spec.prompt;
        return submit({ kind: 'completion-proposed', summary: 'B completed its original assignment after C returned', findings: [] },
          edit('tmp/parent.txt', 'parent scratch', 'resumed parent scratch'));
      }
      if (spec.role === 'capability-architect') {
        if (spec.submission.name !== 'submit_capability_action') throw new Error('Unexpected child action');
        const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
        if (basis.task === 'cap-001') {
          parentTurns += 1;
          if (parentTurns > 1) {
            if (!childReturned) throw new Error('Parent resumed while child was active');
            return [{ kind: 'wait', ms: 60_000 }];
          }
          return submit({ ...basis, kind: 'assign', assignment: assign(b, { goal: 'Provide source', approach: 'Read C source', completionEvidence: 'B returns source' }).assignment });
        }
        childTurns += 1;
        return childTurns === 1 ? submit({ ...basis, kind: 'partial', progress: 'C source inspected',
          unfinished: ['Implement C and verify B'] }) : [{ kind: 'wait', ms: 60_000 }];
      }
      return [];
    };
    const options = { ...boundaries.options, script, inputs: treeInputs(),
      afterWrite: async (write: string) => {
        if (write === 'capability-source-captured' && ++sourceCaptures === 2) closing = closeFirst?.();
        if (write === 'invocation-ended' && childReturned && engineerTurns >= 3 && resumedScratchObserved === '') {
          resumedScratchObserved = await readFile(join(fixture.root, 'subs/b/src/tmp/parent.txt'), 'utf8');
        }
      } };
    const first = await openCapabilityRuns(fixture.root, options);
    closeFirst = () => first.service.close();
    const receipt = await first.service.execute(startRun('need'));
    await until(() => closing !== undefined, 30_000);
    await closing;
    const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(before.filter(event => event.type === 'capability-requested')).toHaveLength(1);
    expect(before.filter(event => event.type === 'capability-delegated')).toHaveLength(1);
    const opened = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => opened.service.close());
    await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-delegated' && event.data.task === 'cap-002') ||
      (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(events.filter(event => event.type === 'job-failed')).toHaveLength(0);
    expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(2);
    expect(events.filter(event => event.type === 'capability-requested')).toHaveLength(2);
    expect(replayCapabilityState(events).stack).toEqual(['wi-001', 'cap-001', 'cap-002']);
    expect(replayCapabilityState(events).tasks.get('cap-001')?.activeAssignment).toBe('cap-001.i01');
    expect(events.filter(event => event.type === 'capability-assignment-settled')).toHaveLength(0);
    expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
    expect(starts).toContain('capability-architect:submit_capability_action:fresh');
    expect(starts).toContain('capability-architect:submit_capability_qualification:fresh');
    await opened.service.close();
    // A synthetic accepted child record isolates dispatch restoration. Real
    // gate and semantic handback acceptance is exercised separately.
    const log = await RunLog.open(join(fixture.root, 'plans/need/.harness/jobs', receipt.jobId, 'events.jsonl'), receipt.jobId);
    const committed = committedRecords(log.ledger.replay());
    const child = committed.capabilityTasks.get('cap-002')!;
    const request = committed.capabilityRequests.get(child.request)!;
    const priorPlan = committed.capabilityPlans.get(child.id)!.at(-1)!;
    const basis = replayCapabilityState(log.events).tasks.get(child.id)!.coordinatorInvocation!;
    const revised = { ...priorPlan, revision: 2, basedOn: 1, updatedBy: basis,
      revisionReason: 'Synthetic accepted child projection for requester dispatch',
      useCases: priorPlan.useCases.map(useCase => ({ ...useCase, expectedBehavior: 'B shows the C normalized source' })) };
    await commitCapabilityTransition(log, { type: 'capability-plan-revised', data: {
      task: child.id, basedOn: 1, revision: 2, invocation: basis,
    } }, [{ path: capabilityLayout.plan(child.id, 2), id: child.id, revision: 2, body: revised }]);
    await commitCapabilityTransition(log, { type: 'capability-verification-started', data: { task: child.id, invocation: basis } }, []);
    const handback = { schema: 'ramify-agent.capability-handback/1' as const, task: child.id, request: request.id,
      plan: refOf(child.id, 2, revised), sourceRevision: 'projection-source', returnedTree: child.source.tree,
      deltaFromSuspension: [], summary: 'C normalization returned to B',
      interfaces: [{ path: 'subs/c/src/source.ts', symbols: ['normalizeSource'], use: 'B normalizes the source' }],
      compatibility: [], checks: [refOf('projection-gate', 1, { kind: 'projection' })], reviews: [], limitations: [] };
    await commitCapabilityTransition(log, { type: 'capability-handed-back', data: {
      task: child.id, handback: child.id, invocation: basis,
    } }, [{ path: capabilityLayout.handback(child.id), id: child.id, revision: 1, body: handback }]);
    childReturned = true;
    const resumed = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => resumed.service.close());
    await until(() => (resumed.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01') ||
      (resumed.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
    const returnedEvents = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(returnedEvents.filter(event => event.type === 'job-failed'), JSON.stringify(returnedEvents.slice(-12))).toHaveLength(0);
    expect(returnedEvents.filter(event => event.type === 'capability-assigned' && event.data.task === 'cap-001')).toHaveLength(1);
    expect(returnedEvents.filter(event => event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01')).toHaveLength(1);
    expect(resumedBPrompt).toContain('Nested capability cap-002 handed back');
    expect(resumedBPrompt).toContain('Continue cap-001.i01');
    expect(resumedScratchObserved).toBe('resumed parent scratch\n');
    await expect(readFile(join(fixture.root, 'subs/b/src/tmp/parent.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = resumed.service.events('need', receipt.jobId)!;
      try { await resumed.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
      catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
    }
    await resumed.service.settled('need', receipt.jobId);
  } catch (error) { flowError = error; } finally {
    const failures: unknown[] = flowError === undefined ? [] : [flowError];
    for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
    if (failures.length > 0) throw new AggregateError(failures, failures.map(String).join('\n'));
  }
}

export async function runDependencyDecision(boundary: 'request-placement' | 'unresolved', restartBoundary: 'none' | 'placement-intent' | 'fork-accepted' | 'fork-partial' | 'qualification-accepted'): Promise<void> {

  const fixture = await copyCapabilityFixture(true);
  const cleanups: Array<() => Promise<void>> = [fixture.remove];
  let flowError: unknown;
  try {
    const boundaries = dependencyBoundaries(fixture.root, 'decision');
    cleanups.push(async () => boundaries.assertComplete());
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    const c = 'capability-coordination/c';
    let engineerTurns = 0;
    let parentTurns = 0;
    let nestedTurns = 0;
    let boundaryReturned = false;
    let frozen = false;
    let forkTurns = 0;
    const forkPrompts: string[] = [];
    const script: Script = spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        if (ids[1] === 'need-002') {
          nestedTurns += 1;
          if (nestedTurns === 1) return submit({ kind: boundary, request: ids[1], invocation: ids[2],
            problem: 'C ownership needs a wider decision', evidence: ['C owns source normalization'] });
          boundaryReturned = spec.prompt.includes('# Boundary decision');
        }
        return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2],
          provider: ids[1] === 'need-001' ? b : c, placementReason: 'Source owner supplies its behavior',
          constraints: [], requirementRefs: [] });
      }
      if (spec.role === 'global-fork') {
        forkTurns += 1;
        forkPrompts.push(spec.prompt);
        if (restartBoundary === 'fork-partial' && forkTurns === 1) return submit(forkPartial(
          ['C contract evidence is incomplete'], ['Inspect B use before deciding']));
        return submit(forkDecision({ decision: decision({
        question: 'Where should normalization live?', outcome: 'reuse', capability: 'b-entry',
        owner: b, rationale: 'B keeps the source responsibility and delegates normalization to C.',
        evidence: { citations: [{ module: b }], gaps: [] },
        }), brief: 'B keeps the source responsibility and may delegate C normalization.' }));
      }
      if (spec.role === 'engineer') {
        engineerTurns += 1;
        if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
          need: 'B fact for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
        } });
        return submit({ kind: 'capability-needed', summary: 'B needs C normalization', request: {
          need: 'Normalize source in C for B', usage: [{ path: 'subs/b/src/fact.ts', use: 'Normalize source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'normalizes source', code: 'expect(normalizeSource("B")).toBe("B")', designation: 'pseudocode' }],
          suggestedProvider: { module: c, reason: 'C owns normalization' },
        } });
      }
      if (spec.role === 'capability-architect') {
        const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        if (ids[1] === 'cap-001' && parentTurns++ === 0) return submit({ kind: 'assign', task: ids[1],
          planRevision: Number(ids[2]), invocation: ids[3], assignment: assign(b, { goal: 'Provide B source', approach: 'Read C source', completionEvidence: 'B returns source' }).assignment });
        return [{ kind: 'wait', ms: 60_000 }];
      }
      return [];
    };
    const options = { ...boundaries.options, script, inputs: treeInputs(),
      afterWrite: async (write: string, runId: string) => {
        if (frozen) return;
        if (restartBoundary === 'placement-intent' && write === 'placement-requested') { frozen = true; await freeze(); }
        if (restartBoundary === 'fork-partial' && write === 'fork-returned-partial') { frozen = true; await freeze(); }
        if (restartBoundary === 'fork-accepted' && write === 'invocation-ended') {
          const events = await runEventsOnDisk(fixture.root, 'need', runId);
          const ended = events.at(-1);
          if (ended?.type === 'invocation-ended' && events.some(started => started.type === 'invocation-started' &&
            started.data.invocation === ended.data.invocation && started.data.role === 'global-fork')) {
            frozen = true;
            await freeze();
          }
        }
        if (restartBoundary === 'qualification-accepted' && write === 'invocation-ended' && nestedTurns === 2) {
          const events = await runEventsOnDisk(fixture.root, 'need', runId);
          const ended = events.at(-1);
          if (ended?.type === 'invocation-ended' && events.some(started => started.type === 'invocation-started' &&
            started.data.invocation === ended.data.invocation && started.data.role === 'capability-architect' &&
            started.data.work.capabilityTask === 'cap-001' && started.data.work.request === 'need-002')) {
            frozen = true;
            await freeze();
          }
        }
      } };
    const first = await openCapabilityRuns(fixture.root, options);
    const receipt = await first.service.execute(startRun('need'));
    let opened = first;
    if (restartBoundary !== 'none') {
      await until(() => frozen, 30_000);
      await staleCrashLock(fixture.root);
      opened = await openCapabilityRuns(fixture.root, options);
    }
    cleanups.push(() => opened.service.close());
    await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-delegated' && event.data.task === 'cap-002') ||
      (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 30_000);
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(events.filter(event => event.type === 'job-failed'), JSON.stringify(events.slice(-12))).toHaveLength(0);
    expect(events.filter(event => event.type === boundary.replace('request-', '') + '-requested')).toHaveLength(1);
    expect(events.filter(event => event.type === 'decision-accepted')).toHaveLength(1);
    expect(events.filter(event => event.type === 'capability-delegated')).toHaveLength(2);
    expect(nestedTurns).toBe(2);
    expect(boundaryReturned).toBe(true);
    if (restartBoundary === 'fork-partial') {
      expect(events.filter(event => event.type === 'fork-returned-partial')).toHaveLength(1);
      expect(forkPrompts[1]).toContain('C contract evidence is incomplete');
    }
    expect(replayCapabilityState(events).stack).toEqual(['wi-001', 'cap-001', 'cap-002']);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = opened.service.events('need', receipt.jobId)!;
      try { await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
      catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
    }
    await opened.service.settled('need', receipt.jobId);
  } catch (error) { flowError = error; } finally {
    const failures: unknown[] = flowError === undefined ? [] : [flowError];
    for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
    if (failures.length > 0) throw new AggregateError(failures, failures.map(String).join('\n'));
  }
}

export async function runDependencyGate(restartAfterHandback: boolean, realBoundary = false): Promise<void> {

  const fixture = await copyCapabilityFixture(true);
  const cleanups: Array<() => Promise<void>> = [fixture.remove];
  let flowError: unknown;
  try {
    await mkdir(join(fixture.root, 'subs/c/src/tests'), { recursive: true });
    await writeFile(join(fixture.root, 'subs/c/src/tests/source.test.ts'),
      "import { expect, test } from 'vitest';\nimport { normalizeSource } from '../source.js';\ntest('C normalizes source', () => expect(normalizeSource(' b ')).toBe('b'));\n");
    const boundaries = realBoundary ? undefined : dependencyBoundaries(fixture.root, 'gate');
    if (boundaries) cleanups.push(async () => boundaries.assertComplete());
    if (realBoundary) {
    await initRepository(fixture.root);
    await installMiniRunner(fixture.root);
    await rm(join(fixture.root, 'node_modules/vitest'), { recursive: true, force: true });
    await rm(join(fixture.root, 'node_modules/.bin/vitest'), { force: true });
    await symlink(join(process.cwd(), 'node_modules/vitest'), join(fixture.root, 'node_modules/vitest'));
    await symlink(join(process.cwd(), 'node_modules/.bin/vitest'), join(fixture.root, 'node_modules/.bin/vitest'));
    }
    const a = 'capability-coordination/a';
    const b = 'capability-coordination/b';
    const c = 'capability-coordination/c';
    let engineerTurns = 0;
    let childTurns = 0;
    let parentTurns = 0;
    let returnedPrompt = '';
    let childClosureScratch: { parent: string; childRemoved: boolean } | null = null;
    let frozenHandback = false;
    let service: Awaited<ReturnType<typeof openCapabilityRuns>>['service'] | undefined;
    const script: Script = spec => {
      if (spec.role === 'initial-architect') return submit(analysis([entry('a-reads-b', a), entry('b-entry', b)]));
      if (spec.submission.name === 'submit_work_item_result') return submit(assign(a, {}, outline()));
      if (spec.submission.name === 'submit_capability_qualification') {
        const ids = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        return submit({ kind: 'delegate-capability', request: ids[1], invocation: ids[2],
          provider: ids[1] === 'need-001' ? b : c, placementReason: 'Source owner supplies its behavior',
          constraints: [], requirementRefs: [] });
      }
      if (spec.role === 'engineer') {
        engineerTurns += 1;
        if (engineerTurns === 1) return submit({ kind: 'capability-needed', summary: 'A needs B source', request: {
          need: 'B fact with source for A', usage: [{ path: 'subs/a/src/caller.ts', use: 'Display source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'source shown', code: 'expect(renderA()).toContain("B")', designation: 'pseudocode' }],
        } });
        // B's work in flight keeps B's own test passing: every gate's audit,
        // C's included, judges the whole candidate, B's edits with it.
        if (engineerTurns === 2) { boundaries?.stage('parent'); return submit({ kind: 'capability-needed', summary: 'B needs C normalization', request: {
          need: 'Normalize source in C for B', usage: [{ path: 'subs/b/src/fact.ts', use: 'Normalize B source', prospective: false }],
          constraints: [], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'normalizes source', code: "expect(readFact()).toBe('B')", designation: 'pseudocode' }],
          suggestedProvider: { module: c, reason: 'C owns normalization' },
        } }, edit('fact.ts', "return 'old';", "return 'old'; /* until C normalizes it */"), write('tmp/parent.txt', 'parent scratch\n')); }
        if (spec.prompt.includes('# Iteration cap-002.i01')) { boundaries?.stage('child'); return submit({
          kind: 'completion-proposed', summary: 'C normalizes the source', findings: [],
        }, write('tmp/child.txt', 'child scratch\n'), write('source.ts', 'export function normalizeSource(value: string): string { return value.trim().toUpperCase(); }\n'),
        write('tests/source.test.ts', "import { expect, test } from 'vitest';\nimport { normalizeSource } from '../source.js';\ntest('C normalizes source', () => expect(normalizeSource(' b ')).toBe('B'));\n")); }
        if (spec.prompt.includes('# Iteration cap-002.i02')) { boundaries?.stage('integrated'); return submit({
          kind: 'completion-proposed', summary: 'B uses the real C normalizer', findings: [],
        }, write('fact.ts', "import { normalizeSource } from '../../c/src/source.js';\nexport function readFact(): string { return normalizeSource(' b '); }\n"),
        write('tests/fact.test.ts', "import { expect, test } from 'vitest';\nimport { readFact } from '../fact.js';\ntest('B uses C normalized source', () => expect(readFact()).toBe('B'));\n")); }
        if (spec.prompt.includes('Nested capability cap-002 handed back') || spec.prompt.includes('Capability cap-002 accepted at')) {
          returnedPrompt = spec.prompt;
          return submit({ kind: 'completion-proposed', summary: 'B completed the original source assignment', findings: [] });
        }
        throw new Error(`Unexpected engineer turn ${engineerTurns}: ${spec.prompt.slice(0, 300)}`);
      }
      if (spec.role === 'capability-architect') {
        const ids = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
        const basis = { task: ids[1], planRevision: Number(ids[2]), invocation: ids[3] };
        if (basis.task === 'cap-001') {
          parentTurns += 1;
          return parentTurns > 1 ? [{ kind: 'wait', ms: 60_000 }]
            : submit({ ...basis, kind: 'assign', assignment: assign(b, { goal: 'Provide B source', approach: 'Use C normalization', completionEvidence: 'B returns C normalized source' }).assignment });
        }
        childTurns += 1;
        if (childTurns === 1) return submit({ ...basis, kind: 'assign', assignment: assign(c, { goal: 'Normalize source', approach: 'Implement and test C behavior', completionEvidence: 'C test passes' }).assignment });
        if (childTurns === 2) return submit({ ...basis, kind: 'assign', assignment: assign(b, { goal: 'Use normalized source in B', approach: 'Call real C from B', completionEvidence: 'B test passes' }).assignment });
        if (childTurns !== 3) throw new Error('Unexpected child coordinator turn');
        // A handback request without the done report on cap-002 is a
        // rejected submission naming it, before any gate; the same turn
        // reports it. The child's handback is its own done report on
        // cap-002; the example is the request's context, remarked on in
        // the summary.
        return [...submit({ ...basis, kind: 'request-handback', summary: 'C normalization is used by B',
          interfaces: [{ path: 'subs/c/src/source.ts', symbols: ['normalizeSource'], use: 'Call from B' }], limitations: [] }),
        { kind: 'tool', tool: 'update_capability_plan', input: { task: basis.task,
          basedOn: basis.planRevision, invocation: basis.invocation, reason: 'The real B caller states the original case',
          changes: { useCases: [{ id: 'need-002.ex01', expectedBehavior: 'B uses normalized C source', derivedFrom: ['need-002.ex01'] }] } } },
          { kind: 'submit', input: { ...basis, planRevision: basis.planRevision + 1, kind: 'request-handback',
            summary: 'C normalization is used by B; the original example now reads B',
            reports: [{ id: basis.task, judgment: 'done', basedOnRevision: 0 }],
            interfaces: [{ path: 'subs/c/src/source.ts', symbols: ['normalizeSource'], use: 'Call from B' }], limitations: [] } }];
      }
      if (spec.role === 'reviewer') {
        const paths = /Changed paths: ([^\n]+)/u.exec(spec.prompt)?.[1]?.split(', ') ?? [];
        return [...paths.map(path => ({ kind: 'tool' as const, tool: 'snapshot_diff', input: { path } })),
          { kind: 'submit', input: { inspected: paths, missing: [], concerns: [] } }];
      }
      return [];
    };
    const options = { ...(boundaries?.options ?? { git: gitService }), script, inputs: treeInputs(),
      // The boundary witness runs actual B/C tests and type checking; ordinary
      // rows receive labelled synthetic configured-audit answers.
      configuredAudit: boundaries?.options.configuredAudit ?? localCommandAudit({
        tests: [join(fixture.root, 'node_modules/.bin/vitest'), 'run', 'subs/b/src/tests/fact.test.ts', 'subs/c/src/tests/source.test.ts'],
        'type-check': [join(process.cwd(), 'node_modules/.bin/tsc'), '--noEmit', '-p', 'tsconfig.json'],
      }),
      afterWrite: async (event: string, runId: string) => {
        const last = service?.events('need', runId)?.at(-1);
        if (event === 'capability-assignment-settled' && childClosureScratch === null &&
          last?.type === 'capability-assignment-settled' && last.data.assignment === 'cap-002.i01') {
          childClosureScratch = {
            parent: await readFile(join(fixture.root, 'subs/b/src/tmp/parent.txt'), 'utf8'),
            childRemoved: await readFile(join(fixture.root, 'subs/c/src/tmp/child.txt')).then(() => false, () => true),
          };
        }
        if (restartAfterHandback && event === 'capability-handed-back' && !frozenHandback &&
          service?.events('need', runId)?.at(-1)?.type === 'capability-handed-back') {
          frozenHandback = true;
          await freeze();
        }
      },
      policy: (root: string) => {
        const base = testPolicy(root);
        return { ...base, reviews: testReviewPolicy({ kinds: ['code'], concurrency: 1, settleMs: 120_000 }), commands: { ...base.commands,
          typeCheck: checkCommand({ argv: [join(process.cwd(), 'node_modules/.bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], cwd: root, timeoutMs: 30_000 }),
        } };
      } } satisfies Parameters<typeof openCapabilityRuns>[1];
    let opened = await openCapabilityRuns(fixture.root, options);
    service = opened.service;
    const receipt = await opened.service.execute(startRun('need'));
    if (restartAfterHandback) {
      await until(() => frozenHandback, 120_000);
      const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
      expect(before.filter(event => event.type === 'capability-handed-back' && event.data.task === 'cap-002')).toHaveLength(1);
      expect(before.filter(event => event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01')).toHaveLength(0);
      await staleCrashLock(fixture.root);
      opened = await openCapabilityRuns(fixture.root, options);
      service = opened.service;
    }
    cleanups.push(() => opened.service.close());
    await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01') ||
      (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 120_000)
      .catch(async error => { throw new Error(`${String(error)}; completion gate: ${JSON.stringify(await completionGateDiagnostic(fixture.root, receipt.jobId))}`); });
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(events.filter(event => event.type === 'job-failed'), JSON.stringify({ events: events.slice(-18),
      gate: await completionGateDiagnostic(fixture.root, receipt.jobId) })).toHaveLength(0);
    expect(childClosureScratch).toEqual({ parent: 'parent scratch\n', childRemoved: true });
    await expect(readFile(join(fixture.root, 'subs/b/src/tmp/parent.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(events.filter(event => event.type === 'capability-handed-back' && event.data.task === 'cap-002')).toHaveLength(1);
    // PB3-C01 PB3-D08: the request without a report was a rejected
    // submission naming cap-002, and the same turn reported it; no gate
    // ran while that turn lasted.
    const childStarts = events.flatMap(event => event.type === 'invocation-started' && event.data.role === 'capability-architect' &&
      event.data.work.capabilityTask === 'cap-002' ? [event] : []);
    expect(childStarts).toHaveLength(3);
    const handing = childStarts[2]!.data.invocation;
    const rejections = (await readFile(runPath(fixture.root, 'need', receipt.jobId, runLayout.observations(handing)), 'utf8'))
      .split('\n').filter(Boolean).map(line => JSON.parse(line) as { type: string; data: { errors?: Array<{ path: string; message: string }> } })
      .filter(line => line.type === 'rejection');
    expect(rejections.map(line => line.data.errors)).toEqual([[{ path: 'reports',
      message: expect.stringContaining('This handback request leaves cap-002 without a done report.') }]]);
    const ended = events.find(event => event.type === 'invocation-ended' && event.data.invocation === handing)!;
    expect(events.filter(event => event.type === 'gate-committing' &&
      event.sequence > childStarts[2]!.sequence && event.sequence < ended.sequence)).toHaveLength(0);
    // PB3-D10: the child's done report returned cap-002 and nothing else.
    // The parent task's outcome stays its own architect's to report, while
    // its original B assignment continues.
    expect(events.flatMap(event => event.type === 'obligation-reported' ? [[event.data.id, event.data.judgment]] : [])).toEqual([['cap-002', 'done']]);
    const originalSettlement = events.filter(event => event.type === 'capability-assignment-settled' && event.data.assignment === 'cap-001.i01');
    expect(originalSettlement).toHaveLength(1);
    expect(originalSettlement[0]).toMatchObject({ data: { outcome: 'accepted' } });
    expect(events.filter(event => event.type === 'work-item-started' && event.data.workItem === 'wi-002')).toHaveLength(0);
    expect(returnedPrompt, JSON.stringify({ engineerTurns, events: events.slice(-30).map(event => ({ type: event.type, data: event.data })) })).toMatch(/(?:Nested capability cap-002 handed back|Capability cap-002 accepted at)/u);
    const passed = events.filter(event => event.type === 'gate-attempted' && event.data.verdict === 'passed');
    expect(passed.length).toBeGreaterThan(0);
    expect(events.filter(event => event.type === 'review-request-recorded' && event.data.workItem === 'cap-002').length,
      JSON.stringify(events.filter(event => event.type === 'review-request-recorded' || event.type === 'iteration-closed' || event.type === 'capability-handed-back'))).toBeGreaterThan(0);
    expect(events.filter(event => event.type === 'capability-review-recorded')).toHaveLength(0);
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const current = opened.service.events('need', receipt.jobId)!;
      try { await opened.service.execute(stopRun('need', receipt.jobId, current.at(-1)!.sequence)); break; }
      catch (error) { if (!String(error).includes('at version') || attempt === 19) throw error; }
    }
    await opened.service.settled('need', receipt.jobId);
  } catch (error) { flowError = error; } finally {
    const failures: unknown[] = flowError === undefined ? [] : [flowError];
    for (const cleanup of cleanups.reverse()) { try { await cleanup(); } catch (error) { failures.push(error); } }
    if (failures.length > 0) throw new AggregateError(failures, failures.map(String).join('\n'));
  }
}
