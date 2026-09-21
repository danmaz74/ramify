import { describe, expect, test } from 'vitest';
import { errorHttpStatus, errorResponseSchema } from '../interfaces/protocol/errors.js';
import { jobIdSchema, planIdSchema } from '../interfaces/protocol/ids.js';
import { acceptedCommandSchema, activitySchema, apiViewEvidenceSchema, receiptSchema, stopJobCommandSchema } from '../interfaces/protocol/jobs.js';
import { citationSchema, inputManifestSchema, modulePathSchema, moduleTreeResponseSchema, sha256Schema, viewIdentitySchema } from '../interfaces/protocol/evidence.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { planListResponseSchema, planResponseSchema, projectResponseSchema } from '../interfaces/protocol/queries.js';

describe('queries', () => {
  test('a plan list carries readable and unreadable entries', () => {
    const list = {
      plans: [
        { status: 'readable', id: 'a', title: 'A', path: 'plans/a/plan.md' },
        { status: 'unreadable', id: 'b', path: 'plans/b/plan.md', message: 'EISDIR' },
      ],
    };
    expect(planListResponseSchema.parse(list)).toEqual(list);
  });

  test('a readable entry rejects unknown fields', () => {
    const entry = { status: 'readable', id: 'a', title: 'A', path: 'plans/a/plan.md' };
    expect(planListResponseSchema.safeParse({ plans: [entry] }).success).toBe(true);
    expect(planListResponseSchema.safeParse({ plans: [{ ...entry, extra: 1 }] }).success).toBe(false);
    expect(planListResponseSchema.safeParse({ plans: [{ status: 'readable', id: 'a', path: 'plans/a/plan.md' }] }).success).toBe(false);
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
      plan: { id: 'a', title: 'A', path: 'plans/a/plan.md', markdown: '# A' },
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

  test('the stop command carries an ID, an expected version and a typed payload', () => {
    expect(stopJobCommandSchema.safeParse({ commandId: 'c2', expectedVersion: 4, type: 'stop-job', payload: { planId: 'a', jobId: 'j1' } }).success).toBe(true);
    expect(stopJobCommandSchema.safeParse({ commandId: 'c2', type: 'stop-job', payload: { planId: 'a', jobId: 'j1' } }).success).toBe(false);
    expect(stopJobCommandSchema.safeParse({ commandId: 'c2', expectedVersion: 4, type: 'stop-job', payload: { planId: 'a' } }).success).toBe(false);
  });

  test('a receipt and the accepted command that records it', () => {
    expect(receiptSchema.safeParse(receipt).success).toBe(true);
    expect(acceptedCommandSchema.safeParse({ commandId: 'c1', contentHash: 'x', receipt }).success).toBe(true);
    expect(acceptedCommandSchema.safeParse({ commandId: 'c1', receipt }).success).toBe(false);
  });

  test('observed activity is typed by its kind', () => {
    expect(activitySchema.safeParse({ kind: 'read', callId: 'c', path: 'module.ramify' }).success).toBe(true);
    expect(activitySchema.safeParse({ kind: 'message', text: 'hello', usage: null }).success).toBe(true);
    expect(activitySchema.safeParse({ kind: 'progress', text: 'x' }).success).toBe(false);
  });

  test('API-view evidence names one source area of one module', () => {
    const evidence = { module: 'shop/orders', views: [{ area: 'src', path: 'subs/orders/src/.ramify', revision: 'rev/1:x:1', coverage: null }] };
    expect(apiViewEvidenceSchema.parse(evidence)).toEqual(evidence);
    expect(apiViewEvidenceSchema.safeParse({ ...evidence, views: [{ ...evidence.views[0], area: 'lib' }] }).success).toBe(false);
  });

  test('job IDs', () => {
    expect(jobIdSchema.safeParse('20260919T120000Z-a1b2c3').success).toBe(true);
    for (const id of ['', '-x', 'a/b', 'a.b']) expect(jobIdSchema.safeParse(id).success).toBe(false);
  });
});

test('paths encode their IDs', () => {
  expect(protocolPaths.plan('a b')).toBe('/api/v1/plans/a%20b');
  expect(protocolPaths.plans).toBe('/api/v1/plans');
  expect(protocolPaths.modules).toBe('/api/v1/project/modules');
  expect(protocolPaths.commands).toBe('/api/v1/commands');
  expect(protocolPaths.runs('a b')).toBe('/api/v1/plans/a%20b/runs');
  expect(protocolPaths.runEvents('p', 'r/1', 7)).toBe('/api/v1/plans/p/runs/r%2F1/events?after=7');
  expect(protocolPaths.runWorkItem('p', 'r', 'wi-001')).toBe('/api/v1/plans/p/runs/r/work-items/wi-001');
  expect(protocolPaths.runGate('p', 'r', 'ga 1')).toBe('/api/v1/plans/p/runs/r/gates/ga%201');
  for (const path of [protocolPaths.runAnalysis('p', 'r'), protocolPaths.runDecisions('p', 'r'), protocolPaths.runWorkItems('p', 'r'), protocolPaths.runCapabilities('p', 'r'), protocolPaths.runMetrics('p', 'r')]) {
    expect(path.startsWith('/api/v1/plans/p/runs/r/')).toBe(true);
  }
});

describe('the evidence a run works from', () => {
  test('a module path is a declared-name path from the root', () => {
    for (const path of ['app', 'app/orders', 'ramify-agent/harness/agent']) expect(modulePathSchema.safeParse(path).success).toBe(true);
    for (const path of ['', '/app', 'app/', 'app orders']) expect(modulePathSchema.safeParse(path).success).toBe(false);
  });

  test('a digest is lowercase hexadecimal of the right length', () => {
    expect(sha256Schema.safeParse('a'.repeat(64)).success).toBe(true);
    expect(sha256Schema.safeParse('A'.repeat(64)).success).toBe(false);
    expect(sha256Schema.safeParse('a'.repeat(63)).success).toBe(false);
  });

  test('a citation names a module, and may narrow it to a file and a symbol', () => {
    expect(citationSchema.safeParse({ module: 'app/orders' }).success).toBe(true);
    expect(citationSchema.safeParse({ module: 'app/orders', file: 'subs/orders/src/x.ts', symbol: 'price', note: 'why' }).success).toBe(true);
    expect(citationSchema.safeParse({ module: 'app/orders', extra: 1 }).success).toBe(false);
    expect(citationSchema.safeParse({ file: 'x.ts' }).success).toBe(false);
  });

  test('a view identity is a placeholder or a materialization', () => {
    expect(viewIdentitySchema.safeParse({ status: 'placeholder' }).success).toBe(true);
    expect(viewIdentitySchema.safeParse({ status: 'materialized', revision: 'r', input: 'i', coverageLimits: [] }).success).toBe(true);
    expect(viewIdentitySchema.safeParse({ status: 'materialized', revision: 'r' }).success).toBe(false);
  });

  test('an input manifest carries the plan hash, the checkout and the view', () => {
    const manifest = {
      planHash: 'a'.repeat(64),
      source: { commit: 'abc', dirty: false },
      versions: { architectPrompt: '1', procedure: '1', skill: '1', ramify: '1' },
      architectView: { status: 'placeholder' },
    };
    expect(inputManifestSchema.parse(manifest)).toEqual(manifest);
    expect(inputManifestSchema.safeParse({ ...manifest, planHash: 'short' }).success).toBe(false);
    expect(inputManifestSchema.safeParse({ ...manifest, source: null }).success).toBe(true);
  });

  test('the module tree is available with the view\'s identity, or unavailable with a reason', () => {
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'available', revision: 'r', input: 'i', modules: [{ module: 'app', dir: '', parent: null }] } }).success).toBe(true);
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'unavailable', message: 'not materialized' } }).success).toBe(true);
    expect(moduleTreeResponseSchema.safeParse({ tree: { status: 'available', modules: [] } }).success).toBe(false);
  });
});
