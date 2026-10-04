import type {
  Finding,
  InspectionReport,
  Observation,
  ObservationCallback,
  RecordId,
  RevisionScope,
} from '../../../../../../contracts/src/interfaces/vocabulary.js';
import type { InspectionPort } from '../../../src/interfaces/port.js';

/**
 * One review's work.
 *
 * The task inspects a record through the port it was given, hands the report
 * to the validator it was given, and returns what happened. It holds no
 * transport, no schedule and no session state, and it never imports the
 * controller that schedules it: the controller exposes upward only.
 */

/** Everything one scheduled inspection needs, supplied by whoever schedules it. */
export interface InspectionTaskInput {
  readonly recordId: RecordId;
  readonly scope: RevisionScope;
  readonly port: InspectionPort;
  readonly validate: (report: InspectionReport) => Finding[];
}

/** What one run of the task produced. */
export interface InspectionTaskResult {
  readonly recordId: RecordId;
  /** The report the port produced, or `null` when it knew no such record. */
  readonly report: InspectionReport | null;
  readonly findings: Finding[];
  readonly observations: Observation[];
}

/**
 * A fresh observation sink and the callback that fills it.
 *
 * This helper is exported for the task above and for this owner's own tests.
 * No description exposes it, so no other module can import it however its tags
 * read — not even the runtime that consumes the task.
 */
export function collectObservations(): {
  observations: Observation[];
  observe: ObservationCallback;
} {
  const observations: Observation[] = [];

  return {
    observations,
    observe: (observation) => {
      observations.push(observation);
    },
  };
}

/**
 * Runs one inspection and validates its report.
 *
 * A record the port does not know yields no report, and therefore no findings:
 * there was nothing to judge. Everything the port observed on the way is kept,
 * because it describes the attempt whether or not it produced a report.
 */
export function runInspectionTask(input: InspectionTaskInput): InspectionTaskResult {
  const collector = collectObservations();
  const report = input.port.inspect(input.recordId, input.scope, collector.observe) ?? null;

  return {
    recordId: input.recordId,
    report,
    findings: report === null ? [] : input.validate(report),
    observations: collector.observations,
  };
}
