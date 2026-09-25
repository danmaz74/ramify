import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { discoverDocuments } from '../../subs/plan-evidence/src/discovery.js';
import { documentManifestSchema, verifyDocumentBytes, type DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import type { InputManifest } from '../interfaces/protocol/evidence.js';
import { runLayout } from './records.js';

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** Read the manifest and its immutable bytes, refusing partial or changed storage. */
export async function readCapturedDocuments(runDirectory: string, input: InputManifest): Promise<{
  readonly manifest: DocumentManifest; readonly bytes: ReadonlyMap<string, Uint8Array>;
}> {
  if (!input.documentManifest) throw new Error('This run has no captured document manifest');
  if (input.documentManifest.path !== runLayout.documentManifest) throw new Error('Unexpected captured document manifest path');
  const content = await readFile(join(runDirectory, input.documentManifest.path));
  if (hash(content) !== input.documentManifest.hash) throw new Error('The captured document manifest changed');
  const manifest = documentManifestSchema.parse(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)));
  if (manifest.documents[0]?.sha256 !== input.planHash) throw new Error('The root plan hash differs from the input manifest');
  const bytes = new Map<string, Uint8Array>();
  for (const document of manifest.documents) {
    const captured = await readFile(join(runDirectory, document.storedAt));
    if (!verifyDocumentBytes(document, captured)) throw new Error(`Captured bytes changed for ${document.path}`);
    bytes.set(document.id, captured);
  }
  return { manifest, bytes };
}

/** Compare the fixed source corpus without treating intended implementation edits as drift. */
export async function documentChanges(projectRoot: string, planId: string, runDirectory: string, input: InputManifest): Promise<string[]> {
  if (!input.documentManifest) return [];
  let captured: Awaited<ReturnType<typeof readCapturedDocuments>>;
  try { captured = await readCapturedDocuments(runDirectory, input); }
  catch (error) { return [`Captured documents cannot be read as recorded: ${error instanceof Error ? error.message : String(error)}`]; }
  let current: Awaited<ReturnType<typeof discoverDocuments>>;
  try { current = await discoverDocuments(projectRoot, planId, {
    commit: captured.manifest.documents[0]!.revision.commit, dirty: captured.manifest.documents[0]!.revision.dirty ?? false,
  }); }
  catch (error) { return [`Current plan evidence cannot be read: ${error instanceof Error ? error.message : String(error)}`]; }
  const earlier = new Map(captured.manifest.documents.map(document => [document.path, document]));
  const now = new Map(current.manifest.documents.map(document => [document.path, document]));
  const changes: string[] = [];
  for (const document of captured.manifest.documents) {
    const actual = now.get(document.path);
    if (!actual) changes.push(`${document.path} is no longer in the captured source set`);
    else if (actual.sha256 !== document.sha256) changes.push(`${document.path} changed after capture`);
  }
  for (const document of current.manifest.documents) if (!earlier.has(document.path)) changes.push(`${document.path} was added after capture`);
  const gapKey = (gap: DocumentManifest['missing'][number]) => `${gap.from}:${gap.target}:${gap.source.start}:${gap.source.end}:${gap.reason}`;
  const oldGaps = captured.manifest.missing.map(gapKey).sort();
  const newGaps = current.manifest.missing.map(gapKey).sort();
  if (JSON.stringify(oldGaps) !== JSON.stringify(newGaps)) changes.push('The plan reference gaps changed after capture');
  const oldUnreadable = captured.manifest.principlesScan.unreadable.map(item => item.path).sort();
  const newUnreadable = current.manifest.principlesScan.unreadable.map(item => item.path).sort();
  if (JSON.stringify(oldUnreadable) !== JSON.stringify(newUnreadable)) changes.push('The principles scan coverage changed after capture');
  return changes;
}
