import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createApp } from '../http/app.js';
import {
  checkFindingDetailSchema, checkFindingListResponseSchema, checkFindingModuleCountsSchema, reviewListResponseSchema,
  type CheckFindingUserCommand,
} from '../interfaces/protocol/check-findings.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { commandResponseSchema } from '../interfaces/protocol/jobs.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { CommandRejection } from '../jobs/commands.js';
import type { RunService } from '../run/service.js';
import { concern, decision, dispose, failure, report } from './helpers/check-findings.js';
import { expectNoProcesses, forgetExternalTools } from './helpers/external-tools.js';
import { copyFixture } from './helpers/fixture.js';
import { approveRun, emptyAnalysis, installTestRunner, onlyRun, runEventsOnDisk, staleCrashLock, startRun, until } from './helpers/runs.js';
import { assertUnchangedGit, openUnchangedRuns as openRuns } from './helpers/unchanged-run.js';

vi.mock('node:child_process', async original =>
  (await import('./helpers/process-guard.js')).guardedChildProcess(await original<typeof import('node:child_process')>()));

/*
 * A person's CheckFinding commands and the CheckFinding queries, over a run
 * the service drives and over HTTP. The run waits at its review stop, so
 * nothing but the test writes; its CheckFindings are recorded as the
 * producers and the reconciliation record them. The run's test policy asks
 * for no reviews, like a run begun before reviews existed, so its coverage
 * is unavailable.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  try { assertUnchangedGit(); expectNoProcesses(); } finally { forgetExternalTools(); }
});

const plan = 'review-notes';
const finalVerification = `final verification of plan "${plan}"`;

async function target() {
  const fixture = await copyFixture();
  cleanups.push(fixture.remove);
  await installTestRunner(fixture.root);
  return fixture.root;
}

/**
 * A run at its review stop with four CheckFindings of wi-001: cf-0001 a
 * concern awaiting a person's decision, cf-0002 a concern the local
 * architect waived, cf-0003 a required scenario failure, cf-0004 an open
 * concern.
 */
async function waitingRun(service: RunService, commandId: string): Promise<string> {
  const receipt = await service.execute(startRun(plan, 'scripted', commandId, true));
  const runId = receipt.jobId;
  await until(() => service.getRun(plan, runId)?.phase === 'awaiting-review');
  const produced = await service.recordCheckFindings(plan, runId, {
    cause: { kind: 'producer', producer: 'review:code', attempt: 'rq-0001.a01' },
    commands: [
      report(concern({ summary: 'The API conflicts with the plan' })),
      report(concern({ key: 'concern-02', summary: 'A helper is duplicated' })),
    ],
  });
  expect(produced).toMatchObject({ kind: 'committed' });
  await service.recordCheckFindings(plan, runId, {
    cause: { kind: 'producer', producer: 'check:scenario', attempt: 'ga-0005' },
    commands: [report(failure({ attempt: 'ga-0005', subject: 'scenario:sc-004', tree: 't-02' }))],
  });
  await service.recordCheckFindings(plan, runId, {
    cause: { kind: 'producer', producer: 'review:code', attempt: 'rq-0002.a01' },
    commands: [report(concern({ attempt: 'rq-0002.a01', summary: 'Logging is verbose' }))],
  });
  const assessed = await service.recordCheckFindings(plan, runId, {
    cause: { kind: 'recovery', detail: 'the reconciliation of wi-001' },
    commands: [
      dispose('cf-0001', 1, decision({
        action: 'request-user-decision', authority: { kind: 'work-item-assessment', ref: 'wi-001.rc01' },
        conflicts: [{ text: 'The API returns a list.', document: 'plans/review-notes/plan.md', revision: 'sha256:plan' }],
        options: [{ id: 'keep', summary: 'Keep the page', consequence: 'The plan text is not met' }, { id: 'list', summary: 'Return a list', consequence: 'Callers change' }],
      })),
      dispose('cf-0002', 1, decision({ action: 'waive', authority: { kind: 'work-item-assessment', ref: 'wi-001.rc01' }, acceptedRisk: 'medium', uncertainty: 'little' })),
    ],
  });
  expect(assessed).toMatchObject({ kind: 'committed' });
  return runId;
}

function command<T extends CheckFindingUserCommand['type']>(
  type: T,
  runId: string,
  expectedVersion: number,
  payload: Record<string, unknown>,
  commandId = `${type}-${Math.random().toString(36).slice(2)}`,
): Extract<CheckFindingUserCommand, { type: T }> {
  return { commandId, expectedVersion, type, payload: { planId: plan, jobId: runId, responder: 'dan', ...payload } } as Extract<CheckFindingUserCommand, { type: T }>;
}

