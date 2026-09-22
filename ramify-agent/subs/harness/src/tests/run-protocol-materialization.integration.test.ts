import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { createScriptedAgent } from '../../subs/agent/src/scripted.js';
import { errorResponseSchema } from '../interfaces/protocol/errors.js';
import { moduleTreeResponseSchema } from '../interfaces/protocol/evidence.js';
import { commandResponseSchema } from '../interfaces/protocol/jobs.js';
import { protocolPaths } from '../interfaces/protocol/paths.js';
import {
  analysisResponseSchema, capabilityListResponseSchema, decisionListResponseSchema, gateResponseSchema,
  metricsResponseSchema, moduleCapabilityComparisonResponseSchema, runEventPageSchema, runListResponseSchema, runQueryLimits, runResponseSchema,
  workItemListResponseSchema, workItemResponseSchema,
  type ProjectedRunEvent, type RunSnapshot,
} from '../interfaces/protocol/runs.js';
import { startServerWith, type RunningServer } from '../http/server.js';
import { terminalRunEvents } from '../run/log.js';
import { treeInputs } from './helpers/iterations.js';
import {
  draftsDirectory, drafts, fileHashes, longOutputBytes, notes, outsidePath, protocolPolicy, protocolScript, protocolTarget,
} from './helpers/protocol.js';
import {
  emptyAnalysis, git, initRepository, installTestRunner, openRuns, realRamify, runEventsOnDisk, runPath, startRun, stubRamify, testPolicy, until,
} from './helpers/runs.js';
import { copyFixture } from './helpers/fixture.js';
import { acquireProjectLock } from '../store/lock.js';
import { ObservationLog } from '../run/observations.js';
import { runLayout } from '../run/records.js';
import { gitService } from '../../subs/evidence/src/git.js';

/*
 * The run protocol over HTTP, read by a plain Node client: `fetch` and the
 * protocol's schemas, nothing from the web client, and the web assets absent.
 *
 * C1: a run completes with no client connected, watched through the file
 * system alone; a client attached afterwards reads the same snapshot and the
 * same events, and so does one attached after the harness restarts.
 */

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

const plan = 'review-notes';

async function get(server: RunningServer, path: string): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server.url}${path}`);
  return { status: response.status, body: await response.json() };
}

async function post(server: RunningServer, body: unknown): Promise<{ status: number; body: unknown }> {
  const response = await fetch(`${server.url}${protocolPaths.commands}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

/** Every event of a run, page after page from the cursor, as a reconnecting client reads it. */
async function allEvents(server: RunningServer, runId: string, from = 0): Promise<{ run: RunSnapshot; events: ProjectedRunEvent[]; pages: number }> {
  let cursor = from;
  const events: ProjectedRunEvent[] = [];
  let pages = 0;
  for (;;) {
    const { status, body } = await get(server, protocolPaths.runEvents(plan, runId, cursor));
    expect(status).toBe(200);
    const page = runEventPageSchema.parse(body);
    pages += 1;
    events.push(...page.events);
    cursor = page.cursor;
    if (!page.more) return { run: page.run, events, pages };
  }
}

/** Every answer of every query of one run, as JSON text, for comparing two readings byte for byte. */
async function everyAnswer(server: RunningServer, runId: string): Promise<Record<string, string>> {
  const paths = [
    protocolPaths.runs(plan),
    protocolPaths.run(plan, runId),
    protocolPaths.runEvents(plan, runId, 0),
    protocolPaths.runAnalysis(plan, runId),
    protocolPaths.runDecisions(plan, runId),
    protocolPaths.runWorkItems(plan, runId),
    protocolPaths.runWorkItem(plan, runId, 'wi-001'),
    protocolPaths.runWorkItem(plan, runId, 'wi-002'),
    protocolPaths.runCapabilities(plan, runId),
    protocolPaths.runMetrics(plan, runId),
  ];
  const answers: Record<string, string> = {};
  for (const path of paths) {
    const { status, body } = await get(server, path);
    expect([path, status]).toEqual([path, 200]);
    answers[path] = JSON.stringify(body);
  }
  return answers;
}

async function serve(root: string, extra: Partial<Parameters<typeof startServerWith>[0]> = {}): Promise<RunningServer> {
  const server = await startServerWith({
    projectRoot: root,
    port: 0,
    assetsDirectory: join(root, 'no-such-build'),
    ramify: await stubRamify(),
    runs: { inputs: treeInputs(), policy: projectRoot => protocolPolicy(projectRoot), stopGraceMs: 500, warn: () => undefined },
    ...extra,
  });
  return server;
}

