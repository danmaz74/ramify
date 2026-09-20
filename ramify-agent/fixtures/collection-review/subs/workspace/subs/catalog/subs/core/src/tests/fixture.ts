import { listRecords } from '../records.js';
import type { RecordId, RevisionChain } from '../../../../../contracts/src/interfaces/vocabulary.js';

/**
 * Test data other owners' tests can use.
 *
 * The records themselves stay private to this owner. This helper is a new
 * testing-owned binding that reads them and hands out a copy, so a foreign
 * test gets the same data the implementation uses without gaining access to
 * the implementation.
 */

/** One record's data, detached from the catalog's own record type. */
export interface CatalogFixtureRecord {
  recordId: RecordId;
  title: string;
  chain: RevisionChain;
}

/** Both fixed records, copied so a test can change its own data freely. */
export function makeCatalogFixture(): CatalogFixtureRecord[] {
  return listRecords().map((record) => ({
    recordId: record.id,
    title: record.title,
    chain: record.revisions.map((revision) => ({ ...revision })),
  }));
}
