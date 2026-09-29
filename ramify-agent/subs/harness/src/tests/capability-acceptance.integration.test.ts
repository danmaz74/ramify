import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, test } from 'vitest';
import type { Script } from '../../subs/agent/src/scripted.js';
import { gitService } from '../../subs/evidence/src/git.js';
import { checkCommand } from '../checks/records.js';
import { createLocalCommandCheckExecution, createMappedCheckExecution } from './helpers/direct-check-execution.js';
import { analysis, entry, requestCompletion } from './helpers/analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './helpers/capability.js';
import { assign, edit, installMiniRunner, outline, submit, treeInputs, write } from './helpers/iterations.js';
import { directReadinessExecution } from './helpers/external-tools.js';
import { freeze, initRepository, runEventsOnDisk, runPath, staleCrashLock, startRun, stopRun, testPolicy, until } from './helpers/runs.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); });
const a = 'capability-coordination/a';
const b = 'capability-coordination/b';
const d = 'capability-coordination/d';
const p = 'capability-coordination';

async function runAcceptedHandback(mode: 'revision' | 'deferred' | 'drift' | 'restart' | 'verify-restart' |
  'gate-restart' | 'gate-intent-restart' | 'gate-committing-restart' |
  'review-restart' | 'review-submission-restart' | 'repair-exhaustion'): Promise<void> {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  await mkdir(join(fixture.root, 'subs/a/src/tests/steps'), { recursive: true });
  await writeFile(join(fixture.root, 'subs/a/src/tests/steps/capability.steps.js'), [
    "import assert from 'node:assert/strict';",
    "import { execFileSync } from 'node:child_process';",
    "import { Given, When, Then } from '@cucumber/cucumber';",
    "Given('the project as the plan finds it', function () {});",
    "When('the person uses richer-a-fact', function () { this.result = execFileSync('./node_modules/.bin/vitest', ['run', 'subs/a/src/tests/caller.test.ts'], { cwd: process.cwd(), encoding: 'utf8' }); });",
    "Then('the outcome richer-a-fact promises is shown', function () { assert.match(this.result, /1 passed/); });",
    '',
  ].join('\n'));
  await initRepository(fixture.root); await installMiniRunner(fixture.root);
  // Real Vitest compiles the fixture's TypeScript and resolves its .js source
  // specifiers; the small runner used by cooperation tests executes JS only.
  await rm(join(fixture.root, 'node_modules/vitest'), { recursive: true, force: true });
  await rm(join(fixture.root, 'node_modules/.bin/vitest'), { force: true });
  await symlink(join(process.cwd(), 'node_modules/vitest'), join(fixture.root, 'node_modules/vitest'));
  await symlink(join(process.cwd(), 'node_modules/.bin/vitest'), join(fixture.root, 'node_modules/.bin/vitest'));
  await rm(join(fixture.root, 'node_modules/.bin/cucumber-js'), { force: true });
  await symlink(join(process.cwd(), 'node_modules/.bin/cucumber-js'), join(fixture.root, 'node_modules/.bin/cucumber-js'));
  await mkdir(join(fixture.root, 'node_modules/@cucumber'), { recursive: true });
  await symlink(join(process.cwd(), 'node_modules/@cucumber/cucumber'), join(fixture.root, 'node_modules/@cucumber/cucumber'));
  let architect = 0;
  let reviewer = 0;
  let originalEngineer = true;
  let localTurn = 0;
  let deferredBriefing = '';
  let driftFeedback = '';
  let resuming = false;
  const scripted: Script = spec => {
    if (spec.role === 'initial-architect') return submit(analysis([entry('richer-a-fact', a), entry('b-entry', b)]));
    if (spec.submission.name === 'submit_work_item_result') {
      if (spec.prompt.includes('# Work item wi-002')) {
        deferredBriefing = spec.prompt;
        return [{ kind: 'wait', ms: 60_000 }];
      }
      return localTurn++ === 0 ? submit(assign(a, {}, outline())) : submit(requestCompletion());
    }
    if (spec.submission.name === 'submit_capability_qualification') {
      const [, request, invocation] = /Use request (need-\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      return submit({ kind: 'delegate-capability', request, invocation, provider: b,
        placementReason: 'B owns the source fact', constraints: [], requirementRefs: [] });
    }
    if (spec.role === 'engineer') {
      if (originalEngineer) {
        originalEngineer = false;
        return submit({ kind: 'capability-needed', summary: 'A has an unfinished caller', request: {
          need: 'Render a fact with its source', usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Render B fact', prospective: false }],
          constraints: ['D retains the old label'], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'shows source', code: "expect(renderA()).toBe('Fresh fact: old from B')", designation: 'pseudocode' }],
        } }, edit('caller.ts', 'Fact: ${value}', 'Fresh fact: ${value}'),
        write('extra.ts', "export const sourceHint = 'B';\n"),
        edit('tests/caller.test.ts', "toBe('Fact: old')", "toBe('unfinished')"));
      }
      const owner = /Capability assignment cap-\d+\.i\d+ in ([^\n]+)/u.exec(spec.prompt)?.[1];
      if (owner === b) return submit({ kind: 'completion-proposed', summary: 'B added the source field', findings: [] },
        write('fact.ts', "export interface FactResult { text: string; source: string }\nexport const readFact = (): FactResult => ({ text: 'old', source: 'B' });\n"),
        write('tests/fact.test.ts', "import { expect, test } from 'vitest';\nimport { readFact } from '../fact.js';\ntest('B returns the independently specified fact', () => expect(readFact()).toEqual({ text: 'old', source: 'B' }));\n"));
      if (owner === d) return submit({ kind: 'completion-proposed', summary: 'D migrated its typed use', findings: [] },
        write('consumer.ts', "import { readFact } from '../../b/src/fact.js';\nexport function legacyLabel(): string { return readFact().text.toUpperCase(); }\n"));
      if (owner === p) return submit({ kind: 'completion-proposed', summary: 'P exposed the signature companion', findings: [] },
        write('../module.ramify', 'ramify 1\nmodule capability-coordination\nexpose-sub readFact, FactResult from b to descendants\n'),
        write('assembly.ts', "import { renderA } from '../subs/a/src/caller.js';\nexport const render = () => renderA();\n"));
      if (owner === a && spec.prompt.includes('independent literal')) return submit({ kind: 'completion-proposed', summary: 'A repaired the circular oracle', findings: [] },
        write('tests/caller.test.ts', "import { expect, test } from 'vitest';\nimport { renderA } from '../caller.js';\ntest('A renders the source', () => expect(renderA()).toBe('Fresh fact: old from B'));\n"));
      if (owner === a) return submit({ kind: 'completion-proposed', summary: 'A integrated the real B result', findings: [] },
        write('caller.ts', "import { readFact } from '../../b/src/fact.js';\nexport function renderA(): string { const fact = readFact(); return `Fresh fact: ${fact.text} from ${fact.source}`; }\n"),
        write('tests/caller.test.ts', "import { expect, test } from 'vitest';\nimport { renderA } from '../caller.js';\ntest('A renders the source', () => expect(renderA()).toBe(renderA()));\n"));
      if (mode === 'restart' || mode === 'verify-restart' || mode === 'gate-restart' ||
        mode === 'gate-intent-restart' || mode === 'gate-committing-restart' ||
        mode === 'review-restart' || mode === 'review-submission-restart') return resuming
        ? submit({ kind: 'completion-proposed', summary: 'A resumed after restart with the accepted result', findings: [] })
        : [{ kind: 'wait', ms: 60_000 }];
      if (mode === 'deferred') return submit({ kind: 'completion-proposed', summary: 'A resumed with the accepted result', findings: [] });
      return submit({ kind: 'capability-needed', summary: 'A found a post-handback integration issue', request: {
        need: 'Revise the B result for A integration',
        usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Integrate the returned result', prospective: false }],
        constraints: ['Preserve D compatibility'], knownInterface: { kind: 'insufficient',
          path: 'subs/b/src/fact.ts', symbol: 'readFact', missing: 'A needs an additional provenance rule' },
        examples: [{ title: 'provenance rule', code: "expect(renderA()).toContain('B')", designation: 'pseudocode' }],
        revises: { task: 'cap-001', reason: 'A integration exposed a missing provenance rule' },
      } });
    }
    if (spec.role === 'reviewer') {
      reviewer += 1;
      if (mode === 'drift' && spec.prompt.includes('Review design for capability cap-001 against plan revision 2.')) {
        writeFileSync(join(fixture.root, 'subs/b/src/fact.ts'), `${readFileSync(join(fixture.root, 'subs/b/src/fact.ts'), 'utf8')}\n// concurrent source edit after the passing gate\n`);
      }
      const paths = /Changed paths: ([^\n]+)/u.exec(spec.prompt)?.[1]?.split(', ') ?? [];
      const concern = { summary: 'A expected value copies the implementation', consequence: 'The assertion cannot catch a wrong result',
        rationale: 'The candidate calls renderA on both sides', uncertainty: 'low', remedy: 'Use an independent literal',
        locations: [{ path: 'subs/a/src/tests/caller.test.ts', startLine: 3, endLine: 3 }], suggests: null, risk: 'medium', ground: null };
      return [...paths.map(path => ({ kind: 'tool' as const, tool: 'snapshot_diff', input: { path } })),
        { kind: 'submit', input: { inspected: paths, missing: [], concerns: reviewer === 1 ? [concern] : [] } }];
    }
    if (spec.role === 'capability-architect') {
      const [, task, revision, invocation] = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      if (task === 'cap-002') return [{ kind: 'wait', ms: 60_000 }];
      architect += 1;
      if (architect > 9) {
        if (mode === 'drift') { driftFeedback = spec.prompt; return [{ kind: 'wait', ms: 60_000 }]; }
        if (mode === 'gate-restart' || mode === 'gate-intent-restart' || mode === 'gate-committing-restart' ||
          mode === 'review-restart' || mode === 'review-submission-restart') return submit({ task, planRevision: Number(revision), invocation,
          kind: 'request-handback', summary: 'B result is integrated in A and compatible with D',
          coverage: [{ case: 'need-001.ex01', evidence: ['subs/a/src/tests/caller.test.ts'] }],
          interfaces: [{ path: 'subs/b/src/fact.ts', symbols: ['readFact', 'FactResult'], use: 'Call readFact and render its source' }],
          limitations: [] });
        throw new Error(`Unexpected capability turn ${architect}: ${spec.prompt.slice(-1200)}`);
      }
      const basis = { task, planRevision: Number(revision), invocation };
      const assignOwner = (owner: string, purpose: string) => submit({ ...basis, kind: 'assign', owner,
        purpose, approach: purpose, requirementRefs: [], intendedEvidence: ['Real source and tests'] });
      if (architect === 1) return assignOwner(b, 'Add the source field');
      if (architect === 3) return assignOwner(d, 'Migrate D typed use');
      if (architect === 4) return assignOwner(p, 'Expose the companion');
      if (architect === 5) return assignOwner(a, 'Integrate A');
      if (architect === 7) return assignOwner(a, 'Repair with independent literal');
      const handback = (atRevision: number) => ({ ...basis, planRevision: atRevision, kind: 'request-handback',
        summary: 'B result is integrated in A and compatible with D',
        coverage: [{ case: 'need-001.ex01', evidence: ['subs/a/src/tests/caller.test.ts'] }],
        interfaces: [{ path: 'subs/b/src/fact.ts', symbols: ['readFact', 'FactResult'], use: 'Call readFact and render its source' }], limitations: [] });
      if (architect !== 9) return submit(handback(Number(revision)));
      const jobs = readdirSync(join(fixture.root, 'plans', 'need', '.harness', 'jobs'));
      const job = JSON.parse(readFileSync(runPath(fixture.root, 'need', jobs[0]!, 'job.json'), 'utf8')) as { projectConfig: unknown };
      const configuration = createHash('sha256').update(JSON.stringify(job.projectConfig)).digest('hex');
      const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: fixture.root, encoding: 'utf8' }).trim();
      return [
        { kind: 'tool', tool: 'update_capability_plan', input: { task, basedOn: Number(revision), invocation,
          reason: 'Record independent executable coverage after repairing the circular oracle',
          changes: { useCases: [{ id: 'need-001.ex01', expectedBehavior: 'Fresh fact: old from B', derivedFrom: ['need-001.ex01'],
            coverage: { state: 'corrected', reason: 'The earlier oracle compared the value to itself',
              evidence: ['review of circular assertion', 'independent literal from original request'], decidedBy: invocation,
              tests: ['subs/a/src/tests/caller.test.ts'], candidate: tree, configuration } }] } } },
        { kind: 'submit', input: handback(Number(revision) + 1) },
      ];
    }
    return [];
  };
  let closingVerification: Promise<void> | undefined;
  let frozenFault = false;
  let closeVerification: (() => Promise<void>) | undefined;
  let activeService: Awaited<ReturnType<typeof openCapabilityRuns>>['service'] | undefined;
  const realChecks = createLocalCommandCheckExecution();
  const failingCombinedChecks = createMappedCheckExecution({ script: ({ check }) => check.kind === 'tests'
    ? { outcome: { kind: 'completed', exitCode: 1 }, stdout: 'Combined capability repair fixture failure' }
    : {} });
  const gateContexts: string[] = [];
  const options = { git: gitService, script: scripted, inputs: treeInputs(),
    readinessExecution: directReadinessExecution(),
    checkExecution: mode === 'repair-exhaustion' ? { run: (checks: Parameters<typeof realChecks.run>[0],
      request: Parameters<typeof realChecks.run>[1]) => {
        gateContexts.push(`${request.context.attemptId}:${request.context.checkpoint}`);
        // This fixture's first three gates belong to scoped assignments;
        // ga-0004 and later are its combined handback attempts.
        return request.context.checkpoint === 'work-item' &&
          Number(request.context.attemptId.slice(3)) >= 4
          ? failingCombinedChecks.run(checks, request) : realChecks.run(checks, request);
      } } : realChecks,
    afterWrite: async (write: string, runId: string) => {
      const event = activeService?.events('need', runId)?.at(-1);
      const gate = activeService?.events('need', runId)?.filter(entry => entry.type === 'gate-attempted').at(-1);
      const boundary = mode === 'verify-restart' && write === 'capability-verification-started' ||
        mode === 'gate-intent-restart' && write === 'gate-attempted' &&
          event?.type === 'gate-committing' && event.data.gate === 'ga-0004' ||
        mode === 'gate-committing-restart' && write === 'gate-committing' &&
          event?.type === 'gate-committing' && event.data.gate === 'ga-0004' ||
        mode === 'gate-restart' && write === 'capability-gate-recorded' &&
          gate?.type === 'gate-attempted' && gate.data.gate === 'ga-0004' && gate.data.verdict === 'passed' ||
        mode === 'review-submission-restart' && write === 'invocation-ended' && reviewer === 9 &&
          event?.type === 'invocation-ended' && event.data.ended === 'submitted' &&
          (activeService?.events('need', runId) ?? []).some(started => started.type === 'invocation-started' &&
            started.data.invocation === event.data.invocation && started.data.role === 'reviewer') ||
        mode === 'review-restart' && write === 'capability-review-recorded' && event?.type === 'capability-review-recorded' &&
          event.data.outcome === 'passed' && event.data.planRevision >= 2;
      if (boundary && !frozenFault && closingVerification === undefined) {
        if (mode === 'gate-intent-restart' || mode === 'gate-committing-restart' || mode === 'review-submission-restart') {
          frozenFault = true;
          await freeze();
        } else closingVerification = closeVerification?.();
      }
    },
    policy: root => {
      const base = testPolicy(root);
      return { ...base, commands: { ...base.commands,
        allTests: checkCommand({ argv: [join(root, 'node_modules/.bin/vitest'), 'run',
          'subs/a/src/tests/caller.test.ts', 'subs/b/src/tests/fact.test.ts', 'subs/d/src/tests/consumer.test.ts'], cwd: root, timeoutMs: 30_000 }),
        typeCheck: checkCommand({ argv: [join(process.cwd(), 'node_modules/.bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], cwd: root, timeoutMs: 30_000 }),
        ramifyCheck: base.commands.ramifyCheck,
      } };
    } } satisfies Parameters<typeof openCapabilityRuns>[1];
  const opened = await openCapabilityRuns(fixture.root, options);
  if (mode !== 'gate-intent-restart' && mode !== 'gate-committing-restart' && mode !== 'review-submission-restart') {
    cleanups.push(() => opened.service.close());
  }
  activeService = opened.service;
  closeVerification = () => opened.service.close();
  const receipt = await opened.service.execute(startRun('need'));
  if (mode === 'verify-restart' || mode === 'gate-restart' || mode === 'gate-intent-restart' ||
    mode === 'gate-committing-restart' || mode === 'review-restart' || mode === 'review-submission-restart') {
    await until(() => frozenFault || closingVerification !== undefined, 120_000).catch(async error => {
      const current = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
      throw new Error(`${String(error)}; architect ${architect}; gates ${JSON.stringify(current.filter(event => event.type === 'gate-attempted'))}; tail ${JSON.stringify(current.slice(-12))}`);
    });
    if (frozenFault) await staleCrashLock(fixture.root);
    else await closingVerification;
    const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    if (mode === 'verify-restart') expect(before.filter(event => event.type === 'capability-verification-started')).toHaveLength(1);
    expect(before.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
    const gates = before.filter(event => event.type === 'gate-attempted').length;
    const committing = before.filter(event => event.type === 'gate-committing' && event.data.gate === 'ga-0004').length;
    const reviews = before.filter(event => event.type === 'capability-review-recorded').length;
    const reviewerStarts = before.filter(event => event.type === 'invocation-started' && event.data.role === 'reviewer').length;
    resuming = true;
    const reopened = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => reopened.service.close());
    await until(() => (reopened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-handed-back' || event.type === 'job-failed'), 60_000);
    const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(after.filter(event => event.type === 'job-failed'), JSON.stringify(after.slice(-15))).toHaveLength(0);
    expect(after.filter(event => event.type === 'capability-handed-back')).toHaveLength(1);
    expect(after.filter(event => event.type === 'gate-attempted'), JSON.stringify({ before: before.slice(-12), after: after.slice(-18) }))
      .toHaveLength(gates + (mode === 'gate-intent-restart' || mode === 'gate-committing-restart' ? 1 : 0));
    if (mode === 'gate-intent-restart' || mode === 'gate-committing-restart') {
      expect(after.filter(event => event.type === 'gate-committing' && event.data.gate === 'ga-0004')).toHaveLength(committing || 1);
      expect(after.filter(event => event.type === 'gate-attempted' && event.data.gate === 'ga-0004')).toHaveLength(1);
    }
    const reviewEvents = after.filter(event => event.type === 'capability-review-recorded');
    if (mode === 'verify-restart' || mode === 'review-restart') expect(reviewEvents).toHaveLength(reviews);
    expect(reviewEvents.filter(event => event.data.gate === 'ga-0004' && event.data.planRevision === 2 &&
      event.data.outcome === 'passed')).toHaveLength(1);
    expect(new Set(reviewEvents.map(event => `${event.data.gate}:${event.data.planRevision}`)).size).toBe(reviewEvents.length);
    if (mode === 'review-submission-restart') {
      const replayedReviewers = after.filter(event => event.type === 'invocation-started' && event.data.role === 'reviewer');
      expect(replayedReviewers).toHaveLength(reviewerStarts);
    }
    await stopStable(reopened.service, receipt.jobId);
    await reopened.service.settled('need', receipt.jobId);
    return;
  }
  await until(() => mode === 'drift' ? driftFeedback.length > 0 : (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-handed-back' || event.type === 'job-failed'), 120_000).catch(async error => {
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    throw new Error(`${String(error)}; architect ${architect}, reviewer ${reviewer}; last events ${JSON.stringify(events.slice(-18))}`);
  });
  const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
  if (mode === 'repair-exhaustion') {
    const failed = events.find(event => event.type === 'job-failed');
    expect(failed?.type === 'job-failed' ? failed.data.reason : null,
      JSON.stringify({ gateContexts, tail: events.slice(-20).map(event => [event.type, event.data]) })).toBe('repair-exhausted');
    const architectInvocations = new Set(events.flatMap(event => event.type === 'invocation-started' &&
      event.data.role === 'capability-architect' ? [event.data.invocation] : []));
    const failedGateIds = events.flatMap(event => event.type === 'gate-attempted' &&
      event.data.verdict === 'failed' ? [event.data.gate] : []);
    const attempts = await Promise.all(failedGateIds.map(async gate =>
      JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
        `gates/${gate}/attempt.json`), 'utf8')) as {
          id: string; proposedBy: string | null; repairRound: number; cause: string | null;
        }));
    const combined = attempts.filter(attempt => attempt.proposedBy !== null && architectInvocations.has(attempt.proposedBy));
    expect(combined.map(attempt => attempt.repairRound)).toEqual([0, 1, 2]);
    expect(failed?.type === 'job-failed' ? failed.data.message : '').toContain(`first cause was ${combined[0]?.cause ?? 'unknown'} at gate ${combined[0]?.id}`);
    expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
    expect(events.filter(event => event.type === 'work-item-completed' && event.data.workItem === 'wi-001')).toHaveLength(0);
    const job = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, 'job.json'), 'utf8')) as {
      policy: { limits: { repairRoundsPerWorkItemGate: number } } };
    expect(job.policy.limits.repairRoundsPerWorkItemGate).toBe(3);
    await opened.service.settled('need', receipt.jobId);
    return;
  }
  if (mode === 'drift') {
    expect(driftFeedback).toContain('Source changed after gate');
    expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
    expect(events.filter(event => event.type === 'capability-candidate-accepted')).toHaveLength(0);
    expect(events.filter(event => event.type === 'gate-attempted' && event.data.verdict === 'passed').length).toBeGreaterThan(0);
    expect(readFileSync(join(fixture.root, 'subs/b/src/fact.ts'), 'utf8')).toContain('concurrent source edit');
    await stopStable(opened.service, receipt.jobId);
    await opened.service.settled('need', receipt.jobId);
    return;
  }
  const lastGate = events.filter(event => event.type === 'gate-attempted').at(-1);
  const lastGateBody = lastGate?.type === 'gate-attempted' ? JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `gates/${lastGate.data.gate}/attempt.json`), 'utf8')) as { cause: string; commands: Array<{ kind: string; outcome: string; output: { tail: string } }> } : null;
  expect(events.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: events.slice(-12),
    gate: lastGateBody === null ? null : { cause: lastGateBody.cause,
      commands: lastGateBody.commands.map(command => [command.kind, command.outcome, command.output.tail.slice(-300)]) } })).toHaveLength(0);
  expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-candidate-accepted')).toHaveLength(1);
  expect(events.filter(event => event.type === 'capability-review-recorded' && event.data.outcome === 'failed')).toHaveLength(1);
  const failed = events.filter((event): event is Extract<typeof event, { type: 'gate-attempted' }> =>
    event.type === 'gate-attempted' && event.data.verdict === 'failed');
  expect(failed.length).toBeGreaterThanOrEqual(1);
  const firstFailed = failed[0]!;
  const firstBody = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `gates/${firstFailed.data.gate}/attempt.json`), 'utf8')) as { commands: Array<{ kind: string; outcome: string; output: { tail: string } }> };
  expect(firstBody.commands.find(command => command.kind === 'type-check')?.outcome).toBe('failed');
  expect(firstBody.commands.find(command => command.kind === 'type-check')?.output.tail).toContain('error TS');
  expect(lastGateBody?.commands.filter(command => ['tests', 'type-check', 'ramify-check'].includes(command.kind))
    .every(command => command.outcome === 'passed')).toBe(true);
  expect(lastGateBody?.commands.filter(command => command.kind === 'tests').some(command =>
    command.output.tail.includes('subs/a/src/tests/caller.test.ts'))).toBe(true);
  expect(lastGateBody?.commands.filter(command => command.kind === 'tests').some(command =>
    command.output.tail.includes('subs/b/src/tests/fact.test.ts'))).toBe(true);
  const handback = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/cap-001/handback.json'), 'utf8')) as { deltaFromSuspension: string[]; returnedTree: string };
  expect(handback.deltaFromSuspension).toContain('subs/b/src/fact.ts');
  expect(handback.deltaFromSuspension).toContain('subs/a/src/tests/caller.test.ts');
  expect(handback.deltaFromSuspension).not.toContain('subs/a/src/extra.ts');
  const request = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/requests/need-001.json'), 'utf8')) as { source: { tree: string } };
  expect(execFileSync('git', ['cat-file', '-t', request.source.tree], { cwd: fixture.root, encoding: 'utf8' }).trim()).toBe('tree');
  expect(events.filter(event => event.type === 'work-item-completed' && event.data.workItem === 'wi-002')).toHaveLength(0);
  const handbackEvent = events.find(event => event.type === 'capability-handed-back')!;
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'invocation-started' &&
    event.sequence > handbackEvent.sequence && event.data.role === 'engineer' && event.data.work.iteration === 'wi-001.i01'), 30_000);
  const continued = opened.service.events('need', receipt.jobId)!;
  expect(continued.filter(event => event.type === 'invocation-started' && event.sequence > handbackEvent.sequence &&
    event.data.role === 'engineer' && event.data.work.iteration === 'wi-001.i01')).toHaveLength(1);
  if (mode === 'restart') {
    const resumedA = continued.find(event => event.type === 'invocation-started' && event.sequence > handbackEvent.sequence &&
      event.data.role === 'engineer' && event.data.work.iteration === 'wi-001.i01');
    if (resumedA?.type !== 'invocation-started') throw new Error('A continuation did not start');
    await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'writer-acquired' && event.data.invocation === resumedA.data.invocation), 30_000);
    await opened.service.close();
    resuming = true;
    const reopened = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => reopened.service.close());
    expect(reopened.recovery.effects, JSON.stringify({ recovery: reopened.recovery,
      tail: (await runEventsOnDisk(fixture.root, 'need', receipt.jobId)).slice(-12) })).toContainEqual(
      expect.stringContaining('resumed capability coordination'));
    await until(() => (reopened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'iteration-closed' && event.data.iteration === 'wi-001.i01') ||
      (reopened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'job-failed'), 45_000);
    const restarted = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(restarted.filter(event => event.type === 'job-failed'), JSON.stringify(restarted.slice(-15))).toHaveLength(0);
    expect(restarted.filter(event => event.type === 'capability-handed-back' && event.data.task === 'cap-001')).toHaveLength(1);
    expect(restarted.filter(event => event.type === 'iteration-closed' && event.data.iteration === 'wi-001.i01')).toHaveLength(1);
    expect(restarted.filter(event => event.type === 'invocation-started' && event.data.work.iteration === 'wi-001.i01' &&
      event.sequence > handbackEvent.sequence).length).toBeGreaterThanOrEqual(2);
    await stopStable(reopened.service, receipt.jobId);
    await reopened.service.settled('need', receipt.jobId);
    return;
  }
  if (mode === 'deferred') {
    await until(() => deferredBriefing.length > 0 || (opened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'job-failed'), 30_000).catch(async error => {
        const current = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
        throw new Error(`${String(error)}; after handback ${JSON.stringify(current.slice(-25))}`);
      });
    if (deferredBriefing.length === 0) {
      const current = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
      throw new Error(`B did not start: ${JSON.stringify(current.slice(-30))}`);
    }
    expect(deferredBriefing).toContain('# Intervening capability work');
    expect(deferredBriefing).toContain('Task cap-001 returned tree');
    expect(deferredBriefing).toContain('Plan cap-001');
    expect(deferredBriefing).toContain('readFact, FactResult at subs/b/src/fact.ts');
    expect(deferredBriefing).toContain('Reassess its prior outline, decisions and any unexecuted assignment against the current source before assigning it.');
    const current = opened.service.events('need', receipt.jobId)!;
    expect(current.filter(event => event.type === 'iteration-assigned' && event.sequence > handbackEvent.sequence)).toHaveLength(0);
    await stopStable(opened.service, receipt.jobId);
    await opened.service.settled('need', receipt.jobId);
    return;
  }
  await until(() => (opened.service.events('need', receipt.jobId) ?? []).some(event => event.type === 'capability-delegated' &&
    event.data.task === 'cap-002'), 30_000);
  const revisionTask = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/cap-002/task.json'), 'utf8')) as { revises?: { handback: { id: string; hash: string }; sourceRevision: string } };
  expect(revisionTask.revises?.handback.id).toBe('cap-001');
  expect(revisionTask.revises?.sourceRevision).toBeTruthy();
  expect((opened.service.events('need', receipt.jobId) ?? []).filter(event => event.type === 'capability-handed-back' &&
    event.data.task === 'cap-001')).toHaveLength(1);
  await stopStable(opened.service, receipt.jobId);
  await opened.service.settled('need', receipt.jobId);
}

