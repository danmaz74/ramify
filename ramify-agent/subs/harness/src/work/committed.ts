import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RecordRef } from '../run/records.js';
import { hypothesisSchema, registryEntrySchema, type Hypothesis, type RegistryEntry } from '../analysis/records.js';
import { workItemOutlineSchema, workItemSchema, type WorkItem, type WorkItemOutline } from './records.js';
import { iterationAssignmentSchema, iterationResultSchema, type IterationAssignment, type IterationResult } from './iterations.js';
import { invocationOutcomeSchema, invocationSchema, type Invocation, type InvocationOutcome } from '../run/records.js';
import {
  placementDecisionSchema, placementRequestSchema,
  type PlacementDecision, type PlacementRequest,
} from '../architecture/records.js';
import {
  consumerRequirementSchema, contractRecordSchema, providerObligationSchema,
  type ConsumerRequirement, type ContractRecord, type ProviderObligation,
} from '../contracts/records.js';

/*
 * The records a run has committed, read from the log rather than from the
 * files. The log is the authority and each file is a materialized copy of
 * it, so a run that has just been recovered and one that never crashed
 * answer the same thing here.
 *
 * Each record is validated again as it is read back: a body the log holds
 * that no longer satisfies its schema is a failure with evidence, never a
 * record that quietly changes shape.
 */

/** The bytes a record file holds, which the ledger writes pretty-printed with a trailing newline. */
export function recordHash(body: unknown): string {
  return createHash('sha256').update(`${JSON.stringify(body, null, 2)}\n`).digest('hex');
}

export interface CommittedRecords {
  /** Every hypothesis at its highest committed revision. */
  readonly hypotheses: readonly Hypothesis[];
  /** Every registry entry at its highest committed revision, in committed order. */
  readonly registry: readonly RegistryEntry[];
  readonly workItems: readonly WorkItem[];
  /** Each work item's outline revisions, oldest first. */
  readonly outlines: ReadonlyMap<string, readonly WorkItemOutline[]>;
  /** Every iteration assignment, by its identifier, in committed order. */
  readonly assignments: ReadonlyMap<string, IterationAssignment>;
  /** Every iteration result, by the iteration it closed. */
  readonly results: ReadonlyMap<string, IterationResult>;
  /** Every invocation, by its identifier: the work each one belongs to. */
  readonly invocations: ReadonlyMap<string, Invocation>;
  /** Every invocation outcome, by the invocation it closed. */
  readonly outcomes: ReadonlyMap<string, InvocationOutcome>;
  /** Every placement request, by its identifier, in committed order. */
  readonly requests: ReadonlyMap<string, PlacementRequest>;
  /** Every placement decision, global and local, by its identifier, in committed order. */
  readonly decisions: ReadonlyMap<string, PlacementDecision>;
  /** Every contract at its highest committed revision. */
  readonly contracts: ReadonlyMap<string, ContractRecord>;
  /** Every provider obligation at its highest committed revision. */
  readonly obligations: ReadonlyMap<string, ProviderObligation>;
  /** Every consumer requirement at its highest committed revision. */
  readonly requirements: ReadonlyMap<string, ConsumerRequirement>;
}

/** A record the log holds whose body no longer satisfies its schema. */
export class CommittedRecordError extends Error {
  constructor(readonly path: string, readonly errors: readonly string[]) {
    super(`${path}: ${errors.join('; ')}`);
    this.name = 'CommittedRecordError';
  }
}

/**
 * One replayed line, as far as this reader is concerned: the record bodies
 * it carries. It is stated structurally so that the reader is a projection
 * over what the log holds and nothing more.
 */
export interface ReplayedLine {
  readonly transaction: { readonly records: ReadonlyArray<{ readonly path: string; readonly body: unknown }> };
}

