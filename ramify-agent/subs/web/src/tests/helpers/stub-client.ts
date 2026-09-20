import type { Command, EventPage, JobEvent, JobSnapshot, Receipt } from '../../../../harness/src/interfaces/protocol/jobs.js';
import type { MapRevision, ModuleTree, RevisionEntry } from '../../../../harness/src/interfaces/protocol/maps.js';
import type { PlanDocument, PlanEntry } from '../../../../harness/src/interfaces/protocol/queries.js';
import { ClientError, type ConnectionState, type ProjectInfo, type ProtocolClient } from '../../client.js';

export const project: ProjectInfo = { name: 'collection-review', root: '/work/collection-review', planPattern: 'plans/<plan-id>/plan.md' };

/** A protocol client answering from memory, with a settable connection state. */
export class StubClient implements ProtocolClient {
  plans: PlanEntry[] = [];
  documents = new Map<string, PlanDocument>();
  failure: ClientError | undefined;
  state: ConnectionState = 'connected';
  calls: string[] = [];
  /** Jobs by `planId/jobId`, with their events. */
  jobs = new Map<string, { job: JobSnapshot; events: JobEvent[] }>();
  commands: Command[] = [];
  /** Saved revisions by plan ID, each with its full content. */
  revisions = new Map<string, MapRevision[]>();
  tree: ModuleTree = { status: 'unavailable', message: 'The architect view has not been materialized yet.' };
  /** Answers a command; by default every command is accepted. */
  onCommand: (command: Command) => Receipt = command => ({
    commandId: command.commandId, jobId: 'jobId' in command.payload ? command.payload.jobId : 'new-job', sequence: 1, acceptedAt: '2026-09-19T12:00:00.000Z',
  });
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

  async getJob(planId: string, jobId: string): Promise<JobSnapshot> {
    this.calls.push(`getJob:${planId}/${jobId}`);
    if (this.failure) throw this.failure;
    const entry = this.jobs.get(`${planId}/${jobId}`);
    if (!entry) throw new ClientError('protocol', `No job ${jobId}`, 'not-found');
    return entry.job;
  }

  async listRevisions(planId: string): Promise<RevisionEntry[]> {
    this.calls.push(`listRevisions:${planId}`);
    if (this.failure) throw this.failure;
    return (this.revisions.get(planId) ?? []).map(saved => ({
      status: 'readable', revision: saved.revision, path: saved.path, jobId: saved.map.identity.jobId, mapHash: saved.mapHash, approval: saved.approval,
    }));
  }

  async getRevision(planId: string, revision: number): Promise<MapRevision> {
    this.calls.push(`getRevision:${planId}/${revision}`);
    if (this.failure) throw this.failure;
    const saved = this.revisions.get(planId)?.find(entry => entry.revision === revision);
    if (!saved) throw new ClientError('protocol', `No revision ${revision}`, 'not-found');
    return saved;
  }

  async getModuleTree(): Promise<ModuleTree> {
    this.calls.push('getModuleTree');
    return this.tree;
  }

  async getEvents(planId: string, jobId: string, after: number): Promise<EventPage> {
    this.calls.push(`getEvents:${planId}/${jobId}@${after}`);
    if (this.failure) throw this.failure;
    const entry = this.jobs.get(`${planId}/${jobId}`);
    if (!entry) throw new ClientError('protocol', `No job ${jobId}`, 'not-found');
    const events = entry.events.filter(event => event.sequence > after);
    return { job: entry.job, events, cursor: events.at(-1)?.sequence ?? after, more: false };
  }

  async sendCommand(command: Command): Promise<Receipt> {
    this.commands.push(command);
    return this.onCommand(command);
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
