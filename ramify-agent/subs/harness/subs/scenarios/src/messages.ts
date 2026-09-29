import { z } from 'zod';

/* Historical record schemas. ramify-audit owns Cucumber message decoding. */

export const scenarioRunStatusSchema = z.enum(['passed', 'failed', 'undefined', 'pending', 'ambiguous', 'skipped']);
export type ScenarioRunStatus = z.infer<typeof scenarioRunStatusSchema>;

/** One tracked scenario's result in one run. */
export const scenarioRunResultSchema = z.object({
  id: z.string().regex(/^sc-\d{3,}$/),
  status: scenarioRunStatusSchema,
  /** The feature file, as the run named it. */
  file: z.string(),
  /** The line of its `Scenario` keyword. */
  line: z.int().positive(),
  /** Each step with the definition that bound it, `uri:line`; an ambiguous step has one entry per definition. */
  binding: z.array(z.object({ step: z.string(), definition: z.string() }).strict()),
  /** The first step with the scenario's status, for every status but `passed` and `skipped`. */
  failure: z.object({ step: z.string(), message: z.string() }).strict().optional(),
  /** Step texts no definition matched. */
  undefined: z.array(z.string()),
  /**
   * Present only when the stream does not hold the whole scenario: `pickles`
   * of its pickles never started and `steps` of its executed steps have no
   * result, which `status` counts as failed. `observed` is the worst status
   * of the steps that did finish, so a reader can tell a failure the run
   * observed from an execution gap.
   */
  unfinished: z.object({
    pickles: z.int().nonnegative(),
    steps: z.int().nonnegative(),
    observed: scenarioRunStatusSchema,
  }).strict().optional(),
}).strict();
export type ScenarioRunResult = z.infer<typeof scenarioRunResultSchema>;

export const untrackedScenarioCountsSchema = z.object({
  passed: z.int().nonnegative(),
  /**
   * Executed untracked scenarios whose worst step is `skipped`, as every
   * defined scenario of a dry run is. Whether that passes is the caller's:
   * a dry run expects it, an executing run does not.
   */
  skipped: z.int().nonnegative(),
  /** Every other executed untracked scenario: failed, undefined, pending or ambiguous. */
  failed: z.int().nonnegative(),
}).strict();

/** What one run's stream says. */
export const scenarioRunSummarySchema = z.object({
  /** Tracked scenarios the run executed, by ID. */
  scenarios: z.array(scenarioRunResultSchema),
  /** Tracked scenarios the stream holds but the run did not execute, by ID: the tag expression kept them out. */
  excluded: z.array(z.string()),
  untracked: untrackedScenarioCountsSchema,
  /** Whether the stream ends with the run's end, and the success it reported; `null` for a stream cut short. */
  finished: z.object({ success: z.boolean() }).strict().nullable(),
  /** 1-based numbers of lines that are not JSON. A torn last line is one. */
  malformedLines: z.array(z.int().positive()),
}).strict();
export type ScenarioRunSummary = z.infer<typeof scenarioRunSummarySchema>;

/** A tracked scenario as the reducer recognizes it: its ID and the file its record names. */
export interface TrackedScenario {
  readonly id: string;
  readonly file: string;
}
