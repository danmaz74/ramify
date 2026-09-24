import {
  runAgentSchema, runQueryLimits,
  type AnalysisResponse, type CapabilityListResponse, type DecisionListResponse, type GateResponse,
  type MetricsResponse, type ModuleCapabilityComparisonResponse, type RunEventPage, type RunListResponse, type RunResponse,
  type ScenarioListResponse, type WorkItemListResponse, type WorkItemResponse,
} from '../interfaces/protocol/runs.js';
import type { PlanDecisionWait } from '../interfaces/protocol/queries.js';
import type { RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { runSnapshot } from '../run/snapshot.js';
import type { CheckFindingDetail, CheckFindingListResponse, CheckFindingModuleCounts, ReviewListResponse } from '../interfaces/protocol/check-findings.js';
import { analysisOf, decisionsOf } from './analysis.js';
import {
  checkFindingDetailOf, checkFindingListOf, checkFindingModulesOf, reviewListOf, runVersionOf, type CheckFindingListQuery,
} from './check-findings.js';
import { eventPage } from './events.js';
import { executionCapabilityDetailOf, executionCoreOf, executionMapOf, executionScenarioDetailOf } from './execution-map.js';
import { ExecutionPageError, executionPageOf } from './execution-pages.js';
import { ProjectionError, readRunFile, runView, unservedRun, unservedRuns, type CommittedRun, type RunView } from './inputs.js';
import { metricsOf } from './metrics.js';
import { moduleCapabilityComparisonOf, type AnalysisCoverageLimits } from './module-capabilities.js';
import { capabilityProgressOf } from './progress.js';
import { scenarioListOf } from './scenarios.js';
import { decisionRequestsOf, snapshotOf } from './snapshot.js';
import { currentModuleTree } from './tree.js';
import { gateOf, workItemOf, workItemsOf } from './work.js';

/*
 * Every query of the run protocol. Each answer is a projection of what the
 * run service holds, read through `committed`, which hands out the log's
 * complete lines and nothing that writes. No query appends an event, writes
 * a file or infers a transition; the tests hold that by comparing every
 * file of a completed run before and after every query.
 */

/** What the queries read runs from: the run service, or anything that answers the same. */
export interface RunSource {
  readonly projectRoot: string;
  readonly agentName: string | undefined;
  committed(planId: string, runId: string): CommittedRun | undefined;
  committedRuns(planId: string): CommittedRun[];
  /** Every run it serves, of every plan, with the sequence of its last event. */
  runVersions(): ReadonlyArray<{ readonly planId: string; readonly runId: string; readonly version: number }>;
}

export class RunQueries {
  constructor(private readonly source: RunSource) {}

  /** The plan's runs, newest first, and the run directories it does not serve with why. */
  async list(planId: string): Promise<RunListResponse> {
    const runs = this.source.committedRuns(planId);
    const snapshots = runs.map(run => snapshotOf(runView(run)));
    const unserved = await unservedRuns(this.source.projectRoot, planId, new Set(runs.map(run => run.record.jobId)));
    const agent = runAgentSchema.safeParse(this.source.agentName);
    return {
      runs: snapshots.slice(0, runQueryLimits.runs),
      total: snapshots.length,
      agent: agent.success ? agent.data : null,
      unserved: unserved.map(entry => ({
        jobId: entry.jobId,
        path: entry.path,
        code: entry.error.code === 'unsupported-version' ? 'unsupported-version' : 'unreadable',
        message: entry.error.message,
      })),
    };
  }

  /**
   * The plan's runs that wait for a person's decision now, in the order the
   * run list shows them. Only a running run with no stop requested can
   * wait, so only such a run's CheckFinding state is replayed.
   */
  decisionWaits(planId: string): PlanDecisionWait[] {
    return this.source.committedRuns(planId).flatMap(run => {
      const internal = runSnapshot(run.record, run.entries.map(entry => entry.transaction.event));
      if (internal.state !== 'running' || internal.stopRequested) return [];
      const requests = decisionRequestsOf(run.entries, true);
      if (!requests.waiting) return [];
      const held = requests.workItems.reduce((sum, item) => sum + item.requests.length, 0);
      return [{ runId: run.record.jobId, requests: held, workItems: requests.workItems.map(item => item.workItem) }];
    });
  }

  async run(planId: string, runId: string): Promise<RunResponse> {
    return { run: snapshotOf(await this.view(planId, runId)) };
  }

  async events(planId: string, runId: string, after: number): Promise<RunEventPage> {
    return eventPage(await this.view(planId, runId), after);
  }

  async analysis(planId: string, runId: string): Promise<AnalysisResponse> {
    return analysisOf(await this.view(planId, runId));
  }

  async decisions(planId: string, runId: string): Promise<DecisionListResponse> {
    const all = decisionsOf(await this.view(planId, runId));
    return { decisions: all.slice(0, runQueryLimits.decisions), total: all.length };
  }

  async workItems(planId: string, runId: string): Promise<WorkItemListResponse> {
    return workItemsOf(await this.view(planId, runId));
  }

  async workItem(planId: string, runId: string, workItem: string): Promise<WorkItemResponse> {
    return workItemOf(await this.view(planId, runId), workItem);
  }

  async capabilities(planId: string, runId: string): Promise<CapabilityListResponse> {
    const all = capabilityProgressOf(await this.view(planId, runId));
    return { capabilities: all.slice(0, runQueryLimits.capabilities), total: all.length };
  }

  /**
   * The initial analysis's module associations beside the capabilities
   * verified at their current owners. It reads the committed run, the
   * current module tree and the analysis submission's coverage limits, and
   * the projection over them is pure.
   */
  async moduleCapabilities(planId: string, runId: string): Promise<ModuleCapabilityComparisonResponse> {
    const view = await this.view(planId, runId);
    const tree = await currentModuleTree(this.source.projectRoot);
    return moduleCapabilityComparisonOf(view, tree, await analysisCoverageLimits(view));
  }

  /** Every tracked acceptance scenario with its state, origin, owner, file and the gates that ran it. */
  async scenarios(planId: string, runId: string): Promise<ScenarioListResponse> {
    return scenarioListOf(await this.view(planId, runId));
  }

  /** The complete unpaged execution census; the versioned HTTP page is added in iteration 5. */
  async executionCore(planId: string, runId: string) {
    return executionCoreOf(await this.view(planId, runId));
  }

  /** Full module relations and captured writer volume beside the unpaged execution census. */
  async executionMap(planId: string, runId: string) {
    const view = await this.view(planId, runId);
    return executionMapOf(view, await currentModuleTree(this.source.projectRoot));
  }

  /** A bounded page bound to the committed run, current tree and captured line evidence. */
  async executionMapPage(planId: string, runId: string, input: unknown) {
    const map = await this.executionMap(planId, runId);
    const page = executionPageOf(map, input, `${planId}\u0000${runId}`);
    const latest = this.source.committed(planId, runId);
    const version = latest?.entries.at(-1)?.sequence ?? 0;
    if (version !== map.runVersion) throw new ExecutionPageError('stale-version',
      'The run advanced while its execution map was read', version);
    if (JSON.stringify(await currentModuleTree(this.source.projectRoot)) !== JSON.stringify(map.moduleMap.tree)) {
      throw new ExecutionPageError('stale-version', 'The current module tree changed while its execution map was read', version);
    }
    return page;
  }

  /** A capability's full accepted entry description or registered behavior. */
  async executionCapabilityDetail(planId: string, runId: string, capability: string, expectedVersion?: number) {
    const view = await this.view(planId, runId);
    if (expectedVersion !== undefined && expectedVersion !== (view.entries.at(-1)?.sequence ?? 0)) {
      throw new ExecutionPageError('stale-version', 'The capability detail belongs to another run version',
        view.entries.at(-1)?.sequence ?? 0);
    }
    if (!executionCoreOf(view).nodes.some(node => node.key === `capability:${capability}`)) {
      throw new ProjectionError('not-found', `No capability ${capability} in run ${runId}`);
    }
    return executionCapabilityDetailOf(view, capability);
  }

  /** A scenario's complete frozen Gherkin block. */
  async executionScenarioDetail(planId: string, runId: string, scenario: string, expectedVersion?: number) {
    const view = await this.view(planId, runId);
    if (expectedVersion !== undefined && expectedVersion !== (view.entries.at(-1)?.sequence ?? 0)) {
      throw new ExecutionPageError('stale-version', 'The scenario detail belongs to another run version',
        view.entries.at(-1)?.sequence ?? 0);
    }
    if (!executionCoreOf(view).nodes.some(node => node.key === `scenario:${scenario}`)) {
      throw new ProjectionError('not-found', `No scenario ${scenario} in run ${runId}`);
    }
    return executionScenarioDetailOf(view, scenario);
  }

  /**
   * A page of the run's CheckFindings with its review coverage. A version
   * the query names that is not the run's is refused as stale, with the
   * current one, so a client never mixes pages of two versions.
   */
  async checkFindings(planId: string, runId: string, query: CheckFindingListQuery, expectedVersion?: number): Promise<CheckFindingListResponse> {
    return checkFindingListOf(await this.versioned(planId, runId, expectedVersion), query);
  }

  /** Every module the run's CheckFindings concern, with the unsettled ones of each. */
  async checkFindingModules(planId: string, runId: string, expectedVersion?: number): Promise<CheckFindingModuleCounts> {
    return checkFindingModulesOf(await this.versioned(planId, runId, expectedVersion));
  }

  /** One CheckFinding with its history, relations, attempts, candidate diffs and repairs. */
  async checkFinding(planId: string, runId: string, checkFinding: string, expectedVersion?: number): Promise<CheckFindingDetail> {
    return checkFindingDetailOf(await this.versioned(planId, runId, expectedVersion), checkFinding);
  }

  /** The run's review requests, of one work item when named, with their attempts and coverage. */
  async reviews(planId: string, runId: string, query: { readonly workItem: string | null; readonly after: string | null; readonly limit: number }, expectedVersion?: number): Promise<ReviewListResponse> {
    return reviewListOf(await this.versioned(planId, runId, expectedVersion), query);
  }

  async gate(planId: string, runId: string, gate: string): Promise<GateResponse> {
    return { gate: gateOf(await this.view(planId, runId), gate) };
  }

  async metrics(planId: string, runId: string): Promise<MetricsResponse> {
    return metricsOf(await this.view(planId, runId));
  }

  /** The view of one served run, refused as stale when the caller named another version. */
  private async versioned(planId: string, runId: string, expectedVersion: number | undefined): Promise<RunView> {
    const view = await this.view(planId, runId);
    const current = runVersionOf(view);
    if (expectedVersion !== undefined && expectedVersion !== current) {
      throw new ProjectionError('stale-version', `Run ${runId} is at version ${current}, not ${expectedVersion}`, [], current);
    }
    return view;
  }

  /** The view of one served run; a run that exists and is not served is reported with why, never as absent. */
  private async view(planId: string, runId: string): Promise<RunView> {
    return runView(await servedRun(this.source, planId, runId));
  }
}

/** One run the source serves; a run that exists and is not served is reported with why, never as absent. */
export async function servedRun(source: RunSource, planId: string, runId: string): Promise<CommittedRun> {
  const run = source.committed(planId, runId);
  if (run !== undefined) return run;
  const unserved = await unservedRun(source.projectRoot, planId, runId);
  if (unserved !== null) throw unserved;
  throw new ProjectionError('not-found', `No run ${runId} for plan "${planId}"`);
}

/** The coverage limits the accepted analysis submission recorded, read from the run's own file. */
async function analysisCoverageLimits(view: RunView): Promise<AnalysisCoverageLimits> {
  const accepted = view.events.find((event): event is Extract<RunEvent, { type: 'analysis-accepted' }> => event.type === 'analysis-accepted');
  if (accepted === undefined) return { limits: [] };
  const path = runLayout.submission(accepted.data.invocation);
  let text: string | null;
  try {
    text = await readRunFile(view, path);
  } catch (error) {
    return { unreadable: `${path}: ${error instanceof Error ? error.message : String(error)}` };
  }
  if (text === null) return { unreadable: `${path} is not in the run` };
  try {
    const limits = (JSON.parse(text) as { coverageLimits?: unknown }).coverageLimits;
    if (Array.isArray(limits) && limits.every(limit => typeof limit === 'string')) return { limits };
    return { unreadable: `${path} records no list of coverage limits` };
  } catch {
    return { unreadable: `${path} is not JSON` };
  }
}
