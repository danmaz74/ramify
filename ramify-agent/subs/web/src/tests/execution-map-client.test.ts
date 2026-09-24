import { expect, test } from 'vitest';
import { protocolPaths } from '../../../harness/src/interfaces/protocol/paths.js';
import { ClientError, createProtocolClient } from '../client.js';
import { loadExecutionMapPages } from '../execution-map-client.js';
import { executionPages } from './helpers/execution-map.js';

const runId = '20260921T080000Z-c0ffee';
const planId = 'review-notes';
const runPath = protocolPaths.run(planId, runId);
const asResponse = (status: number, body: unknown) => new Response(JSON.stringify(body),
  { status, headers: { 'content-type': 'application/json' } });

function run(version: number) {
  return { run: { jobId: runId, planId, agent: 'scripted', version, state: 'running', phase: 'working',
    stopRequested: false, startedAt: '2026-09-24T00:00:00.000Z', updatedAt: '2026-09-24T00:00:00.000Z',
    endedAt: null, failure: null, current: null, waits: [],
    counts: { workItems: 0, completedWorkItems: 0, openRequirements: 0, invocations: 0,
      readinessAttempts: 0, gateAttempts: 0,
      scenarios: { pending: 0, bound: 0, declared: 0, implemented: 0 }, degradedStarts: 0 },
    writer: { held: null, unsettled: null }, review: 'not-reviewed', notices: [],
  } };
}

test('client completes every census, retries a changed run, and retains the coherent map on disconnect', async () => {
  let current = 42;
  let offline = false;
  const paths: string[] = [];
  const client = createProtocolClient('', async input => {
    const url = String(input);
    paths.push(url);
    if (offline) throw new TypeError('lost connection');
    if (url === runPath) return asResponse(200, run(current));
    const query = new URL(url, 'http://local').searchParams;
    const requested = Number(query.get('version'));
    const cursor = query.get('cursor');
    if (cursor !== null && current === 42) current = 43;
    if (requested !== current) return asResponse(409,
      { error: { code: 'stale-version', message: 'Run advanced', currentVersion: current } });
    return asResponse(200, executionPages(current)[cursor === null ? 0 : 1]);
  });
  const map = await client.getExecutionMap(planId, runId);
  expect(map).toMatchObject({ freshness: 'fresh', runVersion: 43 });
  expect(map.nodes).toHaveLength(110);
  expect(map.coverage).toMatchObject({ nodes: { shown: 110, total: 110 },
    moduleRelations: { shown: 110, total: 110 } });
  expect(map.moduleMap.modules.find(row => row.module === 'project/ui')?.direct).toHaveLength(110);
  expect(map.moduleMap.lines.totals.invocationIds).toEqual(['inv-001']);
  expect(map.moduleMap.lines.coverage).toBe('partial');
  expect(map.links[0]?.to).toEqual({ coverage: 'shown', key: 'work-item:wi-101' });
  expect(paths.filter(path => path === runPath)).toHaveLength(2);
  offline = true;
  const stale = await client.getExecutionMap(planId, runId);
  expect(stale).toMatchObject({ runVersion: 43, freshness: 'stale' });
  expect(client.connection()).toBe('disconnected');
});

test('client restarts on a tree refresh at the same run sequence and bounds repeated refreshes', async () => {
  let input = 'tree-input-1';
  let refreshes = 0;
  const client = createProtocolClient('', async incoming => {
    const url = String(incoming);
    if (url === runPath) return asResponse(200, run(42));
    const cursor = new URL(url, 'http://local').searchParams.get('cursor');
    if (cursor !== null && refreshes++ === 0) {
      input = 'tree-input-2';
      return asResponse(409, { error: { code: 'stale-version', message: 'Tree refreshed', currentVersion: 42 } });
    }
    return asResponse(200, executionPages(42, input)[cursor === null ? 0 : 1]);
  });
  const loaded = await client.getExecutionMap(planId, runId);
  expect(loaded.tree).toMatchObject({ status: 'available', input: 'tree-input-2' });
  expect(refreshes).toBeGreaterThan(1);

  let reads = 0;
  const churning = createProtocolClient('', async incoming => {
    const url = String(incoming);
    if (url === runPath) { reads++; return asResponse(200, run(42)); }
    const cursor = new URL(url, 'http://local').searchParams.get('cursor');
    return cursor === null ? asResponse(200, executionPages()[0])
      : asResponse(409, { error: { code: 'stale-version', message: 'Tree changed', currentVersion: 42 } });
  });
  await expect(churning.getExecutionMap(planId, runId)).rejects.toMatchObject({ code: 'stale-version' });
  expect(reads).toBe(4);
});

test('assembler refuses a page chain with a missing other-page endpoint', async () => {
  const pages = executionPages();
  pages[0].links[0]!.to = { coverage: 'other-page', key: 'work-item:missing' };
  await expect(loadExecutionMapPages(42, async cursor => pages[cursor === undefined ? 0 : 1]))
    .rejects.toMatchObject({ kind: 'invalid-response' });
});

test('targeted detail paths encode all IDs and preserve existing client routes', async () => {
  const urls: string[] = [];
  const client = createProtocolClient('http://h', async input => {
    urls.push(String(input));
    return asResponse(404, { error: { code: 'not-found', message: 'missing' } });
  });
  await expect(client.getExecutionCapability('plan id', 'run id', 'capability/one', 42)).rejects.toBeInstanceOf(ClientError);
  await expect(client.getExecutionScenario('plan id', 'run id', 'scenario/one', 42)).rejects.toBeInstanceOf(ClientError);
  await expect(client.getEvents('plan id', 'run id', 3)).rejects.toBeInstanceOf(ClientError);
  expect(urls).toEqual([
    'http://h/api/v1/plans/plan%20id/runs/run%20id/execution-map/capabilities/capability%2Fone?version=42',
    'http://h/api/v1/plans/plan%20id/runs/run%20id/execution-map/scenarios/scenario%2Fone?version=42',
    'http://h/api/v1/plans/plan%20id/runs/run%20id/events?after=3',
  ]);
});
