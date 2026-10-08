import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { elementCatalogSchema, type ElementCatalog } from '../../subs/plan-evidence/src/interfaces/catalog.js';
import { incorporationSchema, type Incorporation } from './evidence-contracts.js';
import { readCapturedDocuments } from '../run/document-inputs.js';
import { runLayout, type RunRecord } from '../run/records.js';
import type { RunEvent } from '../run/log.js';

export type AcceptedEvidence = { readonly status: 'available'; readonly catalog: ElementCatalog; readonly catalogHash: string;
  readonly incorporation: Incorporation; readonly manifest: DocumentManifest;
  readonly bytes: ReadonlyMap<string, Uint8Array> } |
  { readonly status: 'unavailable'; readonly reason: string };

/** The accepted event is the authority for two immutable, content-addressed files: the frozen catalog and the incorporation. */
export async function readAcceptedEvidence(directory: string, record: RunRecord, events: readonly RunEvent[]): Promise<AcceptedEvidence> {
  const accepted = events.find(event => event.type === 'analysis-accepted');
  if (!accepted || accepted.type !== 'analysis-accepted') {
    return { status: 'unavailable', reason: 'This run has no accepted analysis' };
  }
  try {
    const { catalog: catalogRef, incorporation: incorporationRef } = accepted.data.evidence;
    if (catalogRef.path !== runLayout.catalogVersion(catalogRef.hash) || incorporationRef.path !== runLayout.incorporationVersion(incorporationRef.hash)) {
      throw new Error('Accepted evidence names an invalid immutable path');
    }
    const [catalogBytes, incorporationBytes, captured] = await Promise.all([
      readFile(join(directory, catalogRef.path)), readFile(join(directory, incorporationRef.path)),
      readCapturedDocuments(directory, record.manifest),
    ]);
    const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
    if (hash(catalogBytes) !== catalogRef.hash || hash(incorporationBytes) !== incorporationRef.hash) {
      throw new Error('Accepted evidence hash differs from the committed event');
    }
    const catalog = elementCatalogSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(catalogBytes)));
    const incorporation = incorporationSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(incorporationBytes)));
    if (catalog.manifestHash !== record.manifest.documentManifest.hash) throw new Error('Catalog names another captured manifest');
    return { status: 'available', catalog, catalogHash: catalogRef.hash, incorporation, ...captured };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}
