import { join } from 'node:path';
import type { Catalog, DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';

/** The first local turn precedes every assignment and yields a session point. */
export function workOrientationMessage(localBriefing: string): string {
  return `${localBriefing}\n\nBefore organizing this work item, submit only your orientation. State what work you think it asks for, the focus you would use, and open questions. Do not assign an iteration or decide that a source suggestion is binding.`;
}

/** A read-only fork sees the parent's exact packet and the complete catalog/index. */
export function contextSelectorMessage(packet: string, catalog: Catalog, manifest: DocumentManifest, runDirectory: string): string {
  const principles = manifest.documents.filter(document => document.kind === 'principle')
    .map(document => ({ id: document.id, path: document.path, storedAt: document.storedAt,
      capturedFile: join(runDirectory, document.storedAt), sha256: document.sha256, bytes: document.bytes, revision: document.revision }));
  return [
    packet,
    '', '# Captured non-functional catalog', '',
    JSON.stringify(catalog, null, 2),
    '', '# Captured principle index', '',
    JSON.stringify({ scan: manifest.principlesScan, documents: principles }, null, 2),
    '', 'Examine the catalog IDs and any principle document IDs plausibly relevant to this work item.',
    'Read principle passages from the listed immutable captured files, not the current project files. Select exact captured passages with reasons, conditions and uncertainty. A catalog item retains its accepted classification and passage; a principle selection names its document ID and an exact passage from that document.',
    'Name unavailable passages or coverage explicitly. Omission never waives a requirement. Do not change source wording or assign binding force from a filename alone.',
  ].join('\n');
}
