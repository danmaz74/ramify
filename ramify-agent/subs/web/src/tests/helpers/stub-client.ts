import type { ModuleTree } from '../../../../harness/src/interfaces/protocol/evidence.js';
import type { Receipt } from '../../../../harness/src/interfaces/protocol/jobs.js';
import type { PlanDocument, PlanEntry } from '../../../../harness/src/interfaces/protocol/queries.js';
import type {
  AnalysisResponse, CapabilityListResponse, DecisionListResponse, GateView, MetricsResponse, ProjectedRunEvent,
  RunCommand, RunEventPage, RunListResponse, RunSnapshot, WorkItemListResponse, WorkItemResponse,
} from '../../../../harness/src/interfaces/protocol/runs.js';
import { ClientError, type ConnectionState, type ProjectInfo, type ProtocolClient } from '../../client.js';

export const project: ProjectInfo = { name: 'collection-review', root: '/work/collection-review', planPattern: 'plans/<plan-id>/plan.md' };

/** A run as the stub answers it, with every query's answer. */
export interface StubRun {
  snapshot: RunSnapshot;
  events: ProjectedRunEvent[];
  analysis?: AnalysisResponse;
  decisions?: DecisionListResponse;
  workItems?: WorkItemListResponse;
  workItem?: Record<string, WorkItemResponse>;
  capabilities?: CapabilityListResponse;
  gates?: Record<string, GateView>;
  metrics?: MetricsResponse;
}

/** A protocol client answering from memory, with a settable connection state. */
export class StubClient implements ProtocolClient {
  plans: PlanEntry[] = [];
  documents = new Map<string, PlanDocument>();
  runs = new Map<string, StubRun>();
  runList: RunListResponse = { runs: [], total: 0, agent: 'scripted', unserved: [] };
  failure: ClientError | undefined;
  state: ConnectionState = 'connected';
  calls: string[] = [];
  commands: RunCommand[] = [];
  receipt: Receipt = { commandId: 'c', jobId: '20260921T080000Z-c0ffee', sequence: 1, acceptedAt: '2026-09-21T08:00:00.000Z' };
  tree: ModuleTree = { status: 'unavailable', message: 'The architect view has not been materialized yet.' };
  private listeners = new Set<(state: ConnectionState) => void>();

  async getProject(): Promise<ProjectInfo> {
    this.calls.push('getProject');
    return project;
  }

  async listPlans(): Promise<PlanEntry[]> {
    this.calls.push('listPlans');
    if (this.failure) throw this.failure;
    return this.plans;
  }

  async getPlan(planId: string): Promise<PlanDocument> {
    this.calls.push(`getPlan:${planId}`);
    if (this.failure) throw this.failure;
    const plan = this.documents.get(planId);
    if (!plan) throw new ClientError('protocol', `No plan with ID "${planId}"`, 'not-found');
    return plan;
  }

  async getModuleTree(): Promise<ModuleTree> {
    this.calls.push('getModuleTree');
    return this.tree;
  }

  async listRuns(planId: string): Promise<RunListResponse> {
    this.calls.push(`listRuns:${planId}`);
    if (this.failure) throw this.failure;
    return this.runList;
  }

  private run(runId: string): StubRun {
    if (this.failure) throw this.failure;
    const run = this.runs.get(runId);
    if (!run) throw new ClientError('protocol', `No run ${runId}`, 'not-found');
    return run;
  }

  private answer<T>(runId: string, pick: (run: StubRun) => T | undefined, what: string): T {
    const value = pick(this.run(runId));
    if (value === undefined) throw new ClientError('protocol', `No ${what} for run ${runId}`, 'not-found');
    return value;
  }

  async getRun(_planId: string, runId: string): Promise<RunSnapshot> {
    this.calls.push(`getRun:${runId}`);
    return this.run(runId).snapshot;
  }

  async getEvents(_planId: string, runId: string, after: number): Promise<RunEventPage> {
    this.calls.push(`getEvents:${runId}:${after}`);
    const run = this.run(runId);
    const events = run.events.filter(event => event.sequence > after);
    return { run: run.snapshot, events, cursor: events.at(-1)?.sequence ?? after, more: false };
  }

  async getAnalysis(_planId: string, runId: string) { this.calls.push(`getAnalysis:${runId}`); return this.answer(runId, run => run.analysis, 'analysis'); }
  async getDecisions(_planId: string, runId: string) { this.calls.push(`getDecisions:${runId}`); return this.answer(runId, run => run.decisions, 'decisions'); }
  async getWorkItems(_planId: string, runId: string) { this.calls.push(`getWorkItems:${runId}`); return this.answer(runId, run => run.workItems, 'work items'); }
  async getWorkItem(_planId: string, runId: string, workItem: string) { this.calls.push(`getWorkItem:${runId}:${workItem}`); return this.answer(runId, run => run.workItem?.[workItem], `work item ${workItem}`); }
  async getCapabilities(_planId: string, runId: string) { this.calls.push(`getCapabilities:${runId}`); return this.answer(runId, run => run.capabilities, 'capabilities'); }
  async getGate(_planId: string, runId: string, gate: string) { this.calls.push(`getGate:${runId}:${gate}`); return this.answer(runId, run => run.gates?.[gate], `gate ${gate}`); }
  async getMetrics(_planId: string, runId: string) { this.calls.push(`getMetrics:${runId}`); return this.answer(runId, run => run.metrics, 'metrics'); }

  async sendCommand(command: RunCommand): Promise<Receipt> {
    this.calls.push(`sendCommand:${command.type}`);
    this.commands.push(command);
    if (this.failure) throw this.failure;
    return { ...this.receipt, commandId: command.commandId };
  }

  connection(): ConnectionState {
    return this.state;
  }

  onConnectionChange(listener: (state: ConnectionState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  setConnection(state: ConnectionState): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}
