import { acceptanceBoundaries } from './acceptance-boundaries.js';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect } from 'vitest';
import type { Script } from '../../../subs/agent/src/scripted.js';
import { gitService } from '../../../subs/evidence/src/git.js';
import { checkCommand, type Checkpoint } from '../../checks/records.js';
import type { ConfiguredAuditInput } from '../../../subs/audit/src/check-execution.js';
import { localCommandAudit, mappedAudit } from './direct-check-execution.js';
import { analysis, entry, requestCompletion } from './analysis.js';
import { copyCapabilityFixture, openCapabilityRuns } from './capability.js';
import { assign, edit, installMiniRunner, outline, submit, treeInputs, write } from './iterations.js';
import { rootDescription } from './root-description.js';
import { testReviewPolicy } from './candidates.js';
import { freeze, initRepository, runEventsOnDisk, runPath, staleCrashLock, startRun, stopRun, testPolicy, until } from './runs.js';

const a = 'capability-coordination/a';
const b = 'capability-coordination/b';
const d = 'capability-coordination/d';
const p = 'capability-coordination';

export async function runAcceptedHandback(mode: 'revision' | 'deferred' | 'drift' | 'restart' | 'verify-restart' |
  'gate-restart' | 'gate-intent-restart' | 'gate-committing-restart' |
  'review-restart' | 'review-submission-restart' | 'concern-submission-restart' | 'repair-exhaustion', cleanups: Array<() => Promise<void>>, realBoundary = false): Promise<void> {
  const fixture = await copyCapabilityFixture(); cleanups.push(fixture.remove);
  if (realBoundary) {
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
  }
  const external = realBoundary ? undefined : acceptanceBoundaries(fixture.root, mode);
  if (external !== undefined) cleanups.push(async () => external.assertComplete());
  let architect = 0;
  let reviewer = 0;
  let raisedConcern = false;
  let originalEngineer = true;
  let localTurn = 0;
  let deferredBriefing = '';
  let driftFeedback = '';
  let lastCapabilityPrompt = '';
  let correctionAssigned = false;
  let planExercised = false;
  let planCorrected = false;
  let resuming = false;
  let suspendedContinuationStarted = false;
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
        external?.stage('suspended');
        return submit({ kind: 'capability-needed', summary: 'A has an unfinished caller', request: {
          need: 'Render a fact with its source', usage: [{ path: 'subs/a/src/caller.ts', symbol: 'renderA', use: 'Render B fact', prospective: false }],
          constraints: ['D retains the old label'], knownInterface: { kind: 'none-known' },
          examples: [{ title: 'shows source', code: "expect(renderA()).toBe('Fresh fact: old from B')", designation: 'pseudocode' }],
        } }, edit('caller.ts', 'Fact: ${value}', 'Fresh fact: ${value}'),
        write('extra.ts', "export const sourceHint = 'B';\n"),
        edit('tests/caller.test.ts', "toBe('Fact: old')", "toBe('unfinished')"));
      }
      const owner = spec.prompt.includes('# Iteration cap-') ? /Your starting module is `([^`]+)`/u.exec(spec.prompt)?.[1] : undefined;
      if (owner === b) { external?.stage('provider'); return submit({ kind: 'partial', summary: 'B added the source field for combined verification', findings: [], unfinished: [] },
        write('../docs/prior.txt', 'B-owned prior assignment documentation\n'),
        write('fact.ts', "export interface FactResult { text: string; source: string }\nexport const readFact = (): FactResult => ({ text: 'old', source: 'B' });\n"),
        write('tests/fact.test.ts', "import { expect, test } from 'vitest';\nimport { readFact } from '../fact.js';\ntest('B returns the independently specified fact', () => expect(readFact()).toEqual({ text: 'old', source: 'B' }));\n")); }
      if (owner === d) { external?.stage('consumer'); return submit({ kind: 'partial', summary: 'D migrated its typed use for combined verification', findings: [], unfinished: [] },
        write('consumer.ts', "import { readFact } from '../../b/src/fact.js';\nexport function legacyLabel(): string { return readFact().text.toUpperCase(); }\n")); }
      if (owner === p) { external?.stage('exposed'); return submit({ kind: 'partial', summary: 'P exposed the signature companion for combined verification', findings: [], unfinished: [] },
        write('../module.ramify', rootDescription('capability-coordination', 'expose-sub readFact, FactResult from b to descendants\n')),
        write('assembly.ts', "import { renderA } from '../subs/a/src/caller.js';\nexport const render = () => renderA();\n")); }
      if (owner === a && spec.prompt.includes('independent literal')) { external?.stage('corrected'); return submit({ kind: 'completion-proposed', summary: 'A repaired the circular oracle', findings: [] },
        write('tests/caller.test.ts', "import { expect, test } from 'vitest';\nimport { renderA } from '../caller.js';\ntest('A renders the source', () => expect(renderA()).toBe('Fresh fact: old from B'));\n")); }
      if (owner === a) { external?.stage('integrated'); return submit({ kind: 'completion-proposed', summary: 'A integrated the real B result', findings: [] },
        write('caller.ts', "import { readFact } from '../../b/src/fact.js';\nexport function renderA(): string { const fact = readFact(); return `Fresh fact: ${fact.text} from ${fact.source}`; }\n"),
        write('tests/caller.test.ts', "import { expect, test } from 'vitest';\nimport { renderA } from '../caller.js';\ntest('A renders the source', () => expect(renderA()).toBe(renderA()));\n")); }
      suspendedContinuationStarted = true;
      if (mode === 'restart' || mode === 'verify-restart' || mode === 'gate-restart' ||
        mode === 'gate-intent-restart' || mode === 'gate-committing-restart' ||
        mode === 'review-restart' || mode === 'review-submission-restart' || mode === 'concern-submission-restart') return resuming
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
      const changedPaths = spec.prompt.split('## The changed paths\n\n')[1]?.split('\n\n')[0] ?? '';
      const paths = [...changedPaths.matchAll(/^- [A-Z] (.+)$/gmu)].map(match => match[1]!);
      const concern = { summary: 'A expected value copies the implementation', consequence: 'The assertion cannot catch a wrong result',
        rationale: 'The candidate calls renderA on both sides', uncertainty: 'low', remedy: 'Use an independent literal',
        locations: [{ path: 'subs/a/src/tests/caller.test.ts', startLine: 3, endLine: 3 }], suggests: null, risk: 'medium', ground: null };
      const shouldRaise = !raisedConcern && paths.includes('subs/a/src/tests/caller.test.ts') &&
        readFileSync(join(fixture.root, 'subs/a/src/tests/caller.test.ts'), 'utf8').includes('toBe(renderA())');
      if (shouldRaise) raisedConcern = true;
      return [...paths.map(path => ({ kind: 'tool' as const, tool: 'snapshot_diff', input: { path } })),
        { kind: 'submit', input: { inspected: paths, missing: [], concerns: shouldRaise ? [concern] : [] } }];
    }
    if (spec.submission.name === 'submit_reconciliation') {
      const id = /### `(cf-\d+)`/u.exec(spec.prompt)?.[1];
      if (id === undefined) return submit({ relations: [], dispositions: [], next: { kind: 'complete' },
        brief: 'The accepted correction closed the finding; no new concern needs attention.' });
      const firstRound = spec.prompt.includes('round 1 of');
      const report = /- `(cfr-\d+)` by /u.exec(spec.prompt)?.[1];
      if (!firstRound && report === undefined) throw new Error(`Reconciliation lacks its report: ${spec.prompt}`);
      return submit({ relations: [], dispositions: [{ checkFinding: id,
        rationale: firstRound ? 'The circular test oracle needs an independent expected value.'
          : 'The repaired test now asserts the independent literal from the original request.',
        communication: { mode: 'quiet' },
        action: firstRound ? { action: 'repair' } : { action: 'fixed', reassessed: [report] },
      }], next: firstRound ? { kind: 'correct', goal: 'Repair the A test with an independent expected literal.' } : { kind: 'complete' },
      brief: firstRound ? 'The A test oracle copies the implementation; assign an independent literal.' : 'The independent literal fixes the review concern.' });
    }
    if (spec.role === 'capability-architect') {
      lastCapabilityPrompt = spec.prompt;
      const [, task, revision, invocation] = /Use task (cap-\d+), planRevision (\d+) and invocation (inv-\d+)/u.exec(spec.prompt)!;
      if (task === 'cap-002') return [{ kind: 'wait', ms: 60_000 }];
      architect += 1;
      const basis = { task, planRevision: Number(revision), invocation };
      const assignOwner = (owner: string, purpose: string) => submit({ ...basis, kind: 'assign', assignment: assign(owner, {
        goal: purpose, approach: purpose, completionEvidence: 'Real source and tests',
      }).assignment });
      if (spec.prompt.includes('requires a correction assignment')) {
        correctionAssigned = true;
        return assignOwner(a, 'Repair the A test with an independent literal');
      }
      if (mode === 'drift' && spec.prompt.includes('Source changed after gate')) {
        driftFeedback = spec.prompt;
        return [{ kind: 'wait', ms: 60_000 }];
      }
      if (architect === 1) return assignOwner(b, 'Add the source field');
      if (architect === 3) return assignOwner(d, 'Migrate D typed use');
      if (architect === 4) return assignOwner(p, 'Expose the companion');
      if (architect === 5) return assignOwner(a, 'Integrate A');
      // The handback is the architect's done report on the delegated
      // outcome, made once at the revision its briefing shows. It cites no
      // test file; what it concluded about the example is summary text.
      const outcome = new RegExp(`- ${task} \\(delegated outcome\\): (pending|bound|done), revision (\\d+)`, 'u').exec(spec.prompt);
      if (outcome === null) throw new Error(`The capability briefing lacks ${task}'s obligation line`);
      const handback = (atRevision: number) => ({ ...basis, planRevision: atRevision, kind: 'request-handback',
        summary: 'B result is integrated in A and compatible with D; the original example renders the B fact with its source',
        interfaces: [{ path: 'subs/b/src/fact.ts', symbols: ['readFact', 'FactResult'], use: 'Call readFact and render its source' }], limitations: [],
        reports: outcome[1] === 'done' ? [] : [{ id: task, judgment: 'done', basedOnRevision: Number(outcome[2]), where: 'subs/a/src/tests/caller.test.ts' }] });
      if (architect >= 6 && !planExercised) {
        planExercised = true;
        return [
          { kind: 'tool', tool: 'update_capability_plan', input: { task, basedOn: Number(revision), invocation,
            reason: 'State the A example as the consumer renders it while ordinary review judges its oracle',
            changes: { useCases: [{ id: 'need-001.ex01', expectedBehavior: 'Fresh fact: old from B', derivedFrom: ['need-001.ex01'] }] } } },
          { kind: 'submit', input: handback(Number(revision) + 1) },
        ];
      }
      if (!correctionAssigned || planCorrected) return submit(handback(Number(revision)));
      planCorrected = true;
      return [
        { kind: 'tool', tool: 'update_capability_plan', input: { task, basedOn: Number(revision), invocation,
          reason: 'The earlier oracle compared the value to itself; the A test now asserts the independent literal from the original request',
          changes: { useCases: [{ id: 'need-001.ex01', expectedBehavior: 'Renders the independent literal Fresh fact: old from B', derivedFrom: ['need-001.ex01'] }] } } },
        { kind: 'submit', input: handback(Number(revision) + 1) },
      ];
    }
    return [];
  };
  let closingVerification: Promise<void> | undefined;
  let frozenFault = false;
  let targetGateId: string | undefined;
  let closeVerification: (() => Promise<void>) | undefined;
  let activeService: Awaited<ReturnType<typeof openCapabilityRuns>>['service'] | undefined;
  // The ordinary matrix answers configured policy with explicit synthetic
  // responses. The actual boundary witness runs the owners' Vitest and tsc
  // commands in place; its audit record remains synthetic provider evidence.
  const realChecks = external?.audit ?? localCommandAudit({
    tests: [join(fixture.root, 'node_modules/.bin/vitest'), 'run',
      'subs/a/src/tests/caller.test.ts', 'subs/b/src/tests/fact.test.ts', 'subs/d/src/tests/consumer.test.ts'],
    'type-check': [join(process.cwd(), 'node_modules/.bin/tsc'), '--noEmit', '-p', 'tsconfig.json'],
  });
  const failingCombinedChecks = mappedAudit(({ check }) => check.kind === 'tests'
    ? { outcome: { kind: 'completed', exitCode: 1 }, stdout: 'Combined capability repair fixture failure' }
    : {});
  const gateContexts: string[] = [];
  let inheritedAuthorityChecked = false;
  const options = { git: external?.git ?? gitService, ...(external === undefined ? {} : { candidates: external.candidates, ramify: external.ramify, provisionalSourceGit: external.sourceGit }), script: scripted, inputs: treeInputs(),

    configuredAudit: mode === 'repair-exhaustion' ? { read: realChecks.read, async run(input: ConfiguredAuditInput) {
        const checkpoint = await gateCheckpoint(fixture.root, input);
        gateContexts.push(`${input.attemptId}:${checkpoint}`);
        // The exhaustion fixture states a failure only for the bounded
        // task's ordinary completion gate.
        return checkpoint === 'work-item' && external === undefined ? failingCombinedChecks.run(input) : realChecks.run(input);
      } } : realChecks,
    afterWrite: async (write: string, runId: string) => {
      const event = activeService?.events('need', runId)?.at(-1);
      const gate = activeService?.events('need', runId)?.filter(entry => entry.type === 'gate-attempted').at(-1);
      if (mode === 'revision' && write === 'capability-assigned' && event?.type === 'capability-assigned' && event.data.sequence === 4) {
        const assignment = JSON.parse(await readFile(runPath(fixture.root, 'need', runId, 'work-items/cap-001/iterations/04/assignment.json'), 'utf8'));
        const active = activeService!['runs'].get(`need/${runId}`)!;
        const request = { checkpoint: 'iteration' as const, subject: { workItem: 'wi-001', iteration: assignment.id } };
        const paths = ['module.ramify', 'src/assembly.ts', 'subs/b/src/fact.ts', 'subs/b/src/tests/fact.test.ts', 'subs/d/src/consumer.ts', 'subs/b/docs/prior.txt'];
        for (const path of paths) {
          const hash = createHash('sha256').update(await readFile(join(fixture.root, path))).digest('hex');
          expect(assignment.coordination.startingPaths).toContainEqual({ path, hash });
        }
        const positive = await activeService!['candidateAuthority'](active, request);
        expect(positive.rules.find(rule => rule.rule === 'write-scope')?.outcome).toBe('passed');
        expect(positive.ownership?.selection.paths.filter(seed => paths.includes(seed.path)).map(seed => [seed.path, seed.status, seed.module, seed.exclusion]).sort()).toEqual(
          paths.map(path => [path, 'owned', path.startsWith('subs/b/') ? b : path.startsWith('subs/d/') ? d : p, null]).sort());
        const file = join(fixture.root, 'subs/b/src/fact.ts');
        const original = await readFile(file);
        await writeFile(file, `${original.toString()}\n// unassigned later bytes\n`);
        const changed = await activeService!['candidateAuthority'](active, request);
        expect(changed.rules.find(rule => rule.rule === 'write-scope')?.violations).toContainEqual(expect.objectContaining({ path: 'subs/b/src/fact.ts' }));
        await writeFile(file, original);
        const declaration = join(fixture.root, 'subs/b/module.ramify');
        const declared = await readFile(declaration);
        for (const line of ['external "docs"', 'owned-nested-project "docs"']) {
          await writeFile(declaration, `${declared.toString()}\n${line}\n`);
          const narrowed = await activeService!['candidateAuthority'](active, request);
          expect(narrowed.rules.find(rule => rule.rule === 'write-scope')?.violations).toContainEqual(expect.objectContaining({ path: 'subs/b/docs/prior.txt' }));
        }
        await writeFile(declaration, declared);
        inheritedAuthorityChecked = true;
      }
      if (mode === 'drift' && write === 'gate-committed' && gate?.type === 'gate-attempted' &&
        gate.data.checkpoint === 'work-item' && gate.data.verdict === 'passed') {
        external?.stage('drift');
        writeFileSync(join(fixture.root, 'subs/b/src/fact.ts'), `${readFileSync(join(fixture.root, 'subs/b/src/fact.ts'), 'utf8')}\n// concurrent source edit after the passing gate\n`);
      }
      // Independent review events may advance the ledger tail before this
      // write observer runs. Identify the submitted reviewer by its invocation,
      // while its request still has no combined completion record.
      const current = activeService?.events('need', runId) ?? [];
      const pendingReview = current.filter(entry => entry.type === 'review-request-recorded').at(-1);
      const latestReviewer = current.filter(entry => entry.type === 'invocation-started' && entry.data.role === 'reviewer').at(-1);
      const pendingSubmission = latestReviewer?.type === 'invocation-started' && current.some(entry =>
        entry.type === 'invocation-ended' && entry.data.invocation === latestReviewer.data.invocation && entry.data.ended === 'submitted') &&
        pendingReview?.type === 'review-request-recorded' && !current.some(entry => entry.type === 'review-attempt-finished' && entry.data.request === pendingReview.data.request);
      const boundary = mode === 'verify-restart' && write === 'capability-verification-started' ||
        mode === 'gate-intent-restart' && write === 'gate-attempted' &&
          event?.type === 'gate-committing' && event.data.checkpoint === 'work-item' ||
        mode === 'gate-committing-restart' && write === 'gate-committing' &&
          event?.type === 'gate-committing' && event.data.checkpoint === 'work-item' ||
        mode === 'gate-restart' && write === 'gate-committed' &&
          gate?.type === 'gate-attempted' && gate.data.checkpoint === 'work-item' && gate.data.verdict === 'passed' ||
        mode === 'review-submission-restart' && write === 'invocation-ended' && reviewer >= 2 && pendingSubmission ||
        mode === 'concern-submission-restart' && write === 'invocation-ended' && reviewer === 1 && pendingSubmission ||
        mode === 'review-restart' && write === 'gate-attempted' && reviewer >= 2 &&
          event?.type === 'gate-committing' && event.data.checkpoint === 'work-item';
      if (boundary && !frozenFault && closingVerification === undefined) {
        targetGateId = event?.type === 'gate-committing' ? event.data.gate
          : gate?.type === 'gate-attempted' && gate.data.checkpoint === 'work-item' ? gate.data.gate : undefined;
        if (mode === 'gate-restart' || mode === 'gate-intent-restart' || mode === 'gate-committing-restart' || mode === 'review-restart') {
          frozenFault = true;
          await freeze();
        } else closingVerification = closeVerification?.();
      }
    },
    policy: root => {
      const base = testPolicy(root);
      return { ...base, reviews: testReviewPolicy(), commands: { ...base.commands,
        typeCheck: checkCommand({ argv: [join(process.cwd(), 'node_modules/.bin/tsc'), '--noEmit', '-p', 'tsconfig.json'], cwd: root, timeoutMs: 30_000 }),
        ramifyCheck: base.commands.ramifyCheck,
      } };
    } } satisfies Parameters<typeof openCapabilityRuns>[1];
  const opened = await openCapabilityRuns(fixture.root, options);
  if (mode !== 'gate-restart' && mode !== 'gate-intent-restart' && mode !== 'gate-committing-restart' &&
    mode !== 'review-restart' && mode !== 'review-submission-restart' && mode !== 'concern-submission-restart') {
    cleanups.push(() => opened.service.close());
  }
  activeService = opened.service;
  closeVerification = () => opened.service.close();
  const receipt = await opened.service.execute(startRun('need'));
  if (mode === 'verify-restart' || mode === 'gate-restart' || mode === 'gate-intent-restart' ||
    mode === 'gate-committing-restart' || mode === 'review-restart' || mode === 'review-submission-restart' ||
    mode === 'concern-submission-restart') {
    await until(() => frozenFault || closingVerification !== undefined, 120_000).catch(async error => {
      const current = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
      throw new Error(`${String(error)}; architect ${architect}; gates ${JSON.stringify(current.filter(event => event.type === 'gate-attempted'))}; tail ${JSON.stringify(current.slice(-12))}`);
    });
    if (frozenFault) await staleCrashLock(fixture.root);
    else await closingVerification;
    const before = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    if (mode === 'verify-restart') expect(before.filter(event => event.type === 'capability-verification-started')).toHaveLength(1);
    expect(before.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
    if (mode === 'review-submission-restart' || mode === 'concern-submission-restart') {
      const request = before.filter(event => event.type === 'review-request-recorded').at(-1);
      expect(request).toBeDefined();
      expect(before.some(event => event.type === 'review-attempt-started' && event.data.request === request?.data.request)).toBe(true);
      expect(before.some(event => event.type === 'review-attempt-finished' && event.data.request === request?.data.request)).toBe(false);
      const reviewerInvocations = new Set(before.flatMap(event => event.type === 'invocation-started' && event.data.role === 'reviewer'
        ? [event.data.invocation] : []));
      expect(before.some(event => event.type === 'invocation-ended' && event.data.ended === 'submitted' &&
        reviewerInvocations.has(event.data.invocation))).toBe(true);
    }
    const gates = before.filter(event => event.type === 'gate-attempted').length;
    const committing = before.filter(event => event.type === 'gate-committing' && event.data.gate === targetGateId).length;
    const reviews = before.filter(event => event.type === 'review-attempt-finished').length;
    const reviewerStarts = before.filter(event => event.type === 'invocation-started' && event.data.role === 'reviewer').length;
    resuming = true;
    const reopened = await openCapabilityRuns(fixture.root, options);
    cleanups.push(() => reopened.service.close());
    await until(() => (reopened.service.events('need', receipt.jobId) ?? []).some(event =>
      event.type === 'capability-handed-back' || event.type === 'job-failed'), 60_000).catch(async error => {
      const current = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
      throw new Error(`${String(error)}; architect ${architect}, reviewer ${reviewer}; warnings ${JSON.stringify(reopened.warnings)}; tail ${JSON.stringify(current.slice(-18))}`);
    });
    const after = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    expect(after.filter(event => event.type === 'job-failed'), JSON.stringify(after.slice(-15))).toHaveLength(0);
    expect(after.filter(event => event.type === 'capability-handed-back')).toHaveLength(1);
    const alreadyPassedTaskGate = before.some(event => event.type === 'gate-attempted' &&
      event.data.checkpoint === 'work-item' && event.data.verdict === 'passed');
    const expectedNewGates = mode === 'concern-submission-restart' ? 2 : alreadyPassedTaskGate ? 0 : 1;
    expect(after.filter(event => event.type === 'gate-attempted'), JSON.stringify({ before: before.slice(-12), after: after.slice(-18) }))
      .toHaveLength(gates + expectedNewGates);
    if (mode === 'gate-intent-restart' || mode === 'gate-committing-restart') {
      expect(targetGateId).toBeDefined();
      expect(after.filter(event => event.type === 'gate-committing' && event.data.gate === targetGateId)).toHaveLength(committing || 1);
      expect(after.filter(event => event.type === 'gate-attempted' && event.data.gate === targetGateId)).toHaveLength(1);
    }
    const reviewEvents = after.filter(event => event.type === 'review-attempt-finished');
    if (mode === 'verify-restart' || mode === 'review-restart') expect(reviewEvents).toHaveLength(reviews);
    expect(after.filter(event => event.type === 'review-request-recorded').length).toBeGreaterThan(0);
    if (mode === 'review-submission-restart' || mode === 'concern-submission-restart') {
      const replayedReviewers = after.filter((event): event is Extract<typeof event, { type: 'invocation-started' }> =>
        event.type === 'invocation-started' && event.data.role === 'reviewer');
      const originalReviewers = before.filter((event): event is Extract<typeof event, { type: 'invocation-started' }> =>
        event.type === 'invocation-started' && event.data.role === 'reviewer');
      const sameReviewers = mode === 'concern-submission-restart'
        ? replayedReviewers.filter(event => event.data.work.iteration === originalReviewers[0]?.data.work.iteration)
        : replayedReviewers;
      expect(sameReviewers, JSON.stringify({ before: before.filter(event => event.type.startsWith('review-') ||
        (event.type === 'invocation-started' && event.data.role === 'reviewer') ||
        event.type === 'invocation-ended').slice(-14), after: after.filter(event => event.type.startsWith('review-') ||
        (event.type === 'invocation-started' && event.data.role === 'reviewer') ||
        event.type === 'invocation-ended').slice(-16) })).toHaveLength(mode === 'concern-submission-restart' ? 1 : reviewerStarts);
      if (mode === 'concern-submission-restart') {
        const firstRequest = before.find(event => event.type === 'review-request-recorded');
        if (firstRequest?.type !== 'review-request-recorded') throw new Error('The concern review request was not recorded');
        const finished = after.filter((event): event is Extract<typeof event, { type: 'review-attempt-finished' }> =>
          event.type === 'review-attempt-finished' && event.data.request === firstRequest.data.request);
        expect(finished).toHaveLength(1);
        expect(finished[0]?.data.attempt).toBe(`${firstRequest.data.request}.a01`);
        expect(finished[0]?.data.checkFindings.filter(finding => finding.type === 'check-finding-opened')).toHaveLength(1);
      }
    }
    await stopStable(reopened.service, receipt.jobId);
    await reopened.service.settled('need', receipt.jobId);
    return;
  }
  await until(() => mode === 'drift' ? driftFeedback.length > 0 : (opened.service.events('need', receipt.jobId) ?? []).some(event =>
    event.type === 'capability-handed-back' || event.type === 'job-failed'), 120_000).catch(async error => {
    const events = await runEventsOnDisk(fixture.root, 'need', receipt.jobId);
    const gate = events.filter(event => event.type === 'gate-attempted').at(-1);
    const body = gate?.type === 'gate-attempted' ? JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
      `gates/${gate.data.gate}/attempt.json`), 'utf8')) as { provider?: unknown; commands?: unknown } : null;
    throw new Error(`${String(error)}; architect ${architect}, reviewer ${reviewer}; prompt ${lastCapabilityPrompt.slice(-2200)}; gate ${JSON.stringify(body)}; last events ${JSON.stringify(events.slice(-18))}`);
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
    expect(combined.map(attempt => attempt.repairRound)).toEqual([0, 1, 2, 3]);
    expect(failed?.type === 'job-failed' ? failed.data.message : '').toContain(`first cause was ${combined[0]?.cause ?? 'unknown'} at gate ${combined[0]?.id}`);
    expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
    expect(events.filter(event => event.type === 'work-item-completed' && event.data.workItem === 'wi-001')).toHaveLength(0);
    const job = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, 'job.json'), 'utf8')) as {
      policy: { limits: { repairRoundsPerWorkItemGate: number } } };
    expect(job.policy.limits.repairRoundsPerWorkItemGate).toBe(3);
    // The architect's done report stands beside the raw failed gates: no
    // failure rewrote it, and it did not pass the task's verification.
    const outcomeReports = events.filter(event => event.type === 'obligation-reported' && event.data.id === 'cap-001');
    expect(outcomeReports.map(event => event.type === 'obligation-reported' ? [event.data.judgment, event.data.revision] : null)).toEqual([['done', 1]]);
    expect(failedGateIds.length).toBeGreaterThanOrEqual(4);
    expect(attempts.every(attempt => attempt.cause !== null)).toBe(true);
    await opened.service.settled('need', receipt.jobId);
    return;
  }
  if (mode === 'drift') {
    expect(driftFeedback).toContain('Source changed after gate');
    expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(0);
    expect(events.filter(event => event.type === 'gate-attempted' && event.data.verdict === 'passed').length).toBeGreaterThan(0);
    expect(readFileSync(join(fixture.root, 'subs/b/src/fact.ts'), 'utf8')).toContain('concurrent source edit');
    await stopStable(opened.service, receipt.jobId);
    await opened.service.settled('need', receipt.jobId);
    return;
  }
  const lastGate = events.filter(event => event.type === 'gate-attempted').at(-1);
  const lastGateBody = lastGate?.type === 'gate-attempted' ? JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `gates/${lastGate.data.gate}/attempt.json`), 'utf8')) as {
      cause: string;
      commands: Array<{ kind: string; outcome: string; providerCheckId?: string; output: { tail: string } }>;
      provider?: { checks: Record<string, { passed: boolean; vitest?: { reason: string; files: Array<{ path: string; state: string }> };
        commands?: Record<string, { passed: boolean; vitest?: { reason: string; files: Array<{ path: string; state: string }> } }> }> };
    } : null;
  expect(events.filter(event => event.type === 'job-failed'), JSON.stringify({ tail: events.slice(-12),
    architect, reviewer, lastCapabilityPrompt: lastCapabilityPrompt.slice(-1600),
    gate: lastGateBody === null ? null : { cause: lastGateBody.cause,
      commands: lastGateBody.commands.map(command => [command.kind, command.outcome, command.output.tail.slice(-300)]) } })).toHaveLength(0);
  expect(events.filter(event => event.type === 'capability-handed-back')).toHaveLength(1);
  if (mode === 'revision') expect(inheritedAuthorityChecked).toBe(true);
  // PB3-D08: the handback followed the architect's done report on cap-001,
  // which cited no test file and recorded no per-example state. PB3-D10: the
  // consumer's own scenario is still its local architect's to report.
  const handedBack = events.find(event => event.type === 'capability-handed-back')!;
  const outcomeReport = events.find(event => event.type === 'obligation-reported' && event.data.id === 'cap-001');
  expect(outcomeReport?.type === 'obligation-reported' ? [outcomeReport.data.judgment, outcomeReport.data.where] : null)
    .toEqual(['done', 'subs/a/src/tests/caller.test.ts']);
  expect(outcomeReport!.sequence).toBeLessThan(handedBack.sequence);
  expect(events.some(event => event.type === 'obligation-reported' && event.data.id === 'sc-001')).toBe(false);
  expect(events.some(event => event.type === 'work-item-completed' && event.data.workItem === 'wi-001')).toBe(false);
  const plans = await Promise.all([1, 2, 3].map(async revision => JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    `capabilities/cap-001/plan/${revision}.json`), 'utf8')) as { originalExamples: string[]; useCases: Array<Record<string, unknown>> }));
  expect(plans.map(plan => plan.originalExamples)).toEqual([['need-001.ex01'], ['need-001.ex01'], ['need-001.ex01']]);
  expect(plans.flatMap(plan => plan.useCases).every(useCase => !('coverage' in useCase))).toBe(true);
  const taskSettlements = events.filter((event): event is Extract<typeof event, { type: 'capability-assignment-settled' }> =>
    event.type === 'capability-assignment-settled' && event.data.task === 'cap-001');
  expect(taskSettlements.filter(event => event.data.outcome === 'partial')).toHaveLength(3);
  expect(taskSettlements.filter(event => event.data.outcome === 'accepted').length).toBeGreaterThanOrEqual(1);
  expect(events.filter(event => event.type === 'review-attempt-finished').length).toBeGreaterThan(0);
  expect(events.filter((event): event is Extract<typeof event, { type: 'reconciliation-assessed' }> =>
    event.type === 'reconciliation-assessed' && event.data.workItem === 'cap-001')
    .map(event => event.data.next)).toEqual(['correct', 'complete']);
  expect(events.filter(event => event.type === 'capability-assigned' && event.data.corrects === 'cap-001.rc01')).toHaveLength(1);
  expect(events.filter(event => event.type === 'iteration-closed' && event.data.checkFindings?.some(finding =>
    finding.type === 'check-finding-decided' && finding.data.decision.decision.action === 'claim-repair'))).toHaveLength(1);
  // Every configured check passed. Actual child-test execution is established
  // by the dedicated real-boundary witness; ordinary answers are synthetic.
  expect(lastGateBody?.commands).toEqual([]);
  const lastChecks = lastGateBody?.provider?.checks as Record<string, { passed: boolean; output: string }> | undefined;
  expect(Object.entries(lastChecks ?? {}).map(([id, check]) => [id, check.passed])).toEqual([
    ['tests', true], ['type-check', true], ['ramify-check', true],
  ]);
  expect(lastChecks!['tests']!.output).toContain('subs/a/src/tests/caller.test.ts');
  expect(lastChecks!['tests']!.output).toContain('subs/b/src/tests/fact.test.ts');
  const handback = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/cap-001/handback.json'), 'utf8')) as { deltaFromSuspension: string[]; returnedTree: string };
  expect(handback.deltaFromSuspension).toContain('subs/b/src/fact.ts');
  expect(handback.deltaFromSuspension).toContain('subs/a/src/tests/caller.test.ts');
  expect(handback.deltaFromSuspension).not.toContain('subs/a/src/extra.ts');
  const request = JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId,
    'capabilities/requests/need-001.json'), 'utf8')) as { source: { tree: string } };
  if (realBoundary) expect(execFileSync('git', ['cat-file', '-t', request.source.tree], { cwd: fixture.root, encoding: 'utf8' }).trim()).toBe('tree');
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
      event.type === 'writer-acquired' && event.data.invocation === resumedA.data.invocation) && suspendedContinuationStarted, 30_000);
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
      const gates = await Promise.all(current.filter(event => event.type === 'gate-attempted' && event.data.checkpoint === 'work-item')
        .map(async event => event.type === 'gate-attempted'
          ? JSON.parse(await readFile(runPath(fixture.root, 'need', receipt.jobId, `gates/${event.data.gate}/attempt.json`), 'utf8')) : null));
      throw new Error(`B did not start: ${JSON.stringify({ events: current.slice(-30), gates })}`);
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
  // The ledger event becomes observable before its record files finish
  // materializing. Wait for the projection this assertion actually reads.
  let revisionTaskText = '';
  await until(async () => {
    try {
      revisionTaskText = await readFile(runPath(fixture.root, 'need', receipt.jobId,
        'capabilities/cap-002/task.json'), 'utf8');
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }, 30_000);
  const revisionTask = JSON.parse(revisionTaskText) as { revises?: { handback: { id: string; hash: string }; sourceRevision: string } };
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

/** The checkpoint of the gate a configured request belongs to: its operation record, or readiness, which writes none. */
async function gateCheckpoint(root: string, input: ConfiguredAuditInput): Promise<Checkpoint> {
  try {
    const operation = JSON.parse(await readFile(join(root, 'plans/need/.harness/jobs', input.runId, 'gates', input.attemptId, 'operation.json'), 'utf8')) as
      { checkpoint?: Checkpoint; body?: { checkpoint?: Checkpoint } };
    return operation.checkpoint ?? operation.body?.checkpoint ?? 'readiness';
  } catch {
    return 'readiness';
  }
}
