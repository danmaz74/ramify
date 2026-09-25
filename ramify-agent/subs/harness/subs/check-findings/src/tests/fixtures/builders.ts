import type {
  CheckFindingAction, CheckFindingCommand, CheckFindingCommunication, CheckFindingDecisionInput, CheckFindingEvent,
  CheckFindingGround, CheckFindingId, CheckFindingOwner, CheckFindingRelationKind, CheckFindingReportCredibility,
  CheckFindingReportInput, CheckFindingRisk, CheckFindingSource, CheckFindingState, CheckFindingVerification,
  CheckFindingWitness,
} from '../../interfaces/check-findings.js';
import { decideCheckFindingChange } from '../../decide.js';
import { applyCheckFindingEvent, emptyCheckFindingState } from '../../replay.js';

/*
 * Literal builders for the pure tests. Every reference is an opaque string
 * the harness would bind; the hashes are fixed values, not digests of
 * anything.
 */

/** A `sha256:` value that differs for each seed. */
export function hashOf(seed: number): string {
  return `sha256:${seed.toString(16).padStart(64, '0')}`;
}

export const tree = (id: string): CheckFindingSource => ({ kind: 'tree', id });
export const workItem = (id: string): CheckFindingOwner => ({ kind: 'work-item', workItem: id });

export const assessment: CheckFindingVerification = { kind: 'assessment' };

export function scenarioObligation(subject: string, revision = 1, required = true): CheckFindingVerification {
  return { kind: 'check', producer: 'check:scenario', obligation: { subject, revision }, selection: 'quick/identity', required };
}

export const architect = { kind: 'agent', role: 'local-architect', invocation: 'inv-0020' } as const;
export const reviewer = (invocation: string) => ({ kind: 'agent', role: 'reviewer', invocation } as const);

export interface ConcernOptions {
  readonly producer?: `review:${string}`;
  readonly attempt: string;
  readonly key: string;
  readonly summary: string;
  readonly path?: string;
  readonly owner?: CheckFindingOwner;
  readonly source?: CheckFindingSource;
  readonly hash: number;
  readonly suggests?: CheckFindingId;
  readonly invocation?: string;
  readonly risk?: CheckFindingRisk;
  /** What the reviewer named as grounding it; none by default. */
  readonly ground?: CheckFindingGround | null;
  /** The harness's class of the ground; `ungrounded` without one and `agent-generated` with one by default. */
  readonly credibility?: CheckFindingReportCredibility;
  readonly modules?: readonly string[];
  readonly issueKey?: string | null;
}

/** A ground the harness bound: a path and a fixed hash. */
export const ground = (ref: string, seed: number): CheckFindingGround => ({ ref, hash: hashOf(seed) });

/**
 * A reviewer's concern: judgmental, verified by assessment, with no producer
 * issue key, medium risk and no ground unless the options say otherwise.
 */
export function concern(options: ConcernOptions): CheckFindingReportInput {
  return {
    producer: options.producer ?? 'review:code',
    attempt: options.attempt,
    reportKey: options.key,
    contentHash: hashOf(options.hash),
    owner: options.owner ?? workItem('wi-001'),
    source: options.source ?? tree('t-01'),
    issueKey: options.issueKey ?? null,
    verification: assessment,
    observation: {
      kind: 'review-concern',
      summary: options.summary,
      evidence: [{ kind: 'review-submission', ref: `${options.attempt}/submission.json`, hash: hashOf(options.hash + 2000) }],
      locations: [{ path: options.path ?? 'src/cart.ts', startLine: 10, endLine: 20 }],
    },
    judgment: {
      actor: reviewer(options.invocation ?? 'inv-0010'),
      consequence: `${options.summary}: the behavior differs from the assignment`,
      rationale: 'read the frozen candidate diff',
      uncertainty: 'moderate',
      remedy: 'a bounded change in the named file',
      risk: options.risk ?? 'medium',
      ground: options.ground ?? null,
    },
    suggests: options.suggests ?? null,
    credibility: options.credibility ?? ((options.ground ?? null) === null ? 'ungrounded' : 'agent-generated'),
    modules: [...(options.modules ?? ['project/cart'])],
  };
}

export interface FailureOptions {
  readonly attempt: string;
  readonly key?: string;
  readonly subject?: string;
  readonly revision?: number;
  readonly required?: boolean;
  readonly source: CheckFindingSource;
  readonly hash: number;
  readonly issueKey?: string | null;
  readonly owner?: CheckFindingOwner;
  readonly modules?: readonly string[];
}

/** A failed scenario check promoted with its stable issue key: objective, with no judgment. */
export function failure(options: FailureOptions): CheckFindingReportInput {
  const subject = options.subject ?? 'scenario:sc-004';
  return {
    producer: 'check:scenario',
    attempt: options.attempt,
    reportKey: options.key ?? subject,
    contentHash: hashOf(options.hash),
    owner: options.owner ?? workItem('wi-001'),
    source: options.source,
    issueKey: options.issueKey === undefined ? subject : options.issueKey,
    verification: scenarioObligation(subject, options.revision ?? 1, options.required ?? true),
    observation: {
      kind: 'check-failed',
      summary: `${subject} failed at its step 3`,
      evidence: [{ kind: 'scenario-result', ref: `${options.attempt}/scenarios/quick.ndjson`, hash: hashOf(options.hash + 1000) }],
      locations: [],
    },
    judgment: null,
    suggests: null,
    credibility: 'objective',
    modules: [...(options.modules ?? ['project/checkout'])],
  };
}

