import { join } from 'node:path';
import { z } from 'zod';
import { scenarioIdSchema } from '../../subs/scenarios/src/records.js';

/*
 * Plan deviations. A local architect that finds its request cannot be met
 * as stated answers `unresolved`; the harness records that as an unresolved
 * request and forks the global architect with it. The fork fixes the
 * placement, records a plan deviation, or finds that nothing of the plan
 * remains worth doing.
 *
 * A plan deviation is the global architect's decision that the run does
 * something other than a requirement of its plan states: the requirement as
 * written, at its plan lines, what is done instead, why, the alternatives it
 * rejected and what the person loses. The plan file is never changed; the
 * deviation is a durable record beside it, which binds the rest of the run.
 * Its CheckFinding asks the person to accept or reject it and holds nothing.
 *
 * An environment problem is the global architect's answer that the conflict
 * lies in how the gate or the harness runs, not in the plan or the
 * architecture. Nothing is placed and nothing of the plan changes: the run
 * holds the work item for the operator, who resumes it or ends the run.
 */

const text = z.string().min(1);
const lineRange = z.tuple([z.int().positive(), z.int().positive()]);

/** `ur-003`, the count of committed unresolved requests. */
export const unresolvedRequestId = (count: number): string => `ur-${String(count).padStart(3, '0')}`;

/** `pd-003`, the count of committed plan deviations. */
export const planDeviationId = (count: number): string => `pd-${String(count).padStart(3, '0')}`;

/** `ep-003`, the count of committed environment problems. */
export const environmentProblemId = (count: number): string => `ep-${String(count).padStart(3, '0')}`;

/** The most characters of an environment problem's diagnosis and suggestion. */
export const environmentLimits = { diagnosis: 2000, suggestion: 1000 } as const;

/** The plan deviations a run records before the next one waits for the person, unless its policy says otherwise. */
export const defaultMaxPlanDeviations = 5;

/**
 * What the global architect submits as a plan deviation. The requirements
 * are line ranges of the captured plan; the harness quotes their text. A
 * deviation keeps as much of each requirement as the conflict allows.
 */
export const deviationBodySchema = z.object({
  /** The requirements as written that this deviation departs from, as line ranges of the captured plan. */
  requirements: z.array(z.object({ lines: lineRange }).strict()).min(1).max(20),
  /** What the run does instead: the part of each requirement it keeps, and the replacement for the part it cannot. */
  instead: text,
  /** Why the requirement cannot be met as written. */
  why: text,
  /** Each alternative considered and why it was rejected. */
  rejected: z.array(z.object({ alternative: text, reason: text }).strict()).min(1),
  /** What the person loses, compared with the plan as written. */
  loss: text,
  /** The work items whose work the deviation changes, besides the one that asked. */
  workItems: z.array(text),
  /**
   * The pending scenarios this deviation rewords: each one's new `Scenario`
   * block, without tags, as the feature file will carry it. The harness
   * renders the tracked feature file from it.
   */
  scenarios: z.array(z.object({ scenario: scenarioIdSchema, source: z.array(z.string()).min(1) }).strict()).default([]),
}).strict();
export type DeviationBody = z.infer<typeof deviationBodySchema>;

/** A local architect's `unresolved` answer, as the harness records it before forking the global architect. */
export const unresolvedRequestSchema = z.object({
  schema: z.literal('ramify-agent.unresolved-request/1'),
  id: text,
  workItem: text,
  requester: text,
  /** The local architect's invocation that answered `unresolved`. */
  invocation: text,
  conflict: text,
  evidence: z.array(text),
}).strict();
export type UnresolvedRequest = z.infer<typeof unresolvedRequestSchema>;

/** One requirement a deviation departs from: its plan lines and their text as written. */
export const deviatedRequirementSchema = z.object({ lines: lineRange, text: z.string() }).strict();
export type DeviatedRequirement = z.infer<typeof deviatedRequirementSchema>;

/** A pending scenario a deviation rewords: its source before and after, and its feature file. */
export const rewordedScenarioSchema = z.object({
  scenario: scenarioIdSchema,
  file: text,
  before: z.array(z.string()),
  after: z.array(z.string()).min(1),
}).strict();
export type RewordedScenario = z.infer<typeof rewordedScenarioSchema>;

