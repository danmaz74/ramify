import type {
  InspectionReport,
  ObservationCallback,
  RecordId,
  RevisionScope,
} from '../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * The one thing the review runtime needs from the world outside it.
 *
 * The port is this owner's own contract, written in neutral vocabulary only:
 * a record id, a revision scope, and a callback for the observations the
 * inspection makes as it proceeds. Nothing here names the catalog, a protocol,
 * or the application that assembles them, so whoever assembles the application
 * decides which implementation satisfies it.
 *
 * It lives in its own interface file rather than in `runtime.ts` because the
 * task child depends on the port and the runtime depends on the task; putting
 * the port beside the runtime would make that a cycle between files.
 */
export interface InspectionPort {
  /**
   * Reports the facts about the scoped part of one record's revision chain, or
   * `undefined` when no record has that id. Deciding what an absent record
   * means belongs to the caller, not to the port.
   */
  inspect(
    recordId: RecordId,
    scope: RevisionScope,
    observe: ObservationCallback,
  ): InspectionReport | undefined;
}