export function witness(overrides: Partial<CheckFindingWitness> & { readonly source: CheckFindingSource }): CheckFindingWitness {
  return {
    producer: 'check:scenario',
    attempt: 'ga-0009',
    obligation: { subject: 'scenario:sc-004', revision: 1 },
    selection: 'quick/identity',
    coverage: 'complete',
    outcome: 'passed',
    evidence: [{ kind: 'scenario-result', ref: 'ga-0009/scenarios/quick.ndjson', hash: hashOf(9009) }],
    ...overrides,
  };
}

const quiet: CheckFindingCommunication = { mode: 'quiet' };

export function decision(action: CheckFindingAction, overrides: Partial<CheckFindingDecisionInput> = {}): CheckFindingDecisionInput {
  return {
    actor: architect,
    source: tree('t-03'),
    rationale: `the architect chose ${action.action}`,
    evidence: [],
    communication: quiet,
    decision: action,
    ...overrides,
  };
}

export const report = (input: CheckFindingReportInput): CheckFindingCommand => ({ type: 'report', report: input });

export function dispose(checkFinding: CheckFindingId, expectedRevision: number, input: CheckFindingDecisionInput): Extract<CheckFindingCommand, { type: 'dispose' }> {
  return { type: 'dispose', checkFinding, expectedRevision, decision: input };
}

export function relate(
  from: [CheckFindingId, number],
  to: [CheckFindingId, number],
  relation: CheckFindingRelationKind,
  shared = 'both describe one behavior',
): Extract<CheckFindingCommand, { type: 'relate' }> {
  return {
    type: 'relate',
    relation: {
      actor: architect,
      source: tree('t-03'),
      from: { checkFinding: from[0], revision: from[1] },
      to: { checkFinding: to[0], revision: to[1] },
      relation,
      shared,
      evidence: [],
      rationale: `assessed as ${relation}`,
    },
  };
}

/** Decides a command and applies its events; throws when either refuses, with the reason. */
export function commit(state: CheckFindingState, command: CheckFindingCommand, log?: CheckFindingEvent[]): CheckFindingState {
  const decided = decideCheckFindingChange(state, command);
  if (!decided.ok) throw new Error(`${decided.rejection.code}: ${decided.rejection.message}`);
  let current = state;
  for (const event of decided.events) {
    const applied = applyCheckFindingEvent(current, event);
    if (!applied.ok) throw new Error(`${applied.rejection.code}: ${applied.rejection.message}`);
    current = applied.state;
    log?.push(event);
  }
  return current;
}

/** Commits every command in order from the empty state. */
export function commitAll(commands: readonly CheckFindingCommand[], log?: CheckFindingEvent[]): CheckFindingState {
  return commands.reduce((state, command) => commit(state, command, log), emptyCheckFindingState());
}

/**
 * A plan deviation as the harness records it: the run's, verified by
 * assessment, judged by the global architect and credited as agent-generated,
 * at high risk, located at the plan lines it departs from.
 */
export function deviation(options: { readonly key: string; readonly hash: number; readonly modules?: readonly string[] }): CheckFindingReportInput {
  return {
    producer: 'plan:deviation',
    attempt: 'inv-0030',
    reportKey: options.key,
    contentHash: hashOf(options.hash),
    owner: { kind: 'run' },
    source: { kind: 'document', id: 'plans/p/plan.md' },
    issueKey: null,
    verification: assessment,
    observation: {
      kind: 'plan-deviation',
      summary: `Plan deviation ${options.key}: the report script keeps its summary line`,
      evidence: [{ kind: 'plan-deviation', ref: `deviations/${options.key}.json`, hash: hashOf(options.hash + 3000) }],
      locations: [{ path: 'plans/p/plan.md', startLine: 40, endLine: 42 }],
    },
    judgment: {
      actor: { kind: 'agent', role: 'global-architect', invocation: 'inv-0030' },
      consequence: 'The reference report does not print the block',
      rationale: 'The script lies outside every module',
      uncertainty: 'none recorded',
      remedy: null,
      risk: 'high',
      ground: ground(`deviations/${options.key}.json`, options.hash + 3000),
    },
    suggests: null,
    credibility: 'agent-generated',
    modules: [...(options.modules ?? ['project/cli'])],
  };
}

/** The harness's request for the person's decision on a plan deviation: accept or reject. */
export function deviationRequest(): CheckFindingDecisionInput {
  return decision({
    action: 'request-user-decision',
    authority: { kind: 'governing-record', ref: 'deviations/pd-001.json' },
    conflicts: [{ text: 'The report script prints the same block.', document: 'plans/p/plan.md', revision: hashOf(77) }],
    options: [
      { id: 'accept', summary: 'Accept the deviation', consequence: 'It stands.' },
      { id: 'reject', summary: 'Reject it', consequence: 'A follow-up run meets the requirement.' },
    ],
  }, { actor: { kind: 'harness', reason: 'a plan deviation is the person\'s to accept or reject' }, source: { kind: 'document', id: 'plans/p/plan.md' } });
}
