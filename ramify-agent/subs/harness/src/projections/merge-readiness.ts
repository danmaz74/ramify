import type { AcceptedEvidence } from '../analysis/evidence.js';
import { assessmentSchema } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { currentDeviationDecision } from '../deviations/readiness-decision.js';
import { deviationHash } from '../deviations/finding.js';
import { planDeviationSchema } from '../deviations/records.js';
import { nonfunctionalDeviationHash } from '../deviations/nonfunctional.js';
import { replayCheckFindingState } from '../check-findings/state.js';
import { replayNonfunctionalPhase } from '../run/nonfunctional-phase.js';
import { decideNonfunctionalRound } from '../../subs/nonfunctional/src/rounds.js';
import { projectMergeReadiness, type ReadinessDeviation } from '../run/merge-readiness.js';
import {
  legacyNonfunctionalCoverage, nonfunctionalDeviationSchema,
  type MergeReadiness,
} from '../run/nonfunctional-records.js';
import { invocationOutcomeSchema, runLayout } from '../run/records.js';
import type { RunView, CommittedLine } from './inputs.js';

const unavailable = (reason: string): MergeReadiness => ({
  status: 'unavailable', candidate: null, finalGate: null, checkFindings: [], reason,
});

function recordOf<T>(line: CommittedLine | undefined, path: string, parse: (body: unknown) => T | null): T | null {
  const matching = line?.transaction.records.filter(record => record.path === path) ?? [];
  return matching.length === 1 ? parse(matching[0]!.body) : null;
}

function authenticUserCommand(view: RunView, finding: string, decision: { decisionId: string; revision: number; command: string }): boolean {
  return view.entries.some(line => {
    const event = line.transaction.event;
    return event.type === 'check-findings-recorded' && event.data.cause.kind === 'user-command'
      && event.data.cause.command.commandId === decision.command
      && event.data.cause.command.receipt.commandId === decision.command
      && event.data.checkFindings.some(child => child.type === 'check-finding-decided'
        && child.data.checkFinding === finding && child.data.decision.id === decision.decisionId
        && child.data.revision === decision.revision);
  });
}

function authenticCoordinator(view: RunView, invocation: string): boolean {
  const started = view.entries.filter(line => line.transaction.event.type === 'invocation-started'
    && line.transaction.event.data.invocation === invocation
    && line.transaction.event.data.role === 'nonfunctional-coordinator');
  const ended = view.entries.filter(line => line.transaction.event.type === 'invocation-ended'
    && line.transaction.event.data.invocation === invocation
    && line.transaction.event.data.ended === 'submitted');
  if (started.length !== 1 || ended.length !== 1) return false;
  const start = started[0]!;
  const end = ended[0]!;
  if (start.sequence >= end.sequence || start.transaction.event.type !== 'invocation-started'
    || end.transaction.event.type !== 'invocation-ended'
    || start.transaction.event.data.session !== end.transaction.event.data.session) return false;
  const outcome = recordOf(end, runLayout.outcome(invocation), body => invocationOutcomeSchema.safeParse(body).data ?? null);
  return outcome?.invocation === invocation && outcome.ended === 'submitted' && outcome.disposition === 'applied'
    && outcome.submission?.hash === end.transaction.event.data.submission;
}

