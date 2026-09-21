import {
  runAgentSchema, runQueryLimits,
  type AnalysisResponse, type CapabilityListResponse, type DecisionListResponse, type GateResponse,
  type MetricsResponse, type RunEventPage, type RunListResponse, type RunResponse,
  type WorkItemListResponse, type WorkItemResponse,
} from '../interfaces/protocol/runs.js';
import { analysisOf, decisionsOf } from './analysis.js';
import { eventPage } from './events.js';
import { ProjectionError, runView, unservedRun, unservedRuns, type CommittedRun, type RunView } from './inputs.js';
import { metricsOf } from './metrics.js';
import { capabilityProgressOf } from './progress.js';
import { snapshotOf } from './snapshot.js';
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

  async gate(planId: string, runId: string, gate: string): Promise<GateResponse> {
    return { gate: gateOf(await this.view(planId, runId), gate) };
  }

  async metrics(planId: string, runId: string): Promise<MetricsResponse> {
    return metricsOf(await this.view(planId, runId));
  }

  /** The view of one served run; a run that exists and is not served is reported with why, never as absent. */
  private async view(planId: string, runId: string): Promise<RunView> {
    const run = this.source.committed(planId, runId);
    if (run !== undefined) return runView(run);
    const unserved = await unservedRun(this.source.projectRoot, planId, runId);
    if (unserved !== null) throw unserved;
    throw new ProjectionError('not-found', `No run ${runId} for plan "${planId}"`);
  }
}
