import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Catalog, DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import type { RunEventOf } from '../run/log.js';
import { runLayout } from '../run/records.js';
import { contextSelectionSchema, type ContextSelection } from './contracts.js';
import { validateContextSelection } from './selection.js';

export type RecordedContextSelection = { readonly status: 'available'; readonly selection: ContextSelection; readonly packageText: string } |
  { readonly status: 'unavailable'; readonly reason: string };

/** Read only the files bound by the committed event, then reproduce its package. */
export async function readRecordedContextSelection(
  directory: string,
  event: RunEventOf<'context-selection-recorded'>,
  catalog: Catalog,
  manifest: DocumentManifest,
  bytes: ReadonlyMap<string, Uint8Array>,
): Promise<RecordedContextSelection> {
  const data = event.data;
  if (!data.selectionHash || !data.package) return { status: 'unavailable', reason: 'Selection has no immutable file references' };
  if (data.selection !== runLayout.selectionVersion(data.workItem, data.selectionHash)
    || data.package !== runLayout.contextPackage(data.workItem, data.packageHash)) {
    return { status: 'unavailable', reason: 'Selection event names an invalid immutable path' };
  }
  try {
    const [selectionBytes, packageBytes] = await Promise.all([
      readFile(join(directory, data.selection)), readFile(join(directory, data.package)),
    ]);
    const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex');
    if (hash(selectionBytes) !== data.selectionHash || hash(packageBytes) !== data.packageHash) {
      throw new Error('Selection or context package differs from committed hash');
    }
    const selection = contextSelectionSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(selectionBytes)));
    if (selection.workItem !== data.workItem || selection.packageHash !== data.packageHash) throw new Error('Selection record differs from committed event');
    const rebuilt = validateContextSelection(selection, catalog, manifest, bytes);
    if (rebuilt.status === 'unavailable') throw new Error(rebuilt.errors.join('; '));
    const packageText = new TextDecoder('utf-8', { fatal: true }).decode(packageBytes);
    if (packageText !== rebuilt.text) throw new Error('Context package differs from the exact captured source reconstruction');
    return { status: 'available', selection, packageText };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}
