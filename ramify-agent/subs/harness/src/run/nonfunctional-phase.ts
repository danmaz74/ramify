import type { LedgerEntry, RecordBody } from '../../subs/ledger/src/ledger.js';
import type { RunEvent } from './log.js';
import { runLayout } from './records.js';
import { preparedCandidateSchema, nonfunctionalRepairAssignmentSchema, type NonfunctionalRepairAssignment } from './nonfunctional-records.js';
import { assessmentCoverage, assessmentSchema, roundSchema, type Assessment, type Candidate } from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { decideNonfunctionalRound, type ClosedRound, type RoundDecisionInput } from '../../subs/nonfunctional/src/rounds.js';

export interface CommittedNonfunctionalPhase {
  /** Only committed facts enter the pure round transition rule. */
  readonly input: RoundDecisionInput;
  readonly candidateId: string | null;
  readonly initialCandidateId: string | null;
  readonly assessment: Assessment | null;
  readonly investigationInvocations: readonly string[];
  readonly investigatedNfrs: readonly string[];
  readonly assignment: NonfunctionalRepairAssignment | null;
  readonly repair: { readonly invocation: string; readonly assignment: string } | null;
  /** The last closed round's assessment and candidate are retained for the final gate. */
  readonly final: { readonly candidateId: string; readonly candidate: Candidate; readonly assessment: Assessment } | null;
}

export type NonfunctionalPhaseReplay =
  | { readonly ok: true; readonly value: CommittedNonfunctionalPhase }
  | { readonly ok: false; readonly reason: string };

function soleRecord<T>(records: readonly RecordBody[], path: string, id: string, parse: (value: unknown) => T): T {
  const matches = records.filter(record => record.path === path && record.id === id && record.revision === 1);
  if (matches.length !== 1) throw new Error(`expected one co-committed ${path} record for ${id}`);
  return parse(matches[0]!.body);
}

/**
 * Rebuild one bounded phase from its ledger transactions, including valid
 * prefixes left by a crash. A missing or mismatched co-committed record is
 * unavailable rather than evidence that the step never happened.
 */
