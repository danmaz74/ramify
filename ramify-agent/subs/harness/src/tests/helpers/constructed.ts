import { hypothesisSchema, registryEntrySchema, type Hypothesis, type RegistryEntry } from '../../analysis/records.js';
import { consumerRequirementSchema, providerObligationSchema } from '../../contracts/records.js';
import type { CommittedLine, CommittedRun } from '../../projections/inputs.js';
import type { RunEvent } from '../../run/log.js';
import type { RunRecord } from '../../run/records.js';
import { workItemSchema, type WorkItem } from '../../work/records.js';
import { minimalProjectConfig } from './project-config.js';

/*
 * A run constructed line by line, for the projections' own tests: each line
 * is an event with the record bodies it commits, exactly the shape the run
 * service replays. The bodies are validated by their schemas as they are
 * built, so a constructed state is one the harness could have committed.
 */

export const runId = '20260921T080000Z-c0ffee';
export const reviews = 'collection-review/workspace/reviews';
export const hash = 'a'.repeat(64);

/** The record of a constructed run: only what the projections read of it. */
export function constructedRecord(extra: Partial<RunRecord> = {}): RunRecord {
  return {
    schema: 'ramify-agent.job/3',
    jobId: runId,
    planId: 'review-notes',
    kind: 'implementation',
    agent: 'scripted',
    createdAt: '2026-09-21T08:00:00.000Z',
    manifest: {
      planHash: hash, source: null,
      versions: { architectPrompt: null, procedure: null, skill: null, ramify: null },
      architectView: { status: 'placeholder' },
    },
    prompts: {},
    policy: {} as RunRecord['policy'],
    projectConfig: { path: 'ramify-agent.json', hash, config: minimalProjectConfig },
    baseline: { unavailable: 'constructed' },
    planScenarios: { scenarios: [], limitations: [] },
    reviewStop: false,
    ...extra,
  };
}

/** One line: an event and the records it commits. */
export type Line = { readonly type: RunEvent['type']; readonly data: unknown; readonly records?: ReadonlyArray<{ path: string; body: unknown }> };

/** A run of these lines, sequenced in order. */
export function constructedRun(lines: readonly Line[], record: RunRecord = constructedRecord(), directory = '/nonexistent/run'): CommittedRun {
  const entries: CommittedLine[] = lines.map((line, index) => {
    const at = new Date(Date.parse('2026-09-21T08:00:00.000Z') + index * 1000).toISOString();
    return {
      sequence: index + 1,
      at,
      transaction: {
        event: { sequence: index + 1, jobId: runId, at, type: line.type, data: line.data } as RunEvent,
        records: (line.records ?? []).map(entry => ({
          path: entry.path,
          id: (entry.body as { id?: string; capability?: string }).id ?? (entry.body as { capability?: string }).capability ?? entry.path,
          revision: (entry.body as { revision?: number }).revision ?? 1,
          body: entry.body,
        })),
      },
    };
  });
  return { record, directory, entries };
}

export function registered(capability: string, extra: Partial<RegistryEntry> = {}): RegistryEntry {
  return registryEntrySchema.parse({
    schema: 'ramify-agent.capability/1', capability, revision: 1, behavior: `The behavior of ${capability}.`,
    owner: reviews, origin: 'entry', decision: null, consumers: [], ...extra,
  });
}

export function forecast(id: string, capability: string, extra: Partial<Hypothesis> = {}): Hypothesis {
  return hypothesisSchema.parse({
    schema: 'ramify-agent.hypothesis/1', id, revision: 1, standing: 'tentative', capability,
    change: 'create', changesExistingSymbols: false, suggestedOwner: reviews, anticipatedConsumers: [], involvedModules: [],
    dependsOn: [], confidence: 'low', rationale: 'It may be needed.', assumptions: [], uncertainties: [],
    citations: [], cause: { initial: 'inv-0001' }, ...extra,
  });
}

export function item(id: string, origin: WorkItem['origin'], extra: Partial<WorkItem> = {}): WorkItem {
  return workItemSchema.parse({
    schema: 'ramify-agent.work-item/1', id, module: reviews, origin,
    goal: `The goal of ${id}.`, requirementRefs: [], acceptanceRefs: [], contextRefs: [], startedFor: null, ...extra,
  });
}

export function obligation(contract: string, capability: string, revision = 1) {
  return providerObligationSchema.parse({
    schema: 'ramify-agent.provider-obligation/1', id: `ob-${contract}`, revision,
    contract: { id: contract, revision, hash }, capability, provider: reviews, behavior: `The provider of ${capability}.`,
    evidence: { conformance: ['subs/x/src/tests/conformance.test.ts'], against: 'real' },
  });
}

export function requirement(id: string, workItem: string, forCapability: string, contract: string, revision = 1) {
  return consumerRequirementSchema.parse({
    schema: 'ramify-agent.consumer-requirement/1', id, revision, workItem, consumer: reviews, forCapability,
    obligation: `ob-${contract}`, contractRevision: revision, behavior: `What ${forCapability} needs.`,
    evidence: { tests: { policy: 'owned-by-scope', exactOwners: [reviews], subtrees: [], extraSuites: [] }, fakeInjections: [] },
  });
}

/** The path a body is materialized at; the projections read the body, not the path. */
export const at = (kind: string, id: string, revision = 1) => `${kind}/${id}/${revision}.json`;
