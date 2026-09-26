import { createHash } from 'node:crypto';
import type { CheckFindingCommand, CheckFindingState } from '../../subs/check-findings/src/interfaces/check-findings.js';
import {
  resolvePassage, type Catalog, type DocumentManifest,
} from '../../subs/plan-evidence/src/interfaces/contracts.js';
import {
  type Assessment, type Candidate,
} from '../../subs/nonfunctional/src/interfaces/contracts.js';
import { reportCommand } from '../check-findings/report.js';
import { canonicalJson } from '../jobs/commands.js';
import { nonfunctionalDeviationSchema } from '../run/nonfunctional-records.js';
import { nextCheckFinding, planDeviationOptions, planDeviationProducer } from './finding.js';

type NfrItem = Catalog['items'][number];
type AssessmentResult = Assessment['results'][number];
export type NonfunctionalDeviation = ReturnType<typeof nonfunctionalDeviationSchema.parse>;

export interface NonfunctionalDeviationInput {
  readonly id: string;
  readonly checkFinding: string;
  readonly item: NfrItem;
  readonly manifest: DocumentManifest;
  readonly bytes: ReadonlyMap<string, Uint8Array>;
  readonly assessment: Assessment;
  readonly result: AssessmentResult;
  readonly candidate: Candidate;
  readonly coordinatorInvocation: string;
  readonly proposedAlternative: string;
  readonly uncertainty: string;
}

/** Preserve an exhausted assessment's accepted architect wording. */
export function prepareNonfunctionalDeviation(input: NonfunctionalDeviationInput):
  { readonly ok: true; readonly record: NonfunctionalDeviation } |
  { readonly ok: false; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const { item, assessment, result, candidate, manifest } = input;
  if (item.classification !== 'non-functional-requirement' || !item.id.startsWith('nfr-')) errors.push('The item is not a fixed NFR');
  const document = manifest.documents.find(candidate => candidate.id === item.passage.document);
  if (document === undefined || document.kind !== 'plan') errors.push('The NFR passage is not from a captured plan document');
  const passage = resolvePassage(manifest, item.passage, input.bytes.get(item.passage.document));
  if (passage.status === 'unavailable') errors.push(passage.reason);
  if (result.nfr !== item.id || result.result === 'satisfied') errors.push('The NFR was not assessed as exhausted');
  const matches = assessment.results.filter(candidate => candidate.nfr === item.id);
  if (matches.length !== 1 || canonicalJson(matches[0]) !== canonicalJson(result)) errors.push('The result is not the unique recorded assessment result');
  if (assessment.candidate.tree !== candidate.tree || assessment.candidate.head !== candidate.head
    || assessment.candidate.preparedAt !== candidate.preparedAt) errors.push('The assessment names another candidate');
  if (assessment.coordinatorInvocation !== input.coordinatorInvocation) errors.push('The coordinator invocation differs from the assessment');
  if (input.proposedAlternative.trim() === '' && input.uncertainty.trim() === '') errors.push('An absent alternative needs explicit uncertainty');
  if (errors.length > 0) return { ok: false, errors };
  const parsed = nonfunctionalDeviationSchema.safeParse({
    schema: 'ramify-agent.nonfunctional-deviation/1', id: input.id,
    origin: { kind: 'nonfunctional-assessment', nfr: item.id, assessment: assessment.id,
      candidate, coordinatorInvocation: input.coordinatorInvocation },
    passage: item.passage, evidence: [...result.evidence],
    uncertainty: input.uncertainty, proposedAlternative: input.proposedAlternative,
    checkFinding: input.checkFinding,
  });
  return parsed.success ? { ok: true, record: parsed.data }
    : { ok: false, errors: parsed.error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`) };
}

/** Hash the canonical record so the bounded report links to its full source text. */
export function nonfunctionalDeviationHash(record: NonfunctionalDeviation): string {
  return `sha256:${createHash('sha256').update(canonicalJson(record), 'utf8').digest('hex')}`;
}

function bounded(text: string, recordRef: string, limit = 4000): string {
  if (text.length <= limit) return text;
  const suffix = `… Exact text: ${recordRef}`;
  return `${text.slice(0, Math.max(1, limit - suffix.length))}${suffix}`;
}

/** A run-owned plan-deviation signal with the same post-terminal user options. */
export function nonfunctionalDeviationCommands(
  state: CheckFindingState, record: NonfunctionalDeviation,
  manifest: DocumentManifest, bytes: ReadonlyMap<string, Uint8Array>, recordRef: string,
): { readonly ok: true; readonly commands: readonly CheckFindingCommand[] } |
  { readonly ok: false; readonly errors: readonly string[] } {
  if (record.checkFinding !== nextCheckFinding(state)) return { ok: false, errors: ['The CheckFinding ID is not next in replayed state'] };
  const document = manifest.documents.find(item => item.id === record.passage.document);
  const content = bytes.get(record.passage.document);
  const passage = resolvePassage(manifest, record.passage, content);
  if (document === undefined || content === undefined || passage.status === 'unavailable') {
    return { ok: false, errors: [passage.status === 'unavailable' ? passage.reason : 'Captured source unavailable'] };
  }
  const hash = nonfunctionalDeviationHash(record);
  const source = { kind: 'document' as const, id: `${document.path}@sha256:${document.sha256}` };
  const ground = { ref: recordRef, hash };
  const citation = { kind: 'plan-deviation', ref: recordRef, hash };
  const report = reportCommand({
    producer: planDeviationProducer, attempt: record.origin.coordinatorInvocation,
    reportKey: record.id, owner: { kind: 'run' }, source, issueKey: null,
    verification: { kind: 'assessment' }, observation: {
      kind: 'plan-deviation',
      summary: bounded(`Non-functional deviation ${record.id} from ${record.origin.nfr}: ${record.passage.quote}`, recordRef, 600),
      evidence: [citation], locations: [],
    },
    judgment: {
      actor: { kind: 'agent', role: 'nonfunctional-coordinator', invocation: record.origin.coordinatorInvocation },
      consequence: bounded(`The requirement ${record.origin.nfr} remains ${record.proposedAlternative || 'without a proposed alternative'}.`, recordRef),
      rationale: bounded(`Assessment ${record.origin.assessment} did not establish satisfaction; evidence: ${record.evidence.join('; ') || 'none recorded'}.`, recordRef),
      uncertainty: bounded(record.uncertainty || 'No further uncertainty stated.', recordRef),
      remedy: null, risk: 'high', ground,
    },
    suggests: null, credibility: 'agent-generated', modules: [],
  });
  const request: CheckFindingCommand = {
    type: 'dispose', checkFinding: record.checkFinding, expectedRevision: 1,
    decision: {
      actor: { kind: 'harness', reason: 'a non-functional plan deviation is the person\'s to accept or reject' },
      source, rationale: `The assessment of ${record.origin.nfr} left this requirement unsatisfied or undetermined`,
      evidence: [citation], communication: { mode: 'quiet' },
      decision: {
        action: 'request-user-decision', authority: { kind: 'governing-record', ref: recordRef },
        conflicts: [{ text: bounded(record.passage.quote, recordRef), document: document.path,
          revision: `sha256:${document.sha256}` }],
        options: [
          { id: planDeviationOptions.accept, summary: 'Accept the deviation',
            consequence: 'It stands as recorded and closes as waived. The source plan is unchanged.' },
          { id: planDeviationOptions.reject, summary: 'Reject the deviation',
            consequence: 'Your note records the requirement a follow-up run must meet. Nothing is rerun automatically.' },
        ],
      },
    },
  };
  return { ok: true, commands: [report, request] };
}
