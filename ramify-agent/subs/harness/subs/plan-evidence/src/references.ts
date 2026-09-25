import type { DocumentManifest } from './interfaces/contracts.js';
import { verifyDocumentBytes } from './interfaces/contracts.js';

export interface PlanReference {
  readonly document?: string | undefined;
  readonly anchor?: string | undefined;
  readonly lines?: readonly [number, number] | undefined;
}

export type ResolvedPlanReference =
  | { readonly status: 'available'; readonly document: string; readonly path: string; readonly text: string }
  | { readonly status: 'unavailable'; readonly reason: string };

/** Markdown heading anchor normalization shared by analysis and review reads. */
export function headingAnchor(heading: string): string {
  return heading.toLowerCase().replace(/[`*_~]/gu, '').replace(/[^\p{Letter}\p{Number}\s-]/gu, '').trim().replace(/\s+/gu, '-');
}

/** Resolve a legacy or document-scoped reference without changing source whitespace. */
export function resolvePlanReference(
  manifest: DocumentManifest,
  bytes: ReadonlyMap<string, Uint8Array>,
  reference: PlanReference,
): ResolvedPlanReference {
  const id = reference.document ?? manifest.root;
  const document = manifest.documents.find(item => item.id === id);
  if (!document) return { status: 'unavailable', reason: `Unknown document ${id}` };
  const source = bytes.get(id);
  if (!source || !verifyDocumentBytes(document, source)) return { status: 'unavailable', reason: `Unavailable or changed bytes for ${document.path}` };
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(source); }
  catch { return { status: 'unavailable', reason: `Invalid UTF-8 in ${document.path}` }; }
  const lines = text.split('\n');
  if (reference.anchor === undefined && reference.lines === undefined) return { status: 'unavailable', reason: 'A heading anchor or line range is required' };
  if (reference.lines) {
    const [from, to] = reference.lines;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to > lines.length) {
      return { status: 'unavailable', reason: `Invalid line range [${from}, ${to}] for ${document.path}` };
    }
    return { status: 'available', document: id, path: document.path, text: lines.slice(from - 1, to).join('\n') };
  }
  const normalized = headingAnchor(reference.anchor!.replace(/^#/u, ''));
  const start = lines.findIndex(line => {
    const heading = /^ {0,3}#{1,6}\s+(.*?)\s*#*\s*$/u.exec(line);
    return heading !== null && headingAnchor(heading[1]!) === normalized;
  });
  if (start < 0) return { status: 'unavailable', reason: `No heading ${reference.anchor} in ${document.path}` };
  const level = /^ {0,3}(#{1,6})/u.exec(lines[start]!)![1]!.length;
  let end = start + 1;
  while (end < lines.length) {
    const heading = /^ {0,3}(#{1,6})\s/u.exec(lines[end]!);
    if (heading && heading[1]!.length <= level) break;
    end += 1;
  }
  return { status: 'available', document: id, path: document.path, text: lines.slice(start, end).join('\n') };
}
