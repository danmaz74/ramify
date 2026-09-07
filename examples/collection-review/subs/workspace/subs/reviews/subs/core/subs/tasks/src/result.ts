import type { InspectionTaskResult } from './inspection-task.js';
import type {
  Finding,
  Observation,
  RecordId,
  ReviewStatus,
} from '../../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * Turning what a task did into what a reviewer wants to know.
 *
 * The summary drops the report and keeps the verdict, the findings and the
 * observations. Whoever needs the report itself reads the task result.
 */

/** The verdict on one task run. */
export interface TaskSummary {
  readonly recordId: RecordId;
  readonly status: ReviewStatus;
  readonly findings: Finding[];
  readonly observations: Observation[];
}

/**
 * A run passes when it produced a report and that report drew no findings.
 * A run with no report failed as a review: nothing was examined, so nothing
 * can be said to be sound.
 */
export function summarizeTaskResult(result: InspectionTaskResult): TaskSummary {
  return {
    recordId: result.recordId,
    status: result.findings.length > 0 || result.report === null ? 'failed' : 'passed',
    findings: result.findings,
    observations: result.observations,
  };
}
