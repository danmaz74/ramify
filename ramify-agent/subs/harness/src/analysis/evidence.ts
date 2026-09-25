import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { catalogSchema, validateCatalog, type Catalog, type DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { incorporationSchema } from './evidence-contracts.js';
import { readCapturedDocuments } from '../run/document-inputs.js';
import { runLayout, type RunRecord } from '../run/records.js';
import type { RunEvent } from '../run/log.js';
import type { z } from 'zod';

export type AcceptedEvidence = { readonly status: 'available'; readonly catalog: Catalog;
  readonly incorporation: z.infer<typeof incorporationSchema>; readonly manifest: DocumentManifest;
  readonly bytes: ReadonlyMap<string, Uint8Array> } |
  { readonly status: 'unavailable'; readonly reason: string };

/** The accepted event is the authority for two immutable, content-addressed files. */
export async function readAcceptedEvidence(directory: string, record: RunRecord, events: readonly RunEvent[]): Promise<AcceptedEvidence> {
  const accepted = events.find(event => event.type === 'analysis-accepted');
  if (!accepted || accepted.type !== 'analysis-accepted' || !accepted.data.evidence) {
    return { status: 'unavailable', reason: 'This run has no accepted non-functional catalog' };
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
    const catalog = catalogSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(catalogBytes)));
    const incorporation = incorporationSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(incorporationBytes)));
    if (catalog.manifestHash !== record.manifest.documentManifest?.hash) throw new Error('Catalog names another captured manifest');
    const errors = validateCatalog(catalog, captured.manifest, captured.bytes);
    if (errors.length) throw new Error(errors.join('; '));
    return { status: 'available', catalog, incorporation, ...captured };
  } catch (error) {
    return { status: 'unavailable', reason: error instanceof Error ? error.message : String(error) };
  }
}
