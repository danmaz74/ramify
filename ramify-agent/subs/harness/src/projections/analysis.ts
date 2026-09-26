import type { Hypothesis } from '../analysis/records.js';
import { runQueryLimits, type AnalysisResponse, type DecisionView, type HypothesisView } from '../interfaces/protocol/runs.js';
import { runLayout } from '../run/records.js';
import { capabilityOf } from '../work/frontier.js';
import { readRunFile, type RunView } from './inputs.js';
import { analysisScenariosOf } from './scenarios.js';
import { readAcceptedEvidence } from '../analysis/evidence.js';

/*
 * The plan and its entries with their scenarios, the hypotheses beside the
 * decisions, and the decision list.
 *
 * A hypothesis is shown at its current revision with its standing, beside
 * what revision 1 forecast, which is never rewritten. It is linked to the
 * decisions that revised it, and a placement decision to the hypothesis
 * revisions it made, so a tentative forecast and an accepted decision stay
 * visibly distinct and still point at each other.
 *
 * The decision list is a projection over the records that hold each choice.
 * There is no second copy of any of them.
 */

/** The captured plan, the entry assignments with their owners, and the hypotheses. */
export async function analysisOf(view: RunView): Promise<AnalysisResponse> {
  const markdown = (await readRunFile(view, runLayout.capturedPlan)) ?? '';
  const plan = { markdown, hash: view.record.manifest.planHash };
  const assignments = view.entryAssignments;
  if (assignments === null) return { plan, analysis: { status: 'pending' } };

  const workItemOf = new Map<string, string>();
  for (const item of view.records.workItems) {
    const capability = capabilityOf(item);
    if (capability !== null && !workItemOf.has(capability)) workItemOf.set(capability, item.id);
  }
  const entries = assignments.entries.map(entry => ({
    capability: entry.capability,
    description: entry.description,
    owner: entry.owner,
    proposed: entry.proposed === undefined
      ? null
      : { parent: entry.proposed.parent, directory: entry.proposed.directory, purpose: entry.proposed.purpose, tags: [...entry.proposed.tags] },
    workItem: workItemOf.get(entry.capability) ?? null,
  }));

  const hypotheses = hypothesesOf(view);
  const { scenarios, warnings } = analysisScenariosOf(view);
  const planEvidence = await evidenceOf(view);
  return {
    plan,
    analysis: {
      status: 'accepted',
      view: assignments.view,
      entries: entries.slice(0, runQueryLimits.analysis),
      hypotheses: hypotheses.slice(0, runQueryLimits.analysis),
      scenarios: scenarios.slice(0, runQueryLimits.scenarios),
      warnings,
      planEvidence,
      total: { entries: entries.length, hypotheses: hypotheses.length, scenarios: scenarios.length },
    },
  };
}