/** Every record of the analysis and the work items, as the log committed them. */
export function committedRecords(entries: readonly ReplayedLine[]): CommittedRecords {
  const hypotheses = new Map<string, Hypothesis>();
  const registry = new Map<string, RegistryEntry>();
  const workItems = new Map<string, WorkItem>();
  const outlines = new Map<string, WorkItemOutline[]>();
  const assignments = new Map<string, IterationAssignment>();
  const results = new Map<string, IterationResult>();
  const invocations = new Map<string, Invocation>();
  const outcomes = new Map<string, InvocationOutcome>();
  const requests = new Map<string, PlacementRequest>();
  const decisions = new Map<string, PlacementDecision>();
  const contracts = new Map<string, ContractRecord>();
  const obligations = new Map<string, ProviderObligation>();
  const requirements = new Map<string, ConsumerRequirement>();

  for (const entry of entries) {
    for (const record of entry.transaction.records) {
      const declared = typeof record.body === 'object' && record.body !== null
        ? (record.body as { schema?: unknown }).schema
        : undefined;
      switch (declared) {
        case 'ramify-agent.hypothesis/1': {
          const value = parse(hypothesisSchema, record.body, record.path);
          const current = hypotheses.get(value.id);
          if (current === undefined || value.revision >= current.revision) hypotheses.set(value.id, value);
          break;
        }
        case 'ramify-agent.capability/1': {
          const value = parse(registryEntrySchema, record.body, record.path);
          const current = registry.get(value.capability);
          if (current === undefined || value.revision >= current.revision) registry.set(value.capability, value);
          break;
        }
        case 'ramify-agent.work-item/1': {
          const value = parse(workItemSchema, record.body, record.path);
          workItems.set(value.id, value);
          break;
        }
        case 'ramify-agent.work-item-outline/1': {
          const value = parse(workItemOutlineSchema, record.body, record.path);
          const list = outlines.get(value.workItem) ?? [];
          list.push(value);
          outlines.set(value.workItem, list);
          break;
        }
        case 'ramify-agent.iteration-assignment/1': {
          const value = parse(iterationAssignmentSchema, record.body, record.path);
          assignments.set(value.id, value);
          break;
        }
        case 'ramify-agent.iteration-result/1': {
          const value = parse(iterationResultSchema, record.body, record.path);
          results.set(value.iteration, value);
          break;
        }
        case 'ramify-agent.invocation/1': {
          const value = parse(invocationSchema, record.body, record.path);
          invocations.set(value.id, value);
          break;
        }
        case 'ramify-agent.invocation-outcome/1': {
          const value = parse(invocationOutcomeSchema, record.body, record.path);
          outcomes.set(value.invocation, value);
          break;
        }
        case 'ramify-agent.placement-request/1': {
          const value = parse(placementRequestSchema, record.body, record.path);
          requests.set(value.id, value);
          break;
        }
        case 'ramify-agent.placement-decision/1': {
          const value = parse(placementDecisionSchema, record.body, record.path);
          decisions.set(value.id, value);
          break;
        }
        case 'ramify-agent.contract/1': {
          const value = parse(contractRecordSchema, record.body, record.path);
          const current = contracts.get(value.id);
          if (current === undefined || value.revision >= current.revision) contracts.set(value.id, value);
          break;
        }
        case 'ramify-agent.provider-obligation/1': {
          const value = parse(providerObligationSchema, record.body, record.path);
          const current = obligations.get(value.id);
          if (current === undefined || value.revision >= current.revision) obligations.set(value.id, value);
          break;
        }
        case 'ramify-agent.consumer-requirement/1': {
          const value = parse(consumerRequirementSchema, record.body, record.path);
          const current = requirements.get(value.id);
          if (current === undefined || value.revision >= current.revision) requirements.set(value.id, value);
          break;
        }
        default:
          break;
      }
    }
  }

  return {
    hypotheses: [...hypotheses.values()],
    registry: [...registry.values()],
    workItems: [...workItems.values()],
    outlines,
    assignments,
    results,
    invocations,
    outcomes,
    requests,
    decisions,
    contracts,
    obligations,
    requirements,
  };
}

/** The reference of one record at the revision the log committed. */
export function refOf(id: string, revision: number, body: unknown): RecordRef {
  return { id, revision, hash: recordHash(body) };
}

function parse<T>(schema: z.ZodType<T>, body: unknown, path: string): T {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  throw new CommittedRecordError(path, result.error.issues.map(issue => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`));
}