export function replayNonfunctionalPhase(
  entries: readonly LedgerEntry<RunEvent>[],
  nfrIds: readonly string[],
  maxRounds: number,
): NonfunctionalPhaseReplay {
  try {
    const closedRounds: ClosedRound[] = [];
    let candidate: Candidate | null = null;
    let candidateId: string | null = null;
    let initialCandidateId: string | null = null;
    let initial: Assessment | null = null;
    let reassessment: Assessment | null = null;
    let investigationInvocations: string[] = [];
    let investigatedNfrs: string[] = [];
    let assignment: NonfunctionalRepairAssignment | null = null;
    let repair: { invocation: string; assignment: string } | null = null;
    let final: CommittedNonfunctionalPhase['final'] = null;
    const candidateIds = new Set<string>();
    const assessmentIds = new Set<string>();
    const invocationIds = new Set<string>();
    const assignmentIds = new Set<string>();
    let markerSeen = false;
    const requireFact = (condition: unknown, reason: string): void => { if (!condition) throw new Error(reason); };

    for (const entry of entries) {
      const { event, records } = entry.transaction;
      const round = closedRounds.length + 1;
      switch (event.type) {
        case 'nonfunctional-phase-started': {
          requireFact(!markerSeen && candidateIds.size === 0, 'phase marker is duplicated or late');
          requireFact(event.data.maxRounds === maxRounds, 'phase round bound differs from captured policy');
          markerSeen = true;
          break;
        }
        case 'candidate-prepared': {
          requireFact(markerSeen, 'candidate prepared without a phase marker');
          requireFact(candidate === null, 'candidate prepared before the prior candidate was consumed');
          requireFact(initial === null || repair !== null, 'candidate prepared again without a committed repair');
          requireFact(!candidateIds.has(event.data.candidate), 'candidate ID was reused');
          const prepared = soleRecord(records, runLayout.candidate(event.data.candidate), event.data.candidate,
            value => preparedCandidateSchema.parse(value));
          requireFact(prepared.candidate.tree === event.data.tree, 'candidate event tree differs from its record');
          candidate = prepared.candidate;
          candidateId = event.data.candidate;
          candidateIds.add(candidateId);
          if (initial === null) initialCandidateId = candidateId;
          break;
        }
        case 'nonfunctional-assessed': {
          requireFact(event.data.round === round, 'assessment belongs to another round');
          const preparedCandidate = candidate;
          if (preparedCandidate === null || candidateId !== event.data.candidate) {
            throw new Error('assessment has no matching prepared candidate');
          }
          const assessment = soleRecord(records, runLayout.assessment(event.data.assessment), event.data.assessment,
            value => assessmentSchema.parse(value));
          requireFact(!assessmentIds.has(assessment.id), 'assessment ID was reused');
          requireFact(assessment.id === event.data.assessment && assessment.round === round
            && assessment.phase === event.data.phase
            && assessment.candidate.tree === preparedCandidate.tree
            && assessment.candidate.head === preparedCandidate.head
            && assessment.candidate.preparedAt === preparedCandidate.preparedAt,
          'assessment event, record and candidate disagree');
          requireFact(assessmentCoverage(assessment, nfrIds).length === 0, 'assessment does not cover fixed NFR IDs exactly once');
          assessmentIds.add(assessment.id);
          if (event.data.phase === 'initial') {
            requireFact(initial === null && repair === null, 'duplicate or late initial assessment');
            initial = assessment;
          } else {
            requireFact(initial !== null && repair !== null && reassessment === null, 'reassessment lacks one committed repair');
            reassessment = assessment;
          }
          break;
        }
        case 'nonfunctional-investigated': {
          requireFact(event.data.round === round && initial?.id === event.data.assessment && repair === null,
            'investigation does not follow this round\'s initial assessment');
          requireFact(!invocationIds.has(event.data.invocation), 'investigation invocation was committed twice');
          const targets = event.data.nfrs ?? [];
          requireFact(targets.length > 0 && new Set(targets).size === targets.length,
            'investigation has no distinct target NFR IDs');
          const unresolved = new Set(initial!.results.filter(item => item.result !== 'satisfied').map(item => item.nfr));
          requireFact(targets.every(nfr => unresolved.has(nfr)), 'investigation targets an NFR not unresolved in the current assessment');
          requireFact(targets.some(nfr => !investigatedNfrs.includes(nfr)),
            'investigation adds no new NFR evidence');
          invocationIds.add(event.data.invocation);
          investigationInvocations.push(event.data.invocation);
          for (const nfr of targets) {
            requireFact(nfrIds.includes(nfr), `investigation names unknown ${nfr}`);
            if (!investigatedNfrs.includes(nfr)) investigatedNfrs.push(nfr);
          }
          break;
        }
        case 'nonfunctional-repair-assigned': {
          requireFact(event.data.round === round && initial?.id === event.data.assessment
            && candidateId === event.data.candidate && repair === null && assignment === null,
          'repair assignment does not follow the current assessment and candidate');
          requireFact(!assignmentIds.has(event.data.assignment), 'repair assignment ID was reused');
          const next = decideNonfunctionalRound({ nfrIds, maxRounds, closedRounds, candidate, initial,
            investigated: investigationInvocations.length > 0, repairCommitted: false, reassessment });
          requireFact(next.action === 'repair-or-close', `repair assignment is not permitted while next action is ${next.action}`);
          const targets = event.data.nfrs;
          const unresolved = new Set(initial!.results.filter(item => item.result !== 'satisfied').map(item => item.nfr));
          const undetermined = new Set(initial!.results.filter(item => item.result === 'undetermined').map(item => item.nfr));
          requireFact(targets.length > 0 && new Set(targets).size === targets.length
            && targets.every(nfr => unresolved.has(nfr) && (!undetermined.has(nfr) || investigatedNfrs.includes(nfr))),
          'repair assignment targets satisfied, duplicate, or uninvestigated NFR IDs');
          const body = soleRecord(records, runLayout.nonfunctionalRepairAssignment(event.data.assignment), event.data.assignment,
            value => nonfunctionalRepairAssignmentSchema.parse(value));
          requireFact(body.round === round && body.assessment === event.data.assessment
            && body.candidate === event.data.candidate && body.startingModule === event.data.startingModule
            && JSON.stringify(body.nfrs) === JSON.stringify(event.data.nfrs), 'repair assignment event and record disagree');
          assignmentIds.add(body.id);
          assignment = body;
          break;
        }
        case 'nonfunctional-repair-committed': {
          requireFact(event.data.round === round && initial !== null && repair === null
            && assignment?.id === event.data.assignment,
            'repair does not follow one initial assessment');
          requireFact(!invocationIds.has(event.data.invocation), 'repair invocation ID was reused');
          invocationIds.add(event.data.invocation);
          repair = { invocation: event.data.invocation, assignment: event.data.assignment };
          candidate = null;
          candidateId = null;
          break;
        }
        case 'nonfunctional-round-closed': {
          requireFact(event.data.round === round, 'round closure is out of order');
          if (event.data.outcome !== 'unavailable') {
            const decision = decideNonfunctionalRound({ nfrIds, maxRounds, closedRounds, candidate, initial,
              investigated: investigationInvocations.length > 0, repairCommitted: repair !== null, reassessment });
            requireFact(decision.action === 'close' || decision.action === 'repair-or-close',
              `round closed while next action is ${decision.action}`);
          }
          const record = soleRecord(records, runLayout.nonfunctionalRound(round), event.data.record,
            value => roundSchema.parse(value));
          requireFact(record.number === round && record.outcome === event.data.outcome && record.initial === initial?.id
            && record.investigation === (investigationInvocations.at(-1) ?? null)
            && record.repair === (repair?.assignment ?? null)
            && record.reassessment === (reassessment?.id ?? null), 'round event and record disagree');
          requireFact(record.outcome === 'unavailable' || (candidate !== null && (repair === null || reassessment !== null)),
            'round closed without an assessment of its final candidate');
          if (record.outcome !== 'unavailable') {
            const results = (reassessment ?? initial)?.results;
            requireFact(results !== undefined, 'round closed without an assessment');
            requireFact(!initial?.results.some(item => item.result === 'undetermined')
              || investigationInvocations.length > 0, 'undetermined evidence was closed without investigation');
            const expected = results!.every(item => item.result === 'satisfied')
              ? 'satisfied' : round === maxRounds ? 'exhausted' : 'continue';
            requireFact(record.outcome === expected, `round outcome ${record.outcome} disagrees with assessed results`);
          }
          if (record.outcome !== 'unavailable') {
            requireFact(candidateId !== null && (reassessment ?? initial) !== null, 'closed round lacks candidate-bound evidence');
            final = { candidateId: candidateId!, candidate: candidate!, assessment: (reassessment ?? initial)! };
          }
          closedRounds.push(record);
          candidate = null;
          candidateId = null;
          initialCandidateId = null;
          initial = null;
          reassessment = null;
          investigationInvocations = [];
          investigatedNfrs = [];
          assignment = null;
          repair = null;
          break;
        }
        default:
          break;
      }
    }
    const input: RoundDecisionInput = {
      nfrIds, maxRounds, closedRounds, candidate, initial,
      investigated: investigationInvocations.length > 0, repairCommitted: repair !== null, reassessment,
    };
    decideNonfunctionalRound(input);
    return { ok: true, value: { input, candidateId, initialCandidateId, assessment: reassessment ?? initial,
      investigationInvocations, investigatedNfrs, assignment, repair, final } };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
