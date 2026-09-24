import { z } from 'zod';
import { commandIdSchema } from '../interfaces/protocol/jobs.js';
import {
  checkFindingDecisionSchema, checkFindingEventSchema, checkFindingIdSchema, checkFindingRelationSchema, checkFindingReportSchema,
  type CheckFindingEvent,
} from '../../subs/check-findings/src/interfaces/check-findings.js';
import type { RecordRef as CommitRecord } from '../jobs/commit.js';

/*
 * How CheckFindings live in the run log. The child's events travel, in the
 * order it returned them, in a `checkFindings` array on the run event that
 * commits them, so one application transition is one ledger line. Each
 * carried body is also committed as a materialized record for readers;
 * replay reads only the log, never these files.
 */

const text = z.string().min(1);

/** The most CheckFinding events one run event carries. */
export const maximumCarriedEvents = 100;

/** The carrier field: the child's events, in order. */
export const checkFindingEventsField = z.array(checkFindingEventSchema).max(maximumCarriedEvents);

/**
 * Why a `check-findings-recorded` line was written: every path that has no
 * run event of its own, such as recovery, a user's answer or a factual
 * promotion outside a gate.
 */
export const checkFindingCauseSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('recovery'), detail: text }).strict(),
  z.object({ kind: z.literal('user-response'), command: commandIdSchema }).strict(),
  z.object({ kind: z.literal('producer'), producer: text, attempt: text }).strict(),
]);
export type CheckFindingCause = z.infer<typeof checkFindingCauseSchema>;

/** Where each CheckFinding record is materialized, under the run directory. */
export const checkFindingLayout = {
  report: (checkFinding: string, report: string) => `check-findings/${checkFinding}/reports/${report}.json`,
  decision: (checkFinding: string, decision: string) => `check-findings/${checkFinding}/decisions/${decision}.json`,
  relation: (relation: string) => `check-findings/relations/${relation}.json`,
} as const;

export const checkFindingRecordVersions = {
  report: 'ramify-agent.check-finding-report/1',
  decision: 'ramify-agent.check-finding-decision/1',
  relation: 'ramify-agent.check-finding-relation/1',
} as const;

/** A report as its record file holds it: the report with its CheckFinding and the revision it moved it to. */
export const checkFindingReportRecordSchema = checkFindingReportSchema.extend({
  schema: z.literal(checkFindingRecordVersions.report),
  checkFinding: checkFindingIdSchema,
  revision: z.int().positive(),
}).strict();
export type CheckFindingReportRecord = z.infer<typeof checkFindingReportRecordSchema>;

/** A decision as its record file holds it: the decision with its CheckFinding and the revision it moved it to. */
export const checkFindingDecisionRecordSchema = checkFindingDecisionSchema.extend({
  schema: z.literal(checkFindingRecordVersions.decision),
  checkFinding: checkFindingIdSchema,
  revision: z.int().positive(),
}).strict();
export type CheckFindingDecisionRecord = z.infer<typeof checkFindingDecisionRecordSchema>;

export const checkFindingRelationRecordSchema = checkFindingRelationSchema.extend({
  schema: z.literal(checkFindingRecordVersions.relation),
}).strict();
export type CheckFindingRelationRecord = z.infer<typeof checkFindingRelationRecordSchema>;

/** The readers of each record, for `readCommitted`. */
export const checkFindingSchemas = {
  report: { schema: checkFindingRecordVersions.report, body: checkFindingReportRecordSchema },
  decision: { schema: checkFindingRecordVersions.decision, body: checkFindingDecisionRecordSchema },
  relation: { schema: checkFindingRecordVersions.relation, body: checkFindingRelationRecordSchema },
} as const;

/** The record copies of carried events, one per event, committed in the same transaction. */
export function checkFindingRecords(events: readonly CheckFindingEvent[]): CommitRecord[] {
  return events.map(event => {
    switch (event.type) {
      case 'check-finding-opened':
      case 'check-finding-reported': {
        const { checkFinding, revision, report } = event.data;
        const body: CheckFindingReportRecord = { schema: checkFindingRecordVersions.report, ...report, checkFinding, revision };
        return { path: checkFindingLayout.report(checkFinding, report.id), id: report.id, revision: 1, body };
      }
      case 'check-finding-decided': {
        const { checkFinding, revision, decision } = event.data;
        const body: CheckFindingDecisionRecord = { schema: checkFindingRecordVersions.decision, ...decision, checkFinding, revision };
        return { path: checkFindingLayout.decision(checkFinding, decision.id), id: decision.id, revision: 1, body };
      }
      case 'check-finding-related': {
        const { relation } = event.data;
        const body: CheckFindingRelationRecord = { schema: checkFindingRecordVersions.relation, ...relation };
        return { path: checkFindingLayout.relation(relation.id), id: relation.id, revision: 1, body };
      }
    }
  });
}