describe('the module-capability comparison of a completed scripted run, over HTTP', () => {
  test('initial and current placements, the compared identities and coverage, and no file or event changed', async () => {
    const target = await protocolTarget();
    cleanups.push(target.remove);
    const { root } = target;
    const opened = await openRuns(root, { git: gitService, script: protocolScript(), inputs: treeInputs(), policy: projectRoot => protocolPolicy(projectRoot) });
    const runId = (await opened.service.execute(startRun(plan))).jobId;
    await opened.service.settled(plan, runId);
    await opened.service.close();
    const onDisk = await runEventsOnDisk(root, plan, runId);
    expect(onDisk.at(-1)!.type).toBe('job-completed');

    const server = await serve(root);
    cleanups.push(() => server.close());
    const read = async () => {
      const { status, body } = await get(server, protocolPaths.runModuleCapabilities(plan, runId));
      expect(status).toBe(200);
      return moduleCapabilityComparisonResponseSchema.parse(body);
    };
    const currentTree = async () => moduleTreeResponseSchema.parse((await get(server, protocolPaths.modules)).body).tree;

    // Before the architect view is materialized: the same unavailable tree
    // the module-tree query reports, every module unplaced, and a gap.
    const unmaterialized = await read();
    expect(unmaterialized.tree).toEqual(await currentTree());
    expect(unmaterialized.tree.status).toBe('unavailable');
    expect(unmaterialized.modules.map(entry => [entry.module, entry.placement])).toEqual([[notes, 'unplaced'], [drafts, 'unplaced']]);
    expect(unmaterialized.coverage).toEqual({
      state: 'partial', knownCapabilities: 3, knownImplemented: 2, totalCapabilities: null,
      gaps: [expect.stringMatching(/^The current module tree is unavailable, so no module is placed: The architect view has not been materialized yet/)],
    });

    // The real view of the tree the run left, with the module it created.
    const daemon = await realRamify();
    cleanups.push(() => daemon.dispose());
    const materialized = await daemon.ramify.materialize(root);
    expect(materialized.ok).toBe(true);

    const files = await fileHashes(runPath(root, plan, runId));
    const status = await git(root, 'status', '--porcelain', '--untracked-files=all');
    const first = await read();
    expect(await read()).toEqual(first);

    const tree = await currentTree();
    expect(first.tree).toEqual(tree);
    if (tree.status !== 'available') throw new Error('the view was materialized');
    expect(tree.modules.map(entry => entry.module)).toEqual(expect.arrayContaining([notes, drafts]));
    expect(first.identityPolicy).toBe('exact-capability-slug/1');
    expect(first.runVersion).toBe(onDisk.length);
    // The run's inputs worked from a placeholder view, and the identity says so.
    expect(first.initialView).toEqual({ status: 'placeholder' });

    // Every module of the tree, in its order; only two hold rows.
    expect(first.modules.map(entry => entry.module)).toEqual(tree.modules.map(entry => entry.module));
    expect(first.modules.every(entry => entry.placement === 'declared')).toBe(true);
    const withRows = first.modules.filter(entry => entry.capabilities.length > 0);
    expect(withRows.map(entry => ({
      module: entry.module,
      proposedAtStart: entry.proposedAtStart,
      rows: entry.capabilities.map(row => [row.capability, row.initial, row.implementedHere === null ? null : row.implementedHere.evidence.length]),
    }))).toEqual([
      {
        module: notes, proposedAtStart: null,
        rows: [
          ['review-note', [{ role: 'entry-owner', hypothesis: null }], 1],
          ['note-search', [{ role: 'suggested-owner', hypothesis: 'note-search' }], null],
        ],
      },
      {
        // Proposed at start by its entry, it now exists and is declared.
        module: drafts, proposedAtStart: { parent: notes, purpose: 'Keeps a reviewer\'s unsent drafts.', tags: [] },
        rows: [['note-drafts', [{ role: 'entry-owner', hypothesis: null }], 1]],
      },
    ]);
    expect(withRows[0]!.capabilities[0]!.implementedHere!.reason).toMatch(/^wi-001 passed its work-item gate ga-\d{4}$/);
    expect(first.coverage).toEqual({ state: 'complete', capabilities: 3, implemented: 2 });
    // CM09: nothing about activity, commits, changes, lines or deployment.
    expect(JSON.stringify(first)).not.toMatch(/"(activity|commit|changed|lines|deployed)"/i);

    // The query changed no file of the run, no event and nothing in the project.
    expect(await fileHashes(runPath(root, plan, runId))).toEqual(files);
    expect(await runEventsOnDisk(root, plan, runId)).toEqual(onDisk);
    expect(await git(root, 'status', '--porcelain', '--untracked-files=all')).toBe(status);
  }, 300_000);
});
