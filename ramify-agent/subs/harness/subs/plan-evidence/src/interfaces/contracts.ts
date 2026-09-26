import { createHash } from 'node:crypto';
import { z } from 'zod';

const text = z.string().min(1);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const documentId = z.string().regex(/^doc-\d{3,}$/);
const projectPath = z.string().min(1).refine(path =>
  !path.startsWith('/') && !path.includes('\\') && !/^[A-Za-z]:/.test(path) &&
  path.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..'),
  'a canonical project-relative path is required');

/** The manifest names immutable byte files; no document bytes enter a ledger line. */
export const capturedDocumentSchema = z.object({
  id: documentId,
  path: projectPath,
  kind: z.enum(['plan', 'principle']),
  sha256,
  bytes: z.int().nonnegative(),
  /** Run-relative immutable file, written through the harness's ledger effect. */
  storedAt: projectPath,
  /** The source revision when captured; a dirty source retains its content hash. */
  /** `dirty: null` means Git status was not measured for this document. */
  revision: z.object({ commit: text.nullable(), dirty: z.boolean().nullable() }).strict(),
}).strict();
export type CapturedDocument = z.infer<typeof capturedDocumentSchema>;

export const missingDocumentSchema = z.object({
  from: documentId,
  target: projectPath,
  source: z.object({ start: z.int().nonnegative(), end: z.int().positive() }).strict(),
  reason: text,
  /** Only the architect decides whether the gap blocks acceptance. */
  judgment: z.enum(['unjudged', 'required', 'unclear', 'advisory']),
}).strict();

export const documentManifestSchema = z.object({
  schema: z.literal('ramify-agent.document-manifest/1'),
  root: documentId,
  documents: z.array(capturedDocumentSchema).min(1),
  missing: z.array(missingDocumentSchema),
  principlesScan: z.object({
    status: z.enum(['complete', 'partial', 'empty']),
    /** `.` identifies the project root if even its directory listing fails. */
    unreadable: z.array(z.object({ path: z.union([projectPath, z.literal('.')]), reason: text }).strict()),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const ids = new Set<string>();
  const paths = new Set<string>();
  value.documents.forEach((document, index) => {
    if (ids.has(document.id)) ctx.addIssue({ code: 'custom', path: ['documents', index, 'id'], message: 'duplicate document ID' });
    if (paths.has(document.path)) ctx.addIssue({ code: 'custom', path: ['documents', index, 'path'], message: 'duplicate canonical path' });
    ids.add(document.id);
    paths.add(document.path);
  });
  if (value.documents[0]?.id !== value.root || !/^plans\/[^/]+\/plan\.md$/.test(value.documents[0]?.path ?? '')) {
    ctx.addIssue({ code: 'custom', path: ['root'], message: 'the root plan must be the first document at plans/<id>/plan.md' });
  }
  if (value.documents[0]?.kind !== 'plan') ctx.addIssue({ code: 'custom', path: ['documents', 0, 'kind'], message: 'the root document is a plan' });
  value.missing.forEach((gap, index) => {
    if (!ids.has(gap.from)) ctx.addIssue({ code: 'custom', path: ['missing', index, 'from'], message: 'missing reference source is not captured' });
  });
  const principles = value.documents.filter(document => document.kind === 'principle').length;
  if ((value.principlesScan.status === 'empty') !== (principles === 0 && value.principlesScan.unreadable.length === 0)) {
    ctx.addIssue({ code: 'custom', path: ['principlesScan', 'status'], message: 'empty means no principle documents or unreadable candidates' });
  }
  if (value.principlesScan.status === 'complete' && value.principlesScan.unreadable.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['principlesScan', 'status'], message: 'unreadable candidates require partial coverage' });
  }
  if (value.principlesScan.status === 'partial' && value.principlesScan.unreadable.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['principlesScan', 'status'], message: 'partial coverage names unreadable candidates' });
  }
});
export type DocumentManifest = z.infer<typeof documentManifestSchema>;

