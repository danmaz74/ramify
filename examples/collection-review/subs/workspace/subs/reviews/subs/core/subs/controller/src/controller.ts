import { runInspectionTask } from '../../tasks/src/inspection-task.js';
import { summarizeTaskResult } from '../../tasks/src/result.js';
import type { InspectionTaskInput } from '../../tasks/src/inspection-task.js';
import type { TaskSummary } from '../../tasks/src/result.js';

/**
 * The supervisor step.
 *
 * One tick runs the one task that was scheduled and reports its verdict. The
 * two operations it uses belong to its sibling `tasks`, and it reaches them
 * the only way it can: `tasks` exposes them up to the review runtime, and the
 * runtime exposes them back down into its own subtree. Siblings have no route
 * to each other of their own.
 *
 * The task's input and summary types travel the same route as the operations.
 * Exposing a function does not expose the types its signature names, so
 * `tasks` exposes them beside the operations, and `tick`'s own signature can
 * name them because they reach every module that `tick` reaches.
 */

/**
 * Runs the scheduled task and summarizes what it produced.
 *
 * A task that inspected nothing produced no verdict: there is a difference
 * between a review that failed and a review that never happened, and only the
 * caller can decide what an unknown record means. A task that did produce a
 * report is always summarized, whether or not the report drew findings.
 */
export function tick(scheduled: InspectionTaskInput): TaskSummary | undefined {
  const result = runInspectionTask(scheduled);

  if (result.report === null) {
    return undefined;
  }

  return summarizeTaskResult(result);
}