async function rejection(promise: Promise<unknown>): Promise<CommandRejection> {
  const caught = await promise.then(() => undefined, (error: unknown) => error);
  expect(caught).toBeInstanceOf(CommandRejection);
  return caught as CommandRejection;
}

async function serve(service: RunService, root: string): Promise<string> {
  const app = createApp({ projectRoot: root, runs: service });
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  cleanups.push(() => new Promise<void>(resolve => server.close(() => resolve())));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

async function get(origin: string, path: string) {
  const response = await fetch(`${origin}${path}`);
  return { status: response.status, body: await response.json() as unknown };
}

async function post(origin: string, body: unknown) {
  const response = await fetch(`${origin}${protocolPaths.commands}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as unknown };
}

describe('a person\'s CheckFinding commands', () => {
  test('an answer, a waiver and a revocation commit one decision each; a retry returns its receipt; conflicts, stale revisions and stale versions are refused', async () => {
    const root = await target();
    const { service } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }] });
    cleanups.push(() => service.close());
    const runId = await waitingRun(service, 'start-cf-commands');
    const version = () => service.getRun(plan, runId)!.version;
    const entry = (id: string) => {
      const detail = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: id });
      if (detail === undefined || !detail.ok || detail.view.kind !== 'detail') throw new Error(`no ${id}`);
      return detail.view.summary;
    };

    // The answer names the pending request and one of its options.
    const answer = command('respond-to-check-finding', runId, version(), { checkFinding: 'cf-0001', expectedRevision: 2, request: 'cfd-0001', option: 'list', note: 'Callers can change' }, 'answer-1');
    const receipt = await service.execute(answer);
    expect(entry('cf-0001')).toMatchObject({ standing: 'open', reason: 'user-decision-answered', revision: 3, pendingUserDecision: null });
    // A retry returns the original receipt and appends nothing, though the run's version has moved on since.
    const lines = (await runEventsOnDisk(root, plan, runId)).length;
    expect(await service.execute(answer)).toEqual(receipt);
    expect((await runEventsOnDisk(root, plan, runId)).length).toBe(lines);
    // The same command ID with other content is a conflict.
    expect(await rejection(service.execute({ ...answer, payload: { ...answer.payload, option: 'keep' } }))).toMatchObject({ code: 'conflict' });
    // The request is no longer pending.
    expect(await rejection(service.execute(command('respond-to-check-finding', runId, version(), { checkFinding: 'cf-0001', expectedRevision: 3, request: 'cfd-0001', option: 'keep' }))))
      .toMatchObject({ code: 'conflict', message: expect.stringContaining('not the pending decision request') });

    // A stale revision is refused with the current one, and nothing is appended.
    const stale = await rejection(service.execute(command('waive-check-finding', runId, version(), { checkFinding: 'cf-0004', expectedRevision: 2, reason: 'fine as it is' })));
    expect(stale).toMatchObject({ code: 'conflict', evidence: ['cf-0004 is at revision 1'] });
    // A stale run version is refused with the current version.
    expect(await rejection(service.execute(command('waive-check-finding', runId, version() - 1, { checkFinding: 'cf-0004', expectedRevision: 1, reason: 'fine' }))))
      .toMatchObject({ code: 'stale-version', currentVersion: version() });
    // A required check is waived by no one, the user included.
    expect(await rejection(service.execute(command('waive-check-finding', runId, version(), { checkFinding: 'cf-0003', expectedRevision: 1, reason: 'it is flaky' }))))
      .toMatchObject({ code: 'conflict', message: expect.stringContaining('required-obligation') });
    expect((await runEventsOnDisk(root, plan, runId)).length).toBe(lines);
    // An unknown CheckFinding is not found; an unknown option is the request's fault.
    expect(await rejection(service.execute(command('waive-check-finding', runId, version(), { checkFinding: 'cf-0099', expectedRevision: 1, reason: 'x' })))).toMatchObject({ code: 'not-found' });

    // The person waives an open concern: the waiver names the person, the command and the current risk.
    await service.execute(command('waive-check-finding', runId, version(), { checkFinding: 'cf-0004', expectedRevision: 1, reason: 'Logging is configured elsewhere' }));
    const waived = service.checkFindings(plan, runId, { kind: 'detail', checkFinding: 'cf-0004' });
    expect(waived).toMatchObject({ ok: true, view: { summary: { standing: 'closed', reason: 'waived' }, decisions: { items: [{
      actor: { kind: 'user', name: 'dan' }, rationale: 'Logging is configured elsewhere',
      decision: { action: 'waive', authority: { kind: 'user-decision' }, acceptedRisk: 'medium' },
    }] } } });

    // The person revokes the architect's waiver: a user's rank is above every agent's.
    await service.execute(command('revoke-check-finding-waiver', runId, version(), { checkFinding: 'cf-0002', expectedRevision: 2, reason: 'The duplicate will drift' }));
    expect(entry('cf-0002')).toMatchObject({ standing: 'open', reason: 'waiver-revoked', revision: 3 });
    // Revoking what is not waived is refused by the child.
    expect(await rejection(service.execute(command('revoke-check-finding-waiver', runId, version(), { checkFinding: 'cf-0002', expectedRevision: 3, reason: 'again' }))))
      .toMatchObject({ code: 'conflict', message: expect.stringContaining('not-waived') });

    // Each accepted command is one line that holds it.
    const recorded = (await runEventsOnDisk(root, plan, runId)).filter(event => event.type === 'check-findings-recorded' && event.data.cause.kind === 'user-command');
    expect(recorded.map(event => event.type === 'check-findings-recorded' && event.data.cause.kind === 'user-command' ? event.data.cause.command.commandId : null))
      .toEqual(['answer-1', expect.any(String), expect.any(String)]);
    expect(recorded[0]).toMatchObject({ sequence: receipt.sequence });

    // After a restart the answer is remembered from the log: its retry returns the original receipt.
    await service.close();
    await staleCrashLock(root);
    const restarted = await openRuns(root, { script: [] });
    cleanups.push(() => restarted.service.close());
    expect(await restarted.service.execute(answer)).toEqual(receipt);
    // The recovered run is interrupted: it accepts no new command.
    expect(await rejection(restarted.service.execute(command('waive-check-finding', runId, restarted.service.getRun(plan, runId)!.version, { checkFinding: 'cf-0002', expectedRevision: 3, reason: 'late' }))))
      .toMatchObject({ code: 'conflict', message: expect.stringContaining('has ended') });
  }, 120_000);

  test('over HTTP: bounded, versioned lists, details, module counts and reviews, unavailable coverage for a run without reviews, and commands', async () => {
    const root = await target();
    const { service } = await openRuns(root, { script: [{ kind: 'submit', input: emptyAnalysis() }], unchangedCheckpoints: [finalVerification] });
    cleanups.push(() => service.close());
    const runId = await waitingRun(service, 'start-cf-http');
    const origin = await serve(service, root);
    const version = service.getRun(plan, runId)!.version;

    const listed = await get(origin, protocolPaths.runCheckFindings(plan, runId, { version, workItem: 'wi-001', select: 'all' }));
    expect(listed.status).toBe(200);
    const list = checkFindingListResponseSchema.parse(listed.body);
    expect(list).toMatchObject({ version, total: 4, shown: 4, next: null, coverage: { state: 'unavailable', reason: 'no-review-policy' } });
    expect(list.items[0]).toMatchObject({ id: 'cf-0003', risk: 'high', credibility: 'objective', required: true, userCommands: [] });
    const page = checkFindingListResponseSchema.parse((await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all', limit: 2 }))).body);
    expect(page).toMatchObject({ total: 4, shown: 2, next: page.items[1]!.id });
    const rest = checkFindingListResponseSchema.parse((await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all', limit: 2, after: page.next! }))).body);
    expect([...page.items, ...rest.items].map(item => item.id)).toEqual(list.items.map(item => item.id));
    expect(rest.next).toBeNull();
    // The default selection holds the open ones only.
    expect(checkFindingListResponseSchema.parse((await get(origin, protocolPaths.runCheckFindings(plan, runId))).body).items.map(item => item.id).sort())
      .toEqual(['cf-0001', 'cf-0003', 'cf-0004']);
    const byModule = checkFindingListResponseSchema.parse((await get(origin, protocolPaths.runCheckFindings(plan, runId, { module: 'project/checkout', select: 'all' }))).body);
    expect(byModule.items.map(item => item.id)).toEqual(['cf-0003']);

    // A stale version is refused with the current one; bounds and values are refused as invalid.
    const stale = await get(origin, protocolPaths.runCheckFindings(plan, runId, { version: version - 1 }));
    expect(stale.status).toBe(409);
    expect(errorResponseSchema.parse(stale.body).error).toMatchObject({ code: 'stale-version', currentVersion: version });
    for (const bad of ['limit=0', 'limit=101', 'select=resolved', 'order=newest', 'after=cf-9999', 'after=notes', 'version=x']) {
      const answer = await get(origin, `${protocolPaths.runCheckFindings(plan, runId)}?${bad}`);
      expect([bad, answer.status]).toEqual([bad, 400]);
    }
    expect((await get(origin, protocolPaths.runCheckFinding(plan, runId, 'cf-9999'))).status).toBe(404);
    expect((await get(origin, protocolPaths.runCheckFinding(plan, runId, 'not-an-id'))).status).toBe(404);
    expect((await get(origin, protocolPaths.runCheckFindings(plan, 'no-such-run'))).status).toBe(404);

    const detail = checkFindingDetailSchema.parse((await get(origin, protocolPaths.runCheckFinding(plan, runId, 'cf-0001', version))).body);
    expect(detail.summary).toMatchObject({ pendingUserDecision: { request: 'cfd-0001', options: [{ id: 'keep' }, { id: 'list' }] }, userCommands: ['respond'] });
    expect(detail.decisions.items[0]!.action).toMatchObject({ action: 'request-user-decision', conflicts: [{ text: 'The API returns a list.' }] });
    const modules = checkFindingModuleCountsSchema.parse((await get(origin, protocolPaths.runCheckFindingModules(plan, runId, version))).body);
    expect(modules.modules).toEqual([
      { module: 'project/cart', open: 2, deferred: 0, unresolved: 0, highestOpenRisk: 'medium', pendingUserDecisions: 1 },
      { module: 'project/checkout', open: 1, deferred: 0, unresolved: 0, highestOpenRisk: 'high', pendingUserDecisions: 0 },
    ]);
    const reviews = reviewListResponseSchema.parse((await get(origin, protocolPaths.runReviews(plan, runId, { workItem: 'wi-001' }))).body);
    expect(reviews).toMatchObject({ total: 0, requests: [], coverage: { state: 'unavailable', reason: 'no-review-policy' } });

    // Commands over HTTP: accepted with a receipt, then retried, then refused as stale.
    const waive = command('waive-check-finding', runId, version, { checkFinding: 'cf-0004', expectedRevision: 1, reason: 'fine as it is' }, 'waive-http');
    const accepted = await post(origin, waive);
    expect(accepted.status).toBe(202);
    const receipt = commandResponseSchema.parse(accepted.body).receipt;
    expect(commandResponseSchema.parse((await post(origin, waive)).body).receipt).toEqual(receipt);
    const conflicting = await post(origin, { ...waive, commandId: 'waive-http-2', expectedVersion: receipt.sequence });
    expect(conflicting.status).toBe(409);
    expect(errorResponseSchema.parse(conflicting.body).error).toMatchObject({ code: 'conflict', evidence: ['cf-0004 is at revision 2'] });
    const unknownOption = await post(origin, command('respond-to-check-finding', runId, receipt.sequence, { checkFinding: 'cf-0001', expectedRevision: 2, request: 'cfd-0001', option: 'other' }));
    expect(unknownOption.status).toBe(400);
    expect((await post(origin, { ...waive, commandId: 'mark-resolved', type: 'resolve-check-finding' })).status).toBe(400);
    const after = checkFindingListResponseSchema.parse((await get(origin, protocolPaths.runCheckFindings(plan, runId, { version: receipt.sequence, select: 'all' }))).body);
    expect(after.items.find(item => item.id === 'cf-0004')).toMatchObject({ standing: 'closed', reason: 'waived', settlement: { kind: 'waived', by: { kind: 'user', name: 'dan' } }, userCommands: ['revoke'] });

    // A waiver passes no gate: the run completes on its own gates' verdicts, and then accepts no command.
    await service.execute(approveRun(plan, runId, service.getRun(plan, runId)!.version));
    await service.settled(plan, runId);
    expect(onlyRun(service, plan)).toMatchObject({ state: 'completed' });
    const ended = checkFindingListResponseSchema.parse((await get(origin, protocolPaths.runCheckFindings(plan, runId, { select: 'all' }))).body);
    expect(ended.items.every(item => item.userCommands.length === 0)).toBe(true);
    const late = await post(origin, command('revoke-check-finding-waiver', runId, service.getRun(plan, runId)!.version, { checkFinding: 'cf-0004', expectedRevision: 2, reason: 'late' }));
    expect(late.status).toBe(409);
  }, 120_000);
});
