import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import {
  capabilityListResponseSchema, capabilityStateSchema, moduleCapabilityComparisonResponseSchema, runQueryLimits, runResponseSchema,
  type CapabilityListResponse, type ModuleCapabilityComparisonResponse,
} from '../interfaces/protocol/runs.js';
import { startServerWith, type RunningServer } from '../http/server.js';
import { treeInputs } from './helpers/iterations.js';
import {
  archive, capabilityBoundHypotheses, contracts, core, panel, progressFixture, reviewsCore, rowBoundHypotheses, rowBoundInvolved,
  sharedUi, validation, type FixtureRun, type ProgressFixture,
} from './helpers/progress-fixture.js';
import { runEventsOnDisk, stubRamify, testPolicy } from './helpers/runs.js';

/*
 * The capability-progress fixture over HTTP: five scripted runs of one
 * project, read by a plain Node client with the protocol's schemas. It is
 * the evidence that the browser acceptance's cases are the harness's own
 * answers, and what `serve-progress-fixture.ts` serves to the built web
 * client.
 */

let fixture: ProgressFixture;
let server: RunningServer;

beforeAll(async () => {
  fixture = await progressFixture();
  server = await startServerWith({
    projectRoot: fixture.root,
    port: 0,
    assetsDirectory: join(fixture.root, 'no-such-build'),
    ramify: await stubRamify(),
    runs: { inputs: treeInputs(), policy: projectRoot => testPolicy(projectRoot), stopGraceMs: 500, warn: () => undefined },
  });
}, 600_000);

afterAll(async () => {
  await server?.close();
  await fixture?.remove();
});

async function get(path: string): Promise<unknown> {
  const response = await fetch(`${server.url}${path}`);
  expect(response.status).toBe(200);
  return response.json();
}

async function answers(name: FixtureRun): Promise<{ capabilities: CapabilityListResponse; comparison: ModuleCapabilityComparisonResponse }> {
  const { planId, runId } = fixture.runs[name];
  return {
    capabilities: capabilityListResponseSchema.parse(await get(protocolPaths.runCapabilities(planId, runId))),
    comparison: moduleCapabilityComparisonResponseSchema.parse(await get(protocolPaths.runModuleCapabilities(planId, runId))),
  };
}

/** Each module's rows as `capability: roles | implemented`. */
function rows(comparison: ModuleCapabilityComparisonResponse, module: string): string[] {
  const found = comparison.modules.find(entry => entry.module === module);
  if (found === undefined) throw new Error(`no module ${module}`);
  return found.capabilities.map(row =>
    `${row.capability}: ${row.initial.map(association => association.role).join(',') || '-'}${row.implementedHere === null ? '' : ' | implemented'}`);
}

