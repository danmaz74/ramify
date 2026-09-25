import { createHash } from 'node:crypto';
import type {
  CheckFindingCommand, CheckFindingEntry, CheckFindingState,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import { canonicalJson } from '../jobs/commands.js';
import { reportCommand } from '../check-findings/report.js';
import { nextCheckFinding } from './finding.js';
import { deviationLayout, type EnvironmentProblem, type UnresolvedRequest } from './records.js';

/*
 * The CheckFinding of an environment problem: the run's, since it concerns
 * how the gate or the harness runs rather than any work item's code. Its
 * report is the global architect's diagnosis, credited as agent-generated,
 * with the operator's remedy it suggests; it is high risk. The harness asks
 * the operator at once to resume the run or end it, and the work item whose
 * request it answers waits for that answer.
 */

/** The producer of every environment problem's report. */
export const environmentProducer = 'plan:environment';

/** The options of an environment problem's decision request. */
export const environmentOptions = { resume: 'resume', end: 'end' } as const;

/** Whether a CheckFinding records an environment problem. */
export function isEnvironmentProblem(entry: Pick<CheckFindingEntry, 'reports'>): boolean {
  return entry.reports[0]?.observation.kind === 'environment-problem';
}

/** `sha256:` and the hex digest of the record's canonical JSON, which the report's ground and evidence name. */
export function environmentHash(problem: EnvironmentProblem): string {
  return `sha256:${createHash('sha256').update(canonicalJson(problem), 'utf8').digest('hex')}`;
}

/** At most `limit` characters, so recorded prose fits a CheckFinding's bound. */
function bounded(text: string, limit = 4000): string {
  return text.length <= limit ? text : `${text.slice(0, limit - 1)}…`;
}

/**
 * The two commands that record an environment problem's CheckFinding,
 * decided in order against `state`: the report that opens it, and the
 * harness's request for the operator's answer. The problem names the
 * CheckFinding the report opens, which is the next one the state allocates.
 */
export function environmentCommands(
  state: CheckFindingState,
  problem: EnvironmentProblem,
  request: Pick<UnresolvedRequest, 'conflict'>,
  module: string,
): CheckFindingCommand[] {
  const record = deviationLayout.environment(problem.id);
  const hash = environmentHash(problem);
  const source = { kind: 'artifact' as const, id: record };
  const report = reportCommand({
    producer: environmentProducer,
    attempt: problem.invocation,
    reportKey: problem.id,
    owner: { kind: 'run' },
    source,
    issueKey: null,
    verification: { kind: 'assessment' },
    observation: {
      kind: 'environment-problem',
      summary: bounded(`Environment problem ${problem.id} of ${problem.workItem}: ${problem.diagnosis}`, 600),
      evidence: [
        { kind: 'environment-problem', ref: record, hash },
        { kind: 'unresolved-request', ref: deviationLayout.request(problem.request), hash: null },
      ],
      locations: [],
    },
    judgment: {
      actor: { kind: 'agent', role: 'global-architect', invocation: problem.invocation },
      consequence: bounded(`${problem.workItem} waits until the operator answers: the global architect finds its conflict lies in how the gate or the harness runs, not in the plan or the architecture`),
      rationale: bounded(problem.diagnosis),
      uncertainty: 'The global architect\'s diagnosis; the harness verified none of it',
      remedy: bounded(problem.suggestion),
      risk: 'high',
      ground: { ref: record, hash },
    },
    suggests: null,
    credibility: 'agent-generated',
    modules: [module],
  });
  const checkFinding = nextCheckFinding(state);
  const decision: CheckFindingCommand = {
    type: 'dispose',
    checkFinding,
    expectedRevision: 1,
    decision: {
      actor: { kind: 'harness', reason: 'an environment problem is the operator\'s to correct' },
      source,
      rationale: bounded(`The global architect reports an environment problem for ${problem.request}: ${problem.diagnosis}`),
      evidence: [{ kind: 'environment-problem', ref: record, hash }],
      communication: { mode: 'quiet' },
      decision: {
        action: 'request-user-decision',
        authority: { kind: 'governing-record', ref: record },
        conflicts: [{ text: bounded(request.conflict), document: deviationLayout.request(problem.request), revision: '1' }],
        options: [
          {
            id: environmentOptions.resume,
            summary: 'Resume the run',
            consequence: `${problem.workItem} returns to its local architect with this diagnosis and your note, and retries from its last outline. Correct the environment first.`,
          },
          {
            id: environmentOptions.end,
            summary: 'End the run',
            consequence: 'The run fails with this diagnosis and your note. Nothing is placed and no deviation is recorded.',
          },
        ],
      },
    },
  };
  return [report, decision];
}
