import { tick } from '../subs/controller/src/controller.js';
import { validateRevisionChain } from '../../validation/src/validate.js';
import type { InspectionPort } from './interfaces/port.js';
import type {
  Finding,
  Observation,
  RecordId,
  ReviewStatus,
  RevisionScope,
} from '../../../../contracts/src/interfaces/vocabulary.js';

/**
 * The review runtime: this owner's assembly of its own children.
 *
 * A runtime is built around one inspection port and answers one question —
 * what does reviewing this record produce? It schedules a single task with the
 * rules the validator supplies and hands that task to the controller's tick.
 * Both halves arrive through exposures: `tick` from the controller child,
 * `validateRevisionChain` from a module outside this subtree entirely, relayed
 * down by the review feature above.
 */

/**
 * What one review produced. It is this owner's own type, exposed upward to the
 * adapters that publish it and never downward: the views the feature renders
 * receive values and callbacks instead of the runtime's vocabulary.
 */
export interface ReviewOutcome {
  recordId: RecordId;
  status: ReviewStatus;
  findings: Finding[];
  observations: Observation[];
}

/** A runtime bound to one inspection port. */
export interface ReviewRuntime {
  /**
   * Reviews the scoped part of one record, or answers `undefined` when the
   * port knows no record with that id. Turning that absence into a protocol
   * error is an adapter's decision, as it is everywhere else in this tree.
   */
  run(recordId: RecordId, scope: RevisionScope): ReviewOutcome | undefined;
}

/**
 * Builds a runtime over one port. The port is an argument rather than an
 * import, so nothing here — and nothing in the task or the controller below —
 * ever names the catalog that satisfies it.
 */
export function createReviewRuntime(port: InspectionPort): ReviewRuntime {
  return {
    run(recordId, scope) {
      return tick({ recordId, scope, port, validate: validateRevisionChain });
    },
  };
}