/** One immutable run view supplies every identity; disk reads happen before this pure composition. */
export function mergeReadinessOf(view: RunView, evidence: AcceptedEvidence): MergeReadiness {
  const final = [...view.gates.values()].filter(entry => entry.body.checkpoint === 'final').at(-1)?.body;
  if (final && final.verdict !== 'passed') return projectMergeReadiness({
    completed: false, candidate: null, finalGate: { id: final.id, tree: '', assessment: '', passed: false },
    nfrIds: null, assessment: null, deviations: [],
  });
  if (evidence.status === 'unavailable') {
    return view.record.manifest.documentManifest === undefined
      ? legacyNonfunctionalCoverage(view.record.manifest) : unavailable(evidence.reason);
  }
  const completed = view.events.find(event => event.type === 'job-completed');
  const bound = [...view.events].reverse().find(event => event.type === 'candidate-bound-to-gate'
    && event.data.gate === completed?.data.gate);
  if (!completed || !bound || bound.type !== 'candidate-bound-to-gate') return unavailable('No completed candidate is bound to the final gate');
  const gate = view.gates.get(bound.data.gate)?.body;
  const audit = view.gateAuditOutcomes.get(bound.data.gate)?.body;
  if (gate?.checkpoint !== 'final' || gate.verdict !== 'passed'
    || gate.audited !== bound.data.commit || completed.data.commit !== bound.data.commit
    || audit?.overall !== 'pass' || audit.audited !== bound.data.commit) {
    return unavailable('The final gate, audit and candidate binding disagree');
  }
  const nfrIds = evidence.catalog.items.filter(item => item.classification === 'non-functional-requirement').map(item => item.id);
  const phase = replayNonfunctionalPhase(view.entries, nfrIds, view.record.policy.limits.nonfunctionalRoundsPerPlan ?? 0);
  if (!phase.ok) return unavailable(`The committed assessment phase is inconsistent: ${phase.reason}`);
  const next = decideNonfunctionalRound(phase.value.input);
  if (next.action !== 'stop' || (next.outcome !== 'satisfied' && next.outcome !== 'exhausted')) {
    return unavailable('The final non-functional round has not closed with a usable outcome');
  }
  const settled = phase.value.final;
  if (!settled || settled.candidateId !== bound.data.candidate
    || settled.assessment.id !== bound.data.assessment
    || settled.candidate.tree !== bound.data.tree) {
    return unavailable('The completed candidate differs from the final closed assessment round');
  }
  const assessed = view.entries.filter(line => line.transaction.event.type === 'nonfunctional-assessed');
  for (const line of assessed) {
    if (line.transaction.event.type !== 'nonfunctional-assessed') continue;
    const recorded = recordOf(line, runLayout.assessment(line.transaction.event.data.assessment),
      body => assessmentSchema.safeParse(body).data ?? null);
    if (!recorded || (nfrIds.length === 0
      ? recorded.coordinatorInvocation !== 'harness:empty-catalog'
      : !authenticCoordinator(view, recorded.coordinatorInvocation))) {
      return unavailable('An assessment lacks truthful committed coordinator provenance');
    }
  }

  const findings = replayCheckFindingState(view.entries).findings;
  const deviations: ReadinessDeviation[] = [];
  const paths = new Map(evidence.manifest.documents.map(document => [document.id, document]));
  for (const line of view.entries) {
    const event = line.transaction.event;
    if (event.type !== 'plan-deviation-recorded' && event.type !== 'nonfunctional-deviation-recorded') continue;
    const nfr = event.type === 'nonfunctional-deviation-recorded';
    const path = nfr ? runLayout.nonfunctionalDeviation(event.data.deviation) : `deviations/${event.data.deviation}.json`;
    const record = nfr
      ? recordOf(line, path, body => nonfunctionalDeviationSchema.safeParse(body).data ?? null)
      : recordOf(line, path, body => planDeviationSchema.safeParse(body).data ?? null);
    if (!record || record.id !== event.data.deviation || record.checkFinding !== event.data.checkFinding) {
      return unavailable(`Deviation ${event.data.deviation} has no matching committed record`);
    }
    const entry = findings.get(record.checkFinding);
    const hash = nfr ? nonfunctionalDeviationHash(record as Extract<typeof record, { origin: unknown }>)
      : deviationHash(record as Exclude<typeof record, { origin: unknown }>);
    const first = entry?.reports[0];
    const last = entry?.reports.at(-1);
    if (!entry || entry.owner.kind !== 'run' || first?.observation.kind !== 'plan-deviation'
      || entry.reports[0].judgment?.ground?.ref !== path || entry.reports[0].judgment.ground.hash !== hash) {
      return unavailable(`Deviation ${record.id} has no source-bound CheckFinding`);
    }
    if (!last || last.source.kind !== first.source.kind || last.source.id !== first.source.id
      || last.judgment?.ground?.ref !== path || last.judgment.ground.hash !== hash) {
      return unavailable(`Deviation ${record.id} changed source after its first report`);
    }
    if (nfr) {
      const detail = record as Extract<typeof record, { origin: unknown }>;
      const document = paths.get(detail.passage.document);
      const catalogItem = evidence.catalog.items.find(item => item.id === detail.origin.nfr);
      if (!document || entry.reports[0].source.kind !== 'document'
        || entry.reports[0].source.id !== `${document.path}@sha256:${document.sha256}`
        || detail.origin.nfr !== event.data.nfr || detail.origin.assessment !== event.data.assessment
        || catalogItem?.classification !== 'non-functional-requirement'
        || JSON.stringify(catalogItem.passage) !== JSON.stringify(detail.passage)) {
        return unavailable(`Deviation ${record.id} has mismatched NFR source or assessment`);
      }
    } else if (event.type === 'plan-deviation-recorded') {
      const detail = record as Exclude<typeof record, { origin: unknown }>;
      if (detail.workItem !== event.data.workItem || detail.request !== event.data.request
        || detail.invocation !== event.data.invocation) {
        return unavailable(`Deviation ${record.id} differs from its recorded work-item origin`);
      }
    }
    const current = currentDeviationDecision(entry);
    if (!current && entry.decisions.some(decision => decision.actor.kind === 'user')) {
      return unavailable(`Deviation ${record.id} has no current user decision at this revision`);
    }
    if (current && !authenticUserCommand(view, record.checkFinding, current)) {
      return unavailable(`Deviation ${record.id} has no accepted current user command`);
    }
    deviations.push({ origin: nfr ? (record as Extract<typeof record, { origin: unknown }>).origin : {
      kind: 'work-item-conflict', request: (record as Exclude<typeof record, { origin: unknown }>).request,
      workItem: (record as Exclude<typeof record, { origin: unknown }>).workItem,
      architectInvocation: (record as Exclude<typeof record, { origin: unknown }>).invocation,
    }, checkFinding: record.checkFinding, findingRevision: entry.revision,
    decision: current ? { standing: current.standing, revision: current.revision } : null });
  }
  return projectMergeReadiness({ completed: true, candidate: settled.candidate,
    finalGate: { id: gate.id, tree: bound.data.tree, assessment: settled.assessment.id, passed: true },
    nfrIds, assessment: settled.assessment, deviations });
}
