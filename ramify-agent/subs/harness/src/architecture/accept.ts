import type { RecordRef as CommitRecord } from '../jobs/commit.js';
import type { ViewIdentity } from '../interfaces/protocol/evidence.js';
import { analysisLayout, hypothesisSchema, registryEntrySchema, type Hypothesis, type RegistryEntry } from '../analysis/records.js';
import { refOf } from '../work/committed.js';
import {
  architectureLayout, placementDecisionSchema,
  type DecisionAuthority, type PlacementDecision,
} from './records.js';
import type { DecisionBody, HypothesisRevision, RegistryChange } from './submission.js';

/*
 * What one accepted placement decision commits, in the single
 * `decision-accepted` transition: the decision, the registry entries it
 * creates or revises, and the hypothesis revisions it makes.
 *
 * It is a pure function of the submission, the records committed so far and
 * the identifiers the harness derived, so a repeat after a crash derives the
 * same records with the same identifiers and the same hashes.
 */

export interface AcceptedDecision {
  readonly decision: PlacementDecision;
  readonly registry: readonly RegistryEntry[];
  readonly hypotheses: readonly Hypothesis[];
  /** Every record body the transition carries, with where each is materialized. */
  readonly records: readonly CommitRecord[];
}

export interface DecisionContext {
  readonly id: string;
  readonly authority: DecisionAuthority;
  /** The request this decision answers; null for a local decision. */
  readonly request: string | null;
  readonly workItem: string;
  readonly invocation: string;
  readonly body: DecisionBody;
  readonly registry: readonly RegistryChange[];
  readonly hypothesisRevisions?: readonly HypothesisRevision[] | undefined;
  /** The text appended to the parent context; global decisions only. */
  readonly brief?: string | undefined;
  /** The view the decision was made against, as the refresh recorded it. */
  readonly view: ViewIdentity;
  /** What the run has committed so far, which each revision counts from. */
  readonly committed: {
    readonly registry: ReadonlyMap<string, RegistryEntry>;
    readonly hypotheses: ReadonlyMap<string, Hypothesis>;
  };
}

export function acceptDecision(context: DecisionContext): AcceptedDecision {
  const registry = context.registry.map(change => {
    const current = context.committed.registry.get(change.capability);
    return registryEntrySchema.parse({
      schema: 'ramify-agent.capability/1',
      capability: change.capability,
      revision: (current?.revision ?? 0) + 1,
      behavior: change.behavior,
      owner: change.owner,
      ...(change.proposed === undefined ? {} : { proposed: change.proposed }),
      origin: context.authority === 'global' ? 'global-decision' : 'local-decision',
      decision: context.id,
      consumers: change.consumers.map(consumer => ({ ...consumer })),
      // Set by the harness, never by a submission: it is what the registry
      // already held, and a decision that moves a capability says so here.
      ...(current !== undefined && current.owner !== change.owner ? { previousOwner: current.owner } : {}),
    } satisfies RegistryEntry);
  });

  const hypotheses = (context.hypothesisRevisions ?? []).flatMap(revision => {
    const current = context.committed.hypotheses.get(revision.hypothesis);
    if (current === undefined) return [];
    return [hypothesisSchema.parse({
      ...current,
      revision: current.revision + 1,
      standing: revision.standing,
      ...(revision.change === undefined ? {} : { change: revision.change }),
      ...(revision.suggestedOwner === undefined ? {} : { suggestedOwner: revision.suggestedOwner }),
      ...(revision.anticipatedConsumers === undefined ? {} : { anticipatedConsumers: [...revision.anticipatedConsumers] }),
      ...(revision.involvedModules === undefined ? {} : { involvedModules: [...revision.involvedModules] }),
      ...(revision.dependsOn === undefined ? {} : { dependsOn: [...revision.dependsOn] }),
      ...(revision.confidence === undefined ? {} : { confidence: revision.confidence }),
      ...(revision.rationale === undefined ? {} : { rationale: revision.rationale }),
      ...(revision.assumptions === undefined ? {} : { assumptions: [...revision.assumptions] }),
      ...(revision.uncertainties === undefined ? {} : { uncertainties: [...revision.uncertainties] }),
      ...(revision.citations === undefined ? {} : { citations: revision.citations.map(citation => ({ ...citation })) }),
      ...(revision.supersededBy === undefined ? {} : { supersededBy: revision.supersededBy }),
      ...(revision.standing === 'confirmed' ? { confirmedBy: context.id } : {}),
      cause: { decision: context.id, reason: revision.reason },
    } satisfies Hypothesis)];
  });

  const decision = placementDecisionSchema.parse({
    schema: 'ramify-agent.placement-decision/1',
    id: context.id,
    authority: context.authority,
    request: context.request,
    workItem: context.workItem,
    invocation: context.invocation,
    question: context.body.question,
    outcome: context.body.outcome,
    capability: context.body.capability,
    owner: context.body.owner,
    ...(context.body.proposed === undefined ? {} : { proposed: context.body.proposed }),
    rationale: context.body.rationale,
    constraints: [...context.body.constraints],
    uncertainties: [...context.body.uncertainties],
    evidence: {
      view: context.view,
      citations: context.body.evidence.citations.map(citation => ({ ...citation })),
      gaps: [...context.body.evidence.gaps],
    },
    ...(context.body.revises === undefined ? {} : { revises: context.body.revises }),
    registry: registry.map(entry => refOf(entry.capability, entry.revision, entry)),
    hypothesisRevisions: hypotheses.map(hypothesis => refOf(hypothesis.id, hypothesis.revision, hypothesis)),
    ...(context.brief === undefined ? {} : { brief: context.brief }),
  } satisfies PlacementDecision);

  const records: CommitRecord[] = [
    { path: architectureLayout.decision(decision.id), id: decision.id, revision: 1, body: decision },
    ...registry.map(entry => ({
      path: analysisLayout.registry(entry.capability, entry.revision), id: entry.capability, revision: entry.revision, body: entry,
    })),
    ...hypotheses.map(hypothesis => ({
      path: analysisLayout.hypothesis(hypothesis.id, hypothesis.revision), id: hypothesis.id, revision: hypothesis.revision, body: hypothesis,
    })),
  ];

  return { decision, registry, hypotheses, records };
}
