import { createHash } from 'node:crypto';
import type {
  CheckFindingCommand, CheckFindingEntry, CheckFindingState,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import { canonicalJson } from '../jobs/commands.js';
import { reportCommand } from '../check-findings/report.js';
import { deviationLayout, type PlanDeviation } from './records.js';

/*
 * The CheckFinding of a plan deviation: the run's own, since a deviation
 * amends the plan rather than any work item's code. Its report is the
 * global architect's judgment, credited as agent-generated and located at
 * the plan lines it departs from; it is high risk. The harness asks the
 * person at once to accept or reject it, and nothing waits on that answer
 * unless the run recorded more deviations than its policy continues past.
 */

/** The producer of every plan deviation's report. */
export const planDeviationProducer = 'plan:deviation';

/** The options of a plan deviation's decision request. */
export const planDeviationOptions = { accept: 'accept', reject: 'reject' } as const;

/** Whether a CheckFinding records a departure from the plan. */
export function isPlanDeviation(entry: Pick<CheckFindingEntry, 'reports'>): boolean {
  return entry.reports[0]?.observation.kind === 'plan-deviation';
}

/** `sha256:` and the hex digest of the record's canonical JSON, which the report's ground and evidence name. */
export function deviationHash(deviation: PlanDeviation): string {
  return `sha256:${createHash('sha256').update(canonicalJson(deviation), 'utf8').digest('hex')}`;
}

/** At most `limit` characters, so recorded prose fits a CheckFinding's bound. */
function bounded(text: string, limit = 4000): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * The two commands that record a deviation's CheckFinding, decided in
 * order against `state`: the report that opens it, and the harness's
 * request for the person's decision. The deviation names the CheckFinding
 * the report opens, which is the next one the state allocates.
 */
export function deviationCommands(state: CheckFindingState, deviation: PlanDeviation): CheckFindingCommand[] {
  const record = deviationLayout.deviation(deviation.id);
  const hash = deviationHash(deviation);
  const source = { kind: 'document' as const, id: `${deviation.plan.path}@${deviation.plan.revision}` };
  const report = reportCommand({
    producer: planDeviationProducer,
    attempt: deviation.invocation,
    reportKey: deviation.id,
    owner: { kind: 'run' },
    source,
    issueKey: null,
    verification: { kind: 'assessment' },
    observation: {
      kind: 'plan-deviation',
      summary: bounded(`Plan deviation ${deviation.id}: ${deviation.instead}`, 600),
      evidence: [
        { kind: 'plan-deviation', ref: record, hash },
        { kind: 'unresolved-request', ref: deviationLayout.request(deviation.request), hash: null },
      ],
      locations: deviation.requirements.map(requirement => ({
        path: deviation.plan.path, startLine: requirement.lines[0], endLine: requirement.lines[1],
      })),
    },
    judgment: {
      actor: { kind: 'agent', role: 'global-architect', invocation: deviation.invocation },
      consequence: bounded(deviation.loss),
      rationale: bounded(deviation.why),
      uncertainty: bounded(`Alternatives rejected: ${deviation.rejected.map(entry => `${entry.alternative} (${entry.reason})`).join('; ')}`),
      remedy: null,
      risk: 'high',
      ground: { ref: record, hash },
    },
    suggests: null,
    credibility: 'agent-generated',
    modules: [...deviation.modules],
  });
  const checkFinding = nextCheckFinding(state);
  const request: CheckFindingCommand = {
    type: 'dispose',
    checkFinding,
    expectedRevision: 1,
    decision: {
      actor: { kind: 'harness', reason: 'a plan deviation is the person\'s to accept or reject' },
      source,
      rationale: bounded(`The global architect departs from the plan: ${deviation.why}`),
      evidence: [{ kind: 'plan-deviation', ref: record, hash }],
      communication: { mode: 'quiet' },
      decision: {
        action: 'request-user-decision',
        authority: { kind: 'governing-record', ref: record },
        conflicts: deviation.requirements.map(requirement => ({
          text: bounded(requirement.text.trim() === '' ? `(lines ${requirement.lines[0]}–${requirement.lines[1]} are empty)` : requirement.text),
          document: deviation.plan.path,
          revision: deviation.plan.revision,
        })),
        options: [
          {
            id: planDeviationOptions.accept,
            summary: 'Accept the deviation',
            consequence: 'It stands as recorded and closes as waived. The plan file is not changed.',
          },
          {
            id: planDeviationOptions.reject,
            summary: 'Reject the deviation',
            consequence: 'Your note records the requirement a follow-up run must meet. Nothing is rerun automatically.',
          },
        ],
      },
    },
  };
  return [report, request];
}

/** The CheckFinding the next report opens in `state`. */
export function nextCheckFinding(state: CheckFindingState): string {
  return `cf-${String(state.counters.findings + 1).padStart(4, '0')}`;
}
