import { describe, expect, test } from 'vitest';
import { errorHttpStatus, errorResponseSchema } from '../interfaces/protocol/errors.js';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';
import { commandSchema, eventPageSchema, jobEventSchema, receiptSchema, type JobSnapshot } from '../interfaces/protocol/jobs.js';
import { moduleTreeResponseSchema, revisionListResponseSchema } from '../interfaces/protocol/maps.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { mappingStateSchema, planListResponseSchema, planResponseSchema, projectResponseSchema } from '../interfaces/protocol/queries.js';

describe('queries', () => {
  test('a plan list carries readable and unreadable entries', () => {
    const list = {
      plans: [
        { status: 'readable', id: 'a', title: 'A', path: 'plans/a/plan.md', mapping: { state: 'not-mapped' } },
        { status: 'unreadable', id: 'b', path: 'plans/b/plan.md', message: 'EISDIR' },
      ],
    };
    expect(planListResponseSchema.parse(list)).toEqual(list);
  });

  test('a readable entry needs a mapping state and rejects unknown fields', () => {
    const entry = { status: 'readable', id: 'a', title: 'A', path: 'plans/a/plan.md' };
    expect(planListResponseSchema.safeParse({ plans: [entry] }).success).toBe(false);
    expect(planListResponseSchema.safeParse({ plans: [{ ...entry, mapping: { state: 'not-mapped' }, extra: 1 }] }).success).toBe(false);
  });

  test('plan IDs are one non-hidden path segment', () => {
    for (const id of ['review-notes', 'Plan 2', 'v1.2']) expect(planIdSchema.safeParse(id).success).toBe(true);
    for (const id of ['', '.harness', '..', 'a/b', 'a\\b']) expect(planIdSchema.safeParse(id).success).toBe(false);
  });

  test('project and plan responses', () => {
    expect(projectResponseSchema.safeParse({
      protocolVersion: 1,
      project: { name: 'p', root: '/tmp/p', planPattern: 'plans/<plan-id>/plan.md' },
    }).success).toBe(true);
    expect(planResponseSchema.safeParse({
      plan: { id: 'a', title: 'A', path: 'plans/a/plan.md', markdown: '# A', mapping: { state: 'not-mapped' } },
    }).success).toBe(true);
  });
});

describe('errors', () => {
  test('every code has an HTTP status and the shape is strict', () => {
    expect(errorHttpStatus['not-found']).toBe(404);
    expect(errorResponseSchema.safeParse({ error: { code: 'stale-version', message: 'm', currentVersion: 3 } }).success).toBe(true);
    expect(errorResponseSchema.safeParse({ error: { code: 'teapot', message: 'm' } }).success).toBe(false);
  });
});

