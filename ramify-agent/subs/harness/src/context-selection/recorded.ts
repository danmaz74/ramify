import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ElementCatalog, PackageDeviation } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import type { RunEventOf } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { contextSelectionSchema, type ContextSelection } from './contracts.js';
import { deliverPackage } from './delivery.js';

export type RecordedContextSelection = { readonly status: 'available'; readonly selection: ContextSelection; readonly packageText: string } |
  { readonly status: 'unavailable'; readonly reason: string };

/** Read the selection the committed event binds, and render its package again from the frozen catalog. */
export async function readRecordedContextSelection(
  directory: string,
  event: RunEventOf<'context-selection-recorded'>,
  catalog: ElementCatalog,
  planDeviations: readonly PackageDeviation[],
): Promise<RecordedContextSelection> {
  const data = event.data;
  if (data.selection !== runLayout.selectionVersion(data.workItem, data.selectionHash)) {
    return { status: 'unavailable', reason: 'Selection event names an invalid immutable path' };
  }
  try {
    const bytes = await readFile(join(directory, data.selection));
    if (createHash('sha256').update(bytes).digest('hex') !== data.selectionHash) throw new Error('Selection differs from committed hash');
    const selection = contextSelectionSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)));
    if (selection.workItem !== data.workItem || selection.package.hash !== data.packageHash) throw new Error('Selection record differs from committed event');
    const delivered = deliverPackage(catalog, planDeviations, selection.package);
    if (delivered.status === 'unavailable') throw new Error(delivered.reason);
    return { status: 'available', selection, packageText: delivered.text };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}