async function stopStable(service: Awaited<ReturnType<typeof openCapabilityRuns>>['service'], jobId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const current = service.events('need', jobId)!;
    try { await service.execute(stopRun('need', jobId, current.at(-1)!.sequence)); return; }
    catch (error) { if (!String(error).includes('at version')) throw error; }
  }
  throw new Error('The capability run did not yield a stable stop version');
}

test('CA08 CA11–CA15 CA17 CA25 CA30: real multi-owner migration, repair, handback and linked revision',
  () => runAcceptedHandback('revision'), 150_000);
test('CA28: deferred B entry receives accepted handback and replans from current source',
  () => runAcceptedHandback('deferred'), 150_000);
test('CA31: source drift after a passing combined gate cannot be handed back',
  () => runAcceptedHandback('drift'), 150_000);
test('CA17 CA19 CA28 CA30: restart after handback continues the original A assignment once',
  () => runAcceptedHandback('restart'), 180_000);
test('CA17 CA20 CA30: restart after verification reuses the accepted gate and review for one handback',
  () => runAcceptedHandback('verify-restart'), 180_000);
test('CA20 CA30: restart after the passing gate reuses its audited candidate',
  () => runAcceptedHandback('gate-restart'), 180_000);
test('CA19: in-flight combined capability gate intent recovers one audited commit and handback',
  () => runAcceptedHandback('gate-intent-restart'), 180_000);
test('CA19: in-flight combined capability gate commit recovers one audited commit and handback',
  () => runAcceptedHandback('gate-committing-restart'), 180_000);
test('CA20 CA30: restart after the passing review reuses the same gate and review',
  () => runAcceptedHandback('review-restart'), 180_000);
test('CA19: accepted reviewer submissions replay before their combined review record',
  () => runAcceptedHandback('review-submission-restart'), 180_000);
test('CA26: failed combined gates exhaust the captured repair bound with the first cause and no handback',
  () => runAcceptedHandback('repair-exhaustion'), 180_000);
