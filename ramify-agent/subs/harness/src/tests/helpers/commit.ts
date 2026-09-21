import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { openLedger, type Ledger } from '../../../subs/ledger/src/ledger.js';
import type { RecordRef } from '../../jobs/commit.js';

/*
 * A log of the shape `commit.ts` serves: events that name their type, and
 * records of several kinds beneath one records root. The mapping job commits
 * no record, so these tests stand in for the run's records, whose kinds the
 * later iterations add.
 */

export const commitEventSchema = z.object({
  type: z.enum(['run-started', 'plan-accepted', 'iteration-accepted', 'brief-appended', 'brief-delivered']),
  note: z.string(),
});
export type CommitEvent = z.infer<typeof commitEventSchema>;

/** A log of committed transitions on `directory`, with the directory as its records root. */
export async function openCommitLog(directory: string): Promise<Ledger<CommitEvent>> {
  return await openLedger({ logPath: join(directory, 'events.jsonl'), recordsRoot: directory, eventSchema: commitEventSchema });
}

export const logPathOf = (directory: string): string => join(directory, 'events.jsonl');

/** One record body of the shape a reader accepts: its schema literal, its ID and its revision. */
export function recordRef(path: string, id: string, revision: number, extra: Record<string, unknown> = {}): RecordRef {
  return { path, id, revision, body: { schema: 'ramify-agent.test-record/1', id, revision, ...extra } };
}

/** The complete lines of a log, parsed. */
export async function logLines(directory: string): Promise<Array<{ sequence: number; event: CommitEvent; records: RecordRef[] }>> {
  const text = await readFile(logPathOf(directory), 'utf8');
  return text.split('\n').filter(Boolean).map(line => JSON.parse(line) as { sequence: number; event: CommitEvent; records: RecordRef[] });
}

/** The bytes a materialized record file holds for `body`. */
export const recordBytes = (body: unknown): string => `${JSON.stringify(body, null, 2)}\n`;
