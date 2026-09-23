import {
  runAgentSchema, runQueryLimits,
  type AnalysisResponse, type CapabilityListResponse, type DecisionListResponse, type GateResponse,
  type MetricsResponse, type ModuleCapabilityComparisonResponse, type RunEventPage, type RunListResponse, type RunResponse,
  type ScenarioListResponse, type WorkItemListResponse, type WorkItemResponse,
} from '../interfaces/protocol/runs.js';
import type { RunEvent } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { analysisOf, decisionsOf } from './analysis.js';
import { eventPage } from './events.js';
import { ProjectionError, readRunFile, runView, unservedRun, unservedRuns, type CommittedRun, type RunView } from './inputs.js';
import { metricsOf } from './metrics.js';
import { moduleCapabilityComparisonOf, type AnalysisCoverageLimits } from './module-capabilities.js';
import { capabilityProgressOf } from './progress.js';
import { scenarioListOf } from './scenarios.js';
import { snapshotOf } from './snapshot.js';
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

  async gate(planId: string, runId: string, gate: string): Promise<GateResponse> {
    return { gate: gateOf(await this.view(planId, runId), gate) };
  }

  async metrics(planId: string, runId: string): Promise<MetricsResponse> {
    return metricsOf(await this.view(planId, runId));
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