async function evidenceOf(view: RunView): Promise<NonNullable<Extract<AnalysisResponse['analysis'], { status: 'accepted' }>['planEvidence']>> {
  const evidence = await readAcceptedEvidence(view.directory, view.record, view.events);
  if (evidence.status === 'unavailable') return evidence;
  try {
    const paths = new Map(evidence.manifest.documents.map(document => [document.id, document.path]));
    return {
      status: 'available',
      catalog: evidence.catalog.items.map(item => ({ id: item.id, classification: item.classification, document: item.passage.document,
        path: paths.get(item.passage.document) ?? 'unknown', quote: item.passage.quote, locator: item.passage.locator ?? null,
        conditions: item.conditions, uncertainty: item.uncertainty })),
      missing: evidence.incorporation.missing.filter(item => item.judgment !== 'required').map(item => ({
        from: item.from, fromPath: paths.get(item.from) ?? 'unknown',
        excerpt: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
          evidence.bytes.get(item.from)?.subarray(item.source.start, item.source.end) ?? new Uint8Array()),
        target: item.target, start: item.source.start, end: item.source.end,
        judgment: item.judgment as 'unclear' | 'advisory', reason: item.reason,
      })),
      incorporation: evidence.incorporation.documents.map(item => ({ document: item.document, path: paths.get(item.document) ?? 'unknown',
        scenarios: item.scenarios, uncertainty: item.uncertainty,
        governing: item.governing.map(passage => ({ path: paths.get(passage.document) ?? 'unknown',
          quote: passage.quote, locator: passage.locator ?? null })) })),
    };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Every hypothesis at its current revision, with its first forecast and the decisions that revised it. */
export function hypothesesOf(view: RunView): HypothesisView[] {
  const revisions = new Map<string, Hypothesis[]>();
  for (const { body } of view.hypothesisRevisions) {
    const list = revisions.get(body.id) ?? [];
    list.push(body);
    revisions.set(body.id, list);
  }
  return [...revisions.values()].map(list => {
    const ordered = [...list].sort((a, b) => a.revision - b.revision);
    const first = ordered[0]!;
    const current = ordered.at(-1)!;
    return {
      id: current.id,
      capability: current.capability,
      revision: current.revision,
      standing: current.standing,
      change: current.change,
      changesExistingSymbols: current.changesExistingSymbols,
      suggestedOwner: current.suggestedOwner,
      confidence: current.confidence,
      rationale: current.rationale,
      dependsOn: [...current.dependsOn],
      anticipatedConsumers: [...current.anticipatedConsumers],
      initial: { change: first.change, suggestedOwner: first.suggestedOwner, rationale: first.rationale },
      decisions: [...new Set(ordered.flatMap(revision => ('decision' in revision.cause ? [revision.cause.decision] : [])))],
      supersededBy: current.supersededBy ?? null,
      confirmedBy: current.confirmedBy ?? null,
    };
  });
}

/**
 * Every choice the run made, in the order the log committed it: placement
 * decisions from `PlacementDecision`, scope and its rationale from each
 * `IterationAssignment`, breaking changes and plan revisions from each
 * `WorkItemOutline` revision, and contract design from each `ContractRecord`
 * revision.
 */
export function decisionsOf(view: RunView): DecisionView[] {
  const decisions: DecisionView[] = [];
  const committed = new Map<string, { sequence: number; at: string }>();
  for (const line of view.entries) {
    for (const record of line.transaction.records) {
      if ((record.body as { schema?: unknown } | null)?.schema === 'ramify-agent.placement-decision/1') {
        committed.set((record.body as { id: string }).id, { sequence: line.sequence, at: line.at });
      }
    }
  }

  for (const decision of view.records.decisions.values()) {
    const when = committed.get(decision.id)!;
    decisions.push({
      kind: 'placement',
      at: when.at,
      sequence: when.sequence,
      workItem: decision.workItem,
      id: decision.id,
      authority: decision.authority,
      request: decision.request,
      question: decision.question,
      outcome: decision.outcome,
      capability: decision.capability,
      changesExistingSymbols: decision.changesExistingSymbols,
      owner: decision.owner,
      proposed: decision.proposed === undefined
        ? null
        : { parent: decision.proposed.parent, directory: decision.proposed.directory, purpose: decision.proposed.purpose, tags: [...decision.proposed.tags] },
      rationale: decision.rationale,
      revises: decision.revises?.decision ?? null,
      hypotheses: decision.hypothesisRevisions.map(revision => ({ id: revision.id, revision: revision.revision })),
      registry: decision.registry.map(entry => entry.id),
    });
  }

  for (const { body: assignment, sequence, at } of view.assignments) {
    const base = assignment.scope.base;
    const broad = 'modules' in base;
    decisions.push({
      kind: 'scope',
      at,
      sequence,
      workItem: assignment.workItem,
      iteration: assignment.id,
      iterationKind: assignment.kind,
      modules: broad ? [...base.modules] : [base.module],
      includedChildren: broad ? [] : [...base.includedChildren],
      broad,
      rationale: broad ? base.rationale : assignment.scope.rationale,
      extra: assignment.scope.extra.map(extra => ({ path: extra.path, purpose: extra.purpose })),
      authorizations: assignment.authorizations.map(authorization => ({
        path: authorization.path,
        rationale: authorization.rationale,
        by: `${authorization.by.id}@${authorization.by.revision}`,
      })),
    });
  }

  for (const { body: outline, sequence, at } of view.outlines) {
    decisions.push({
      kind: 'plan-revision',
      at,
      sequence,
      workItem: outline.workItem,
      outlineRevision: outline.revision,
      decomposition: outline.decomposition.kind,
      rationale: outline.decomposition.rationale,
      reason: outline.revisionReason,
      stages: outline.stages.length,
    });
    for (const change of outline.breakingChanges) {
      decisions.push({
        kind: 'breaking',
        at,
        sequence,
        workItem: outline.workItem,
        outlineRevision: outline.revision,
        guarantee: change.guarantee,
        reason: change.reason,
        affectedConsumers: [...change.affectedConsumers],
      });
    }
  }

  for (const { body: contract, sequence, at } of view.contracts) {
    const assignment = view.records.assignments.get(contract.establishedBy.iteration);
    decisions.push({
      kind: 'contract',
      at,
      sequence,
      workItem: assignment?.workItem ?? contract.establishedBy.iteration.split('.')[0]!,
      contract: contract.id,
      revision: contract.revision,
      capability: contract.capability.id,
      provider: contract.provider,
      authority: { kind: contract.authority.kind, owner: contract.authority.owner, rationale: contract.authority.rationale },
      mode: contract.mode,
      decision: contract.decision,
      establishedBy: { iteration: contract.establishedBy.iteration, gate: contract.establishedBy.gate },
    });
  }

  return decisions.sort((a, b) => a.sequence - b.sequence);
}
