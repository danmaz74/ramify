import type {
  CheckFindingEntry, CheckFindingId, CheckFindingObligation, CheckFindingOwner, CheckFindingReportInput,
  CheckFindingSource, CheckFindingState, CheckFindingVerification,
} from './interfaces/check-findings.js';

/*
 * Identity: the ingestion key that makes a delivered report idempotent, the
 * scoped issue key that lets a trusted producer name the same obligation
 * again, the allocation of IDs from the replayed state, and the equality of
 * the opaque references the harness supplies. Nothing here reads prose,
 * paths or line numbers: none of them forms identity.
 */

const counted = (prefix: string) => (count: number): string => `${prefix}-${String(count).padStart(4, '0')}`;

export const checkFindingId = counted('cf');
export const reportId = counted('cfr');
export const decisionId = counted('cfd');
export const relationId = counted('cfl');

/** The ingestion key of one report: producer, attempt and report key, joined by NUL so no part can impersonate another. */
export function ingestionKey(report: Pick<CheckFindingReportInput, 'producer' | 'attempt' | 'reportKey'>): string {
  return [report.producer, report.attempt, report.reportKey].join('\u0000');
}

export function ownerKey(owner: CheckFindingOwner): string {
  return owner.kind === 'run' ? 'run' : `work-item:${owner.workItem}`;
}

export function sameOwner(a: CheckFindingOwner, b: CheckFindingOwner): boolean {
  return ownerKey(a) === ownerKey(b);
}

export function sameSource(a: CheckFindingSource, b: CheckFindingSource): boolean {
  return a.kind === b.kind && a.id === b.id;
}

export function sameObligation(a: CheckFindingObligation, b: CheckFindingObligation): boolean {
  return a.subject === b.subject && a.revision === b.revision;
}

/** The verification scope an issue key is scoped by: the obligation of a check, or assessment. */
function obligationScope(verification: CheckFindingVerification): string {
  return verification.kind === 'assessment' ? 'assessment' : `check:${verification.obligation.subject}@${verification.obligation.revision}`;
}

/** An issue key scoped by owner and verification obligation, as a CheckFinding's index holds it. */
export function scopedIssueKey(owner: CheckFindingOwner, verification: CheckFindingVerification, issueKey: string): string {
  return [ownerKey(owner), obligationScope(verification), issueKey].join('\u0000');
}

/** Every CheckFinding whose index holds this scoped key, in ID order. More than one is ambiguous. */
export function issueKeyMatches(state: CheckFindingState, scoped: string): CheckFindingEntry[] {
  return [...state.findings.values()].filter(entry => entry.issueKeys.includes(scoped)).sort(byId);
}

/** The ID's number, for ordering: `cf-0010` after `cf-0009` whatever the width. */
export function idNumber(id: string): number {
  return Number(id.slice(id.lastIndexOf('-') + 1));
}

export function compareIds(a: string, b: string): number {
  return idNumber(a) - idNumber(b);
}

function byId(a: { readonly id: CheckFindingId }, b: { readonly id: CheckFindingId }): number {
  return compareIds(a.id, b.id);
}
