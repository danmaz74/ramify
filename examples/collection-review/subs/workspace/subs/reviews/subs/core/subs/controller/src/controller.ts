import { runInspectionTask } from '../../tasks/src/inspection-task.js';
import { summarizeTaskResult } from '../../tasks/src/result.js';

/**
 * The supervisor step.
 *
 * One tick runs the one task that was scheduled and reports its verdict. The
 * two operations it uses belong to its sibling `tasks`, and it reaches them
 * the only way it can: `tasks` exposes them up to the review runtime, and the
 * runtime exposes them back down into its own subtree. Siblings have no route
 * to each other of their own.
 *
 * The task's input and summary types are read off the operations themselves
 * rather than imported. Exposing a function does not expose the types its
 * signature mentions, and this owner needs no name for them.
 */

/** Everything one scheduled inspection needs, as the task that runs it defines it. */
type ScheduledTask = Parameters<typeof runInspectionTask>[0];

/** The verdict of one run, as the summary helper defines it. */
type TaskVerdict = ReturnType<typeof summarizeTaskResult>;

/**
 * Runs the scheduled task and summarizes what it produced.
 *
 * A task that inspected nothing produced no verdict: there is a difference
 * between a review that failed and a review that never happened, and only the
 * caller can decide what an unknown record means. A task that did produce a
 * report is always summarized, whether or not the report drew findings.
 */
export function tick(scheduled: ScheduledTask): TaskVerdict | undefined {
  const result = runInspectionTask(scheduled);

  if (result.report === null) {
    return undefined;
  }

  return summarizeTaskResult(result);
}
