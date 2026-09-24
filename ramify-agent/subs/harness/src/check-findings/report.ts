import { createHash } from 'node:crypto';
import { canonicalJson } from '../jobs/commands.js';
import type { CheckFindingCommand, CheckFindingReportInput } from '../../subs/check-findings/src/interfaces/check-findings.js';

/*
 * A producer's report as the child receives it. The producer integration
 * binds every trusted field (appendix §10); the content hash is computed
 * here and never taken from a submission, so an exact redelivery is a replay
 * and any changed content under the same ingestion key is a conflict.
 */

/** A report before its content hash: what a producer integration binds. */
export type BoundReport = Omit<CheckFindingReportInput, 'contentHash'>;

/**
 * `sha256:` and the lowercase hex SHA-256 of the canonical JSON of the report
 * without its producer, attempt, report key and content hash.
 */
export function checkFindingContentHash(report: BoundReport | CheckFindingReportInput): string {
  const { producer: _producer, attempt: _attempt, reportKey: _reportKey, ...content } = report;
  const { contentHash: _contentHash, ...hashed } = content as typeof content & { contentHash?: string };
  return `sha256:${createHash('sha256').update(canonicalJson(hashed), 'utf8').digest('hex')}`;
}

/** The `report` command for a bound report, with its content hash computed. */
export function reportCommand(report: BoundReport): Extract<CheckFindingCommand, { type: 'report' }> {
  return { type: 'report', report: { ...report, contentHash: checkFindingContentHash(report) } };
}