describe('the capability-progress fixture over HTTP', () => {
  test('the runs end as the fixture says', async () => {
    const states = Object.fromEntries((Object.keys(fixture.runs) as FixtureRun[]).map(name => [name, fixture.runs[name].state]));
    expect(states).toEqual({ placements: 'completed', proposed: 'failed', capabilityBound: 'completed', rowBound: 'completed', sixtyRows: 'completed' });
    for (const name of Object.keys(fixture.runs) as FixtureRun[]) {
      const { planId, runId } = fixture.runs[name];
      expect((await runEventsOnDisk(fixture.root, planId, runId)).at(-1)!.type).toBe(name === 'proposed' ? 'job-failed' : 'job-completed');
    }
  });

  test('placements: matching, changed and implemented-only placement, and every initial role', async () => {
    const { comparison } = await answers('placements');
    expect(comparison.tree.status).toBe('available');
    expect(comparison.modules.every(entry => entry.placement === 'declared')).toBe(true);
    // Matching: Initial and Implemented in one row. Changed: field-diff was
    // suggested for the core and is implemented in the panel. Implemented
    // only: revision-chain, absent from revision 1.
    expect(rows(comparison, core)).toEqual([
      'compare-revisions: entry-owner | implemented',
      'field-diff: suggested-owner',
      'revision-chain: - | implemented',
    ]);
    expect(rows(comparison, panel)).toEqual([
      'compare-panel: entry-owner | implemented',
      'field-diff: - | implemented',
      'note-preview: suggested-owner',
    ]);
    expect(rows(comparison, contracts)).toEqual(['field-diff: involved']);
    expect(rows(comparison, reviewsCore)).toEqual(['review-digest: suggested-owner']);
    expect(rows(comparison, sharedUi)).toEqual(['digest-format: suggested-owner', 'text-wrap: suggested-owner']);
    expect(rows(comparison, validation)).toEqual(['draft-sync: suggested-owner', 'draft-merge: suggested-owner']);
    expect(comparison.coverage).toEqual({ state: 'complete', capabilities: 10, implemented: 4 });
    // CM09: nothing about activity, commits, changes, lines or deployment.
    expect(JSON.stringify(comparison)).not.toMatch(/"(activity|commit|changed|lines|deployed)"|%/i);
  });

  test('placements: dependency depth, a shared dependency, a cycle, tentative links and an omitted target', async () => {
    const { capabilities } = await answers('placements');
    expect(capabilities.total).toBe(capabilities.capabilities.length);
    const edges = Object.fromEntries(capabilities.capabilities.map(entry =>
      [entry.capability, entry.dependsOn.map(link => `${link.capability}${link.tentative ? '?' : ''}`)]));
    expect(edges).toEqual({
      'compare-revisions': ['revision-chain'],
      'compare-panel': ['field-diff'],
      'field-diff': ['text-wrap?'],
      'revision-chain': [],
      'review-digest': ['digest-format?'],
      'digest-format': ['text-wrap?'],
      'text-wrap': [],
      'note-preview': ['text-wrap?', 'spell-check?'],
      'draft-sync': ['draft-merge?'],
      'draft-merge': ['draft-sync?'],
    });
    // spell-check is a target no returned capability answers.
    expect(capabilities.capabilities.some(entry => entry.capability === 'spell-check')).toBe(false);
    const state = Object.fromEntries(capabilities.capabilities.map(entry => [entry.capability, `${entry.state}${entry.tentative ? ' (tentative)' : ''}`]));
    expect(state).toMatchObject({
      'compare-revisions': 'completed', 'compare-panel': 'completed', 'field-diff': 'completed', 'revision-chain': 'completed',
      'text-wrap': 'todo (tentative)', 'draft-sync': 'todo (tentative)',
    });
    expect(capabilities.capabilities.find(entry => entry.capability === 'field-diff')!.owner).toBe(panel);
  });

  test('proposed: a module proposed at start and absent from the tree, a registered todo and a failure at run level only', async () => {
    const { planId, runId } = fixture.runs.proposed;
    const run = runResponseSchema.parse(await get(protocolPaths.run(planId, runId))).run;
    expect(run.state).toBe('failed');
    expect(run.failure?.reason).toBe('unresolvable-requirement');
    const { capabilities, comparison } = await answers('proposed');
    expect(comparison.tree.status).toBe('available');
    const proposed = comparison.modules.find(entry => entry.module === archive)!;
    expect(proposed.placement).toBe('proposed');
    expect(proposed.proposedAtStart).toEqual({ parent: sharedUi, purpose: 'Keeps retired status badges.', tags: [] });
    expect(rows(comparison, archive)).toEqual(['badge-archive: entry-owner']);
    expect(rows(comparison, sharedUi)).toEqual(['badge-legend: entry-owner', 'badge-tones: suggested-owner']);
    expect(comparison.coverage).toEqual({ state: 'complete', capabilities: 3, implemented: 0 });
    // A registered todo, a working capability and a tentative forecast todo.
    expect(capabilities.capabilities.map(entry => [entry.capability, entry.state, entry.tentative])).toEqual([
      ['badge-archive', 'working', false], ['badge-legend', 'todo', false], ['badge-tones', 'todo', true],
    ]);
    expect(capabilityStateSchema.options).toEqual(['todo', 'working', 'completed']);
  });

  test('capability bound: both queries return 500 of the 520 capabilities and say so', async () => {
    const { capabilities, comparison } = await answers('capabilityBound');
    expect(capabilities.capabilities).toHaveLength(runQueryLimits.capabilities);
    expect(capabilities.total).toBe(capabilityBoundHypotheses);
    expect(comparison.coverage).toEqual({
      state: 'partial', knownCapabilities: 500, knownImplemented: 0, totalCapabilities: capabilityBoundHypotheses,
      gaps: [expect.stringMatching(/^The capabilities \(500\) bound returned 500 of 520 capabilities.*knownImplemented is a lower bound/)],
    });
  });

  test('row bound: the comparison keeps whole capabilities within 2,000 rows', async () => {
    const { capabilities, comparison } = await answers('rowBound');
    expect(capabilities.total).toBe(rowBoundHypotheses);
    expect(capabilities.capabilities).toHaveLength(rowBoundHypotheses);
    const returned = comparison.modules.reduce((sum, entry) => sum + entry.capabilities.length, 0);
    expect(returned).toBe(runQueryLimits.moduleCapabilityRows);
    expect(comparison.coverage).toEqual({
      state: 'partial', knownCapabilities: 400, knownImplemented: 0, totalCapabilities: rowBoundHypotheses,
      gaps: [expect.stringMatching(/^The moduleCapabilityRows \(2000\) bound returned 400 of 402 capabilities and 2000 of 2010 rows/)],
    });
    expect(rowBoundHypotheses * (1 + rowBoundInvolved)).toBe(2010);
  });

  test('sixty rows: one module holds 60 rows', async () => {
    const { comparison } = await answers('sixtyRows');
    expect(rows(comparison, validation)).toHaveLength(60);
    expect(comparison.coverage).toEqual({ state: 'complete', capabilities: 61, implemented: 0 });
  });
});