export const planDeviationSchema = z.object({
  schema: z.literal('ramify-agent.plan-deviation/1'),
  id: text,
  /** The unresolved request it answers. */
  request: text,
  /** The work item whose local architect answered `unresolved`. */
  workItem: text,
  /** The global architect's fork that decided it. */
  invocation: text,
  /** The plan it departs from, which stays exactly as written. */
  plan: z.object({ path: text, revision: text }).strict(),
  requirements: z.array(deviatedRequirementSchema).min(1),
  instead: text,
  why: text,
  rejected: z.array(z.object({ alternative: text, reason: text }).strict()).min(1),
  loss: text,
  /** Every work item it changes, the asking one first. */
  workItems: z.array(text).min(1),
  /** Their modules, which the CheckFinding concerns. */
  modules: z.array(text),
  scenarios: z.array(rewordedScenarioSchema),
  /** The CheckFinding that asks the person to accept or reject it. */
  checkFinding: text,
  /**
   * Whether the run waits for the person's decision before going on: the
   * run recorded more deviations than its policy lets it continue past.
   */
  held: z.boolean(),
}).strict();
export type PlanDeviation = z.infer<typeof planDeviationSchema>;

/**
 * What the global architect submits as an environment problem: what is
 * wrong with how the gate or the harness runs, with its evidence, and what
 * the operator could do about it. Both are bounded.
 */
export const environmentBodySchema = z.object({
  /** What is wrong, with evidence: the failing command and the missing prerequisite. */
  diagnosis: text.max(environmentLimits.diagnosis),
  /** What the operator could change, such as a build step declared in `ramify-agent.json`. */
  suggestion: text.max(environmentLimits.suggestion),
}).strict();
export type EnvironmentBody = z.infer<typeof environmentBodySchema>;

/**
 * An environment problem as the run records it. The run holds its work item
 * until the operator answers its CheckFinding: resuming returns the work
 * item to its local architect with the diagnosis; ending fails the run.
 */
export const environmentProblemSchema = z.object({
  schema: z.literal('ramify-agent.environment-problem/1'),
  id: text,
  /** The unresolved request it answers. */
  request: text,
  /** The work item whose local architect answered `unresolved`, which the run holds. */
  workItem: text,
  /** The global architect's fork that reported it. */
  invocation: text,
  diagnosis: text,
  suggestion: text,
  /** The CheckFinding that asks the operator to resume the run or end it. */
  checkFinding: text,
}).strict();
export type EnvironmentProblem = z.infer<typeof environmentProblemSchema>;

/** Where the records are materialized, relative to the run's directory. */
export const deviationLayout = {
  request: (id: string): string => join('requests', `${id}.json`),
  deviation: (id: string): string => join('deviations', `${id}.json`),
  environment: (id: string): string => join('environment', `${id}.json`),
} as const;

export const deviationSchemas = {
  unresolvedRequest: { schema: 'ramify-agent.unresolved-request/1', body: unresolvedRequestSchema },
  planDeviation: { schema: 'ramify-agent.plan-deviation/1', body: planDeviationSchema },
  environmentProblem: { schema: 'ramify-agent.environment-problem/1', body: environmentProblemSchema },
} as const;

/** The text of a plan's lines `[from, to]`, as written. */
export function planLines(plan: string, [from, to]: readonly [number, number]): string {
  return plan.split('\n').slice(from - 1, to).join('\n');
}

/**
 * A deviation as an agent bound by it reads it: the requirement as written,
 * what the run does instead, and the rewording of any scenario. It is the
 * text local architects and scope reviewers receive beside the plan.
 */
export function deviationText(deviation: PlanDeviation): string {
  const lines = [
    `Plan deviation ${deviation.id}, recorded by the global architect for ${deviation.workItem}. It amends the plan for the rest of this run; the plan file is unchanged.`,
    '',
    'The requirement as written:',
    '',
  ];
  for (const requirement of deviation.requirements) {
    lines.push(`${deviation.plan.path}, lines ${requirement.lines[0]}–${requirement.lines[1]}:`, '');
    lines.push(...requirement.text.split('\n').map(line => `> ${line}`), '');
  }
  lines.push(`What the run does instead: ${deviation.instead}`, '', `Why: ${deviation.why}`, '', `What is lost: ${deviation.loss}`);
  for (const scenario of deviation.scenarios) {
    lines.push('', `Scenario ${scenario.scenario} is reworded in \`${scenario.file}\`. It now reads:`, '', '```gherkin', ...scenario.after, '```');
  }
  return lines.join('\n');
}