/** The architect's source-grounded wording. A locator helps a reader find context. */
export const passageReferenceSchema = z.object({
  document: documentId,
  quote: text,
  locator: text.optional(),
});
export type PassageReference = z.infer<typeof passageReferenceSchema>;

const conditionSchema = z.object({ text, source: z.enum(['stated', 'inferred']) }).strict();
const catalogItemBaseSchema = z.object({
  id: z.string().regex(/^(nfr|adv)-\d{3,}$/),
  classification: z.enum(['non-functional-requirement', 'advice']),
  passage: passageReferenceSchema,
  conditions: z.array(conditionSchema),
  uncertainty: z.string(),
}).strict();
export const catalogItemSchema = catalogItemBaseSchema.superRefine((item, ctx) => {
  const prefix = item.classification === 'advice' ? 'adv-' : 'nfr-';
  if (!item.id.startsWith(prefix)) ctx.addIssue({ code: 'custom', path: ['id'], message: 'ID prefix disagrees with classification' });
});
export const catalogSchema = z.object({
  schema: z.literal('ramify-agent.nonfunctional-catalog/1'),
  manifestHash: sha256,
  items: z.array(catalogItemSchema),
}).strict();
export type Catalog = z.infer<typeof catalogSchema>;

/** Architect input has no durable ID; the owner assigns IDs in submission order. */
export const submittedCatalogItemSchema = catalogItemBaseSchema.omit({ id: true });
export type SubmittedCatalogItem = z.infer<typeof submittedCatalogItemSchema>;

export function assignCatalog(
  manifestHash: string,
  items: readonly SubmittedCatalogItem[],
  manifest: DocumentManifest,
  bytes: ReadonlyMap<string, Uint8Array>,
): { readonly ok: true; readonly catalog: Catalog } | { readonly ok: false; readonly errors: readonly string[] } {
  const counters = { 'non-functional-requirement': 0, advice: 0 };
  const catalog = catalogSchema.parse({
    schema: 'ramify-agent.nonfunctional-catalog/1', manifestHash,
    items: items.map(item => ({ ...item,
      id: `${item.classification === 'advice' ? 'adv' : 'nfr'}-${String(++counters[item.classification]).padStart(3, '0')}`,
    })),
  });
  const errors = validateCatalog(catalog, manifest, bytes);
  return errors.length ? { ok: false, errors } : { ok: true, catalog };
}

/** IDs preserve the architect's submitted order within each class. */
export function validateCatalog(catalog: Catalog, manifest: DocumentManifest, bytes: ReadonlyMap<string, Uint8Array>): string[] {
  const errors: string[] = [];
  const counters = { 'non-functional-requirement': 0, advice: 0 };
  for (const item of catalog.items) {
    const next = ++counters[item.classification];
    const expected = `${item.classification === 'advice' ? 'adv' : 'nfr'}-${String(next).padStart(3, '0')}`;
    if (item.id !== expected) errors.push(`${item.id} must be ${expected}`);
    const resolved = resolvePassage(manifest, item.passage, bytes.get(item.passage.document));
    if (resolved.status === 'unavailable') errors.push(`${item.id}: ${resolved.reason}`);
  }
  return errors;
}

/** Verify the captured document bytes independently of any agent excerpt. */
export function verifyDocumentBytes(document: CapturedDocument, bytes: Uint8Array): boolean {
  return bytes.length === document.bytes && createHash('sha256').update(bytes).digest('hex') === document.sha256;
}

export type PassageResult = { readonly status: 'available'; readonly text: string } |
  { readonly status: 'unavailable'; readonly reason: string };

/** Preserve agent wording and require only an available captured document. */
export function resolvePassage(manifest: DocumentManifest, reference: PassageReference, bytes: Uint8Array | undefined): PassageResult {
  const document = manifest.documents.find(item => item.id === reference.document);
  if (document === undefined) return { status: 'unavailable', reason: `Unknown document ${reference.document}` };
  if (bytes === undefined || !verifyDocumentBytes(document, bytes)) return { status: 'unavailable', reason: `Unavailable or changed bytes for ${document.path}` };
  return { status: 'available', text: reference.quote };
}
