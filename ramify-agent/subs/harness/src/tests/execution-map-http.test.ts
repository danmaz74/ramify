import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterEach, expect, test } from 'vitest';
import { scenarioRecordSchema, scenarioSourceHash } from '../../subs/scenarios/src/records.js';
import { createApp } from '../http/app.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { executionCapabilityDetailSchema, executionMapPageSchema, executionScenarioDetailSchema } from '../interfaces/protocol/execution-map.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import { entryAssignmentsSchema } from '../run/records.js';
import type { RunService } from '../run/service.js';
import { at, constructedRun, constructedRecord, item, registered, reviews, runId } from './helpers/constructed.js';

const source = ['Scenario: The full block', '  Given recorded state', '  When requested', '  Then the full block is returned'];
const scenario = scenarioRecordSchema.parse({ schema: 'ramify-agent.scenario/1', id: 'sc-001', kind: 'entry',
  entry: 'full-description', owner: reviews, origin: { kind: 'architect', refs: [{ anchor: 'Acceptance' }] },
  partOf: null, subScenarios: [], name: 'The full block', source, hash: scenarioSourceHash(source),
  file: 'subs/reviews/src/tests/features/full.feature' });
const description = `A complete capability description. ${'More detail. '.repeat(100)}`;
const entries = entryAssignmentsSchema.parse({ schema: 'ramify-agent.entry-assignments/1',
  view: { status: 'placeholder' }, entries: [{ capability: 'full-description', description, owner: reviews,
    requirementRefs: [], acceptanceRefs: [], citations: [] }] });
const workItems = Array.from({ length: 105 }, (_, i) => {
  const id = `wi-${String(i).padStart(3, '0')}`;
  return { path: `work-items/${id}/item.json`, body: item(id, { entry: 'full-description' }) };
});

async function served() {
  const root = await mkdtemp(join(tmpdir(), 'execution-http-'));
  const run = constructedRun([{ type: 'analysis-accepted', data: {}, records: [
    { path: 'analysis/entries.json', body: entries },
    { path: at('registry', 'full-description'), body: registered('full-description') },
    { path: 'scenarios/sc-001.json', body: scenario }, ...workItems,
  ] }], constructedRecord(), root);
  const fake = { projectRoot: root, agentName: 'scripted',
    committed: (planId: string, id: string) => planId === 'review-notes' && id === runId ? run : undefined,
    committedRuns: (planId: string) => planId === 'review-notes' ? [run] : [],
    runVersions: () => [{ planId: 'review-notes', runId, version: 1 }],
  } as unknown as RunService;
  const app = createApp({ projectRoot: root, runs: fake });
  const server = await new Promise<ReturnType<typeof app.listen>>(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { root, server, origin };
}

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => { for (const one of cleanup.splice(0)) await one(); });

async function get(origin: string, path: string) {
  const response = await fetch(`${origin}${path}`);
  return { status: response.status, body: await response.json() as unknown };
}

test('HTTP pages the complete census and serves exact capability/scenario detail', async () => {
  const { root, server, origin } = await served();
  cleanup.push(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  const first = await get(origin, protocolPaths.runExecutionMap('review-notes', runId, 1, undefined, 17));
  expect(first.status).toBe(200);
  const page = executionMapPageSchema.parse(first.body);
  expect(page.nodes).toHaveLength(17);
  expect(page.coverage.nodes.total).toBeGreaterThan(100);
  expect(page.nextCursor).not.toBeNull();
  const second = executionMapPageSchema.parse((await get(origin,
    protocolPaths.runExecutionMap('review-notes', runId, 1, page.nextCursor!, 17))).body);
  expect(second.nodes[0]?.key).not.toBe(page.nodes[0]?.key);
  const capability = executionCapabilityDetailSchema.parse((await get(origin,
    protocolPaths.runExecutionCapability('review-notes', runId, 'full-description', 1))).body);
  expect(capability.detail).toMatchObject({ state: 'available', description });
  const scenarioDetail = executionScenarioDetailSchema.parse((await get(origin,
    protocolPaths.runExecutionScenario('review-notes', runId, 'sc-001', 1))).body);
  expect(scenarioDetail.detail).toMatchObject({ state: 'available', source });
  expect((await get(origin, protocolPaths.runExecutionCapability('review-notes', runId, 'missing', 1))).status).toBe(404);
  expect((await get(origin, protocolPaths.runExecutionScenario('review-notes', runId, 'missing', 1))).status).toBe(404);
  expect(errorResponseSchema.parse((await get(origin,
    protocolPaths.runExecutionCapability('review-notes', runId, 'full-description', 0))).body).error)
    .toMatchObject({ code: 'stale-version', currentVersion: 1 });
  expect(errorResponseSchema.parse((await get(origin,
    protocolPaths.runExecutionMap('review-notes', runId, 0))).body).error)
    .toMatchObject({ code: 'stale-version', currentVersion: 1 });
  expect(errorResponseSchema.parse((await get(origin,
    protocolPaths.runExecutionMap('review-notes', runId, 1, undefined, 101))).body).error.code).toBe('invalid-request');
});

test('HTTP reports a tree refresh across pages and still answers old routes', async () => {
  const { root, server, origin } = await served();
  cleanup.push(async () => { await new Promise<void>(resolve => server.close(() => resolve())); await rm(root, { recursive: true, force: true }); });
  const first = executionMapPageSchema.parse((await get(origin,
    protocolPaths.runExecutionMap('review-notes', runId, 1, undefined, 10))).body);
  expect(first.tree.status).toBe('unavailable');
  const view = join(root, '.ramify-architect');
  await mkdir(view);
  await writeFile(join(view, '_meta.json'), JSON.stringify({ schema: 'ramify.architect-view/1',
    revision: 'rev-2', input: 'input-2', modules: 1, dependencies: 'measured' }));
  await writeFile(join(view, 'module.json'), JSON.stringify({ module: 'collection-review', dir: '', parent: null,
    children: [], tags: [], areas: ['src'] }));
  const stale = await get(origin, protocolPaths.runExecutionMap('review-notes', runId, 1, first.nextCursor!, 10));
  expect(stale.status).toBe(409);
  expect(errorResponseSchema.parse(stale.body).error).toMatchObject({ code: 'stale-version', currentVersion: 1 });
  const oldRoute = await get(origin, protocolPaths.runScenarios('review-notes', runId));
  expect(oldRoute.status).toBe(200);
});