describe('jobs', () => {
  const at = '2026-09-19T12:00:00.000Z';
  const receipt = { commandId: 'c1', jobId: 'j1', sequence: 1, acceptedAt: at };
  const snapshot: JobSnapshot = {
    jobId: 'j1', planId: 'a', agent: 'scripted', version: 1, state: 'running', stopRequested: false,
    startedAt: at, updatedAt: at, endedAt: null,
    inputs: { planHash: 'h', source: null, architectView: 'placeholder' },
    revision: null, failure: null,
    totals: { filesRead: 0, searches: 0, rejectedSubmissions: 0, usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  };

  test('commands carry an ID, an expected version and a typed payload', () => {
    expect(commandSchema.safeParse({ commandId: 'c1', expectedVersion: 0, type: 'start-mapping', payload: { planId: 'a' } }).success).toBe(true);
    expect(commandSchema.safeParse({ commandId: 'c2', expectedVersion: 4, type: 'stop-job', payload: { planId: 'a', jobId: 'j1' } }).success).toBe(true);
    expect(commandSchema.safeParse({ commandId: 'c3', expectedVersion: 9, type: 'approve-map', payload: { planId: 'a', jobId: 'j1', revision: 1 } }).success).toBe(true);
    expect(commandSchema.safeParse({ commandId: 'c1', type: 'start-mapping', payload: { planId: 'a' } }).success).toBe(false);
    expect(commandSchema.safeParse({ commandId: 'c1', expectedVersion: 0, type: 'start', payload: {} }).success).toBe(false);
    expect(commandSchema.safeParse({ commandId: 'c1', expectedVersion: 0, type: 'stop-job', payload: { planId: 'a' } }).success).toBe(false);
  });

  test('events are typed by their type', () => {
    const started = { sequence: 1, jobId: 'j1', type: 'job-started', at, data: { command: { commandId: 'c1', contentHash: 'x', receipt } } };
    expect(jobEventSchema.parse(started)).toEqual(started);
    expect(jobEventSchema.safeParse({ ...started, data: null }).success).toBe(false);
    const activity = { sequence: 2, jobId: 'j1', type: 'activity', at, data: { activity: { kind: 'read', callId: 'c', path: 'module.ramify' } } };
    expect(jobEventSchema.safeParse(activity).success).toBe(true);
    expect(jobEventSchema.safeParse({ ...activity, type: 'progress' }).success).toBe(false);
    const evidence = { sequence: 3, jobId: 'j1', type: 'api-view-materialized', at, data: { module: 'shop/orders', views: [{ area: 'src', path: 'subs/orders/src/.ramify', revision: 'rev/1:x:1', coverage: null }] } };
    expect(jobEventSchema.safeParse(evidence).success).toBe(true);
    expect(jobEventSchema.safeParse({ ...evidence, data: { ...evidence.data, views: [{ ...evidence.data.views[0], area: 'lib' }] } }).success).toBe(false);
    expect(jobEventSchema.safeParse({ sequence: 4, jobId: 'j1', type: 'job-failed', at, data: { reason: 'evidence-unavailable', message: 'm', diagnostics: [] } }).success).toBe(true);
  });

  test('a receipt and an event page', () => {
    expect(receiptSchema.safeParse(receipt).success).toBe(true);
    expect(eventPageSchema.safeParse({
      job: snapshot,
      events: [{ sequence: 1, jobId: 'j1', type: 'job-interrupted', at, data: { message: 'm' } }],
      cursor: 1,
      more: false,
    }).success).toBe(true);
  });

  test('mapping states name the latest job', () => {
    expect(mappingStateSchema.safeParse({ state: 'running', jobId: 'j1', latestRevision: null }).success).toBe(true);
    expect(mappingStateSchema.safeParse({ state: 'completed', jobId: 'j1', latestRevision: 2 }).success).toBe(true);
    expect(mappingStateSchema.safeParse({ state: 'running' }).success).toBe(false);
    expect(mappingStateSchema.safeParse({ state: 'not-mapped', jobId: 'j1' }).success).toBe(false);
  });

  test('job IDs', () => {
    expect(jobIdSchema.safeParse('20260919T120000Z-a1b2c3').success).toBe(true);
    for (const id of ['', '-x', 'a/b', 'a.b']) expect(jobIdSchema.safeParse(id).success).toBe(false);
  });
});

test('paths encode their IDs', () => {
  expect(protocolPaths.plan('a b')).toBe('/api/v1/plans/a%20b');
  expect(protocolPaths.events('a b', 'j1', 3)).toBe('/api/v1/plans/a%20b/jobs/j1/events?after=3');
  expect(protocolPaths.commands).toBe('/api/v1/commands');
  expect(protocolPaths.map('a b', 2)).toBe('/api/v1/plans/a%20b/maps/2');
  expect(protocolPaths.modules).toBe('/api/v1/project/modules');
});

describe('maps and approvals', () => {
  const approval = {
    schema: 'ramify-agent.map-approval/1', planId: 'a', revision: 1, mapHash: 'b'.repeat(64), planHash: 'c'.repeat(64),
    input: 'input/1:abc', approvedAt: '2026-09-19T12:00:00.000Z',
  };
  const accepted = { commandId: 'c', contentHash: 'x', receipt: { commandId: 'c', jobId: 'j1', sequence: 9, acceptedAt: '2026-09-19T12:00:00.000Z' } };

  test('a revision list carries approvals and unreadable files', () => {
    const list = {
      revisions: [
        { status: 'readable', revision: 2, path: 'plans/a/map/002.json', jobId: 'j2', mapHash: 'd'.repeat(64), approval: null },
        { status: 'readable', revision: 1, path: 'plans/a/map/001.json', jobId: 'j1', mapHash: 'b'.repeat(64), approval },
        { status: 'unreadable', revision: 3, path: 'plans/a/map/003.json', message: 'Not a valid implementation map' },
      ],
    };
    expect(revisionListResponseSchema.parse(list)).toEqual(list);
    expect(revisionListResponseSchema.safeParse({ revisions: [{ ...list.revisions[1], approval: { ...approval, extra: 1 } }] }).success).toBe(false);
  });

  test('map-approved holds the command and the approval record', () => {
    const event = { sequence: 9, jobId: 'j1', type: 'map-approved', at: '2026-09-19T12:00:00.000Z', data: { command: accepted, approval } };
    expect(jobEventSchema.parse(event)).toEqual(event);
    expect(jobEventSchema.safeParse({ ...event, data: { command: accepted, approval: { ...approval, mapHash: 'short' } } }).success).toBe(false);
  });

  test('a stale approval is a 409 inputs-changed error', () => {
    expect(errorHttpStatus['inputs-changed']).toBe(409);
    expect(errorResponseSchema.safeParse({ error: { code: 'inputs-changed', message: 'stale' } }).success).toBe(true);
  });

  test('the module tree is available with the view\'s identity, or unavailable with a reason', () => {
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'available', revision: 'r', input: 'i', modules: [{ module: 'app', dir: '', parent: null }] } }).success).toBe(true);
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'unavailable', message: 'not materialized' } }).success).toBe(true);
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'available', modules: [] } }).success).toBe(false);
  });
});
