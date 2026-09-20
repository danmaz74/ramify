import { revisionChainSchema } from '../../../../contracts/src/interfaces/vocabulary.js';
import type { RecordId, RevisionChain } from '../../../../contracts/src/interfaces/vocabulary.js';

/**
 * The two fixed records the whole reference application is built around.
 *
 * Nothing here is exposed: the records are this owner's private data, and
 * every other module reaches them through `getRecord` and `inspect`.
 */

/** One catalog record and the revision chain recorded for it. */
export interface CatalogRecord {
  readonly id: RecordId;
  readonly title: string;
  readonly revisions: RevisionChain;
}

/**
 * The chains are parsed against the shared vocabulary as this file loads, so
 * the reference data cannot drift from the contract it is published under.
 */
const records: readonly CatalogRecord[] = [
  {
    id: 'rec-valid',
    title: 'Intact revision history',
    revisions: revisionChainSchema.parse([
      { id: 'rev-1', predecessor: null },
      { id: 'rev-2', predecessor: 'rev-1' },
    ]),
  },
  {
    id: 'rec-broken',
    title: 'Chain with a missing predecessor',
    revisions: revisionChainSchema.parse([
      { id: 'rev-1', predecessor: null },
      // `rev-0` is recorded as this revision's predecessor but is not a
      // revision of the chain. Reporting that fact is an inspection's job;
      // calling it a defect is a reviewer's.
      { id: 'rev-2', predecessor: 'rev-0' },
    ]),
  },
];

/** Every record, in a fixed order. */
export function listRecords(): readonly CatalogRecord[] {
  return records;
}

/** The record with this id, or `undefined` when there is none. */
export function findRecord(recordId: RecordId): CatalogRecord | undefined {
  return records.find((record) => record.id === recordId);
}
