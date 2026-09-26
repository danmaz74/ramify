import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { DocumentManifest } from './contracts.js';

/*
 * The element catalog of Plan 14 and its one package creator. An element is
 * one requirement, one recommendation or one passage of plan context, as the
 * extracting agent read it from a captured document. Nothing here compares element text with the
 * captured bytes: the reading is an agent's, and only IDs, the frozen
 * catalog and the rendering are exact.
 */

const text = z.string().min(1);
const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
const documentId = z.string().regex(/^doc-\d{3,}$/);

/** The five kinds, in the order a package renders them. */
export const elementKinds = ['context', 'functional', 'non-functional', 'fixed', 'recommendation'] as const;
export type ElementKind = typeof elementKinds[number];

/** The ID prefix of each kind. */
export const elementPrefixes = {
  context: 'ctx', functional: 'fr', 'non-functional': 'nfr', fixed: 'fix', recommendation: 'rec',
} as const satisfies Record<ElementKind, string>;

/** The captured document kinds an element of each kind may be read from. */
const elementSources: Record<ElementKind, readonly ('plan' | 'principle')[]> = {
  context: ['plan'], functional: ['plan'], 'non-functional': ['plan'], fixed: ['principle'], recommendation: ['plan', 'principle'],
};

export const elementIdSchema = z.string().regex(/^(ctx|fr|nfr|fix|rec)-\d{3,}$/);
export const planDeviationIdSchema = z.string().regex(/^pd-\d{3,}$/);

export const elementConditionSchema = z.object({ text, source: z.enum(['stated', 'inferred']) }).strict();

const elementBodySchema = z.object({
  kind: z.enum(elementKinds),
  /** The captured document the element was read from. */
  document: documentId,
  /** The requirement as its source states it, as closely as the agent found practical; no size bound. */
  text,
  conditions: z.array(elementConditionSchema),
  /** The extracting agent's uncertainty; may be empty. */
  uncertainty: z.string(),
  /** Written for a person; never resolved and never rendered into a package. */
  locator: text.optional(),
}).strict();

export const catalogElementSchema = elementBodySchema.extend({ id: elementIdSchema }).strict().superRefine((element, ctx) => {
  if (!element.id.startsWith(`${elementPrefixes[element.kind]}-`)) {
    ctx.addIssue({ code: 'custom', path: ['id'], message: 'ID prefix disagrees with kind' });
  }
});
export type CatalogElement = z.infer<typeof catalogElementSchema>;

/**
 * What an extracting agent submits. The key names the element within its
 * own submission only; the harness assigns the ID on acceptance.
 */
export const submittedElementSchema = elementBodySchema.extend({
  key: text.refine(key => !elementIdSchema.safeParse(key).success, 'a submission-local key cannot take the form of an element ID'),
}).strict();
export type SubmittedElement = z.infer<typeof submittedElementSchema>;

/** The captured documents elements may name, with the path a package renders. */
export const catalogDocumentSchema = z.object({ id: documentId, path: text, kind: z.enum(['plan', 'principle']) }).strict();

export const elementCatalogSchema = z.object({
  schema: z.literal('ramify-agent.element-catalog/1'),
  /** The SHA-256 of the captured document manifest the elements were read from. */
  manifestHash: sha256,
  documents: z.array(catalogDocumentSchema).min(1),
  elements: z.array(catalogElementSchema),
  /** IDs a correction retired; never issued again and never rendered. */
  retired: z.array(elementIdSchema),
}).strict().superRefine((catalog, ctx) => {
  const documents = new Map(catalog.documents.map(document => [document.id, document]));
  const ids = new Set<string>();
  catalog.elements.forEach((element, index) => {
    if (ids.has(element.id)) ctx.addIssue({ code: 'custom', path: ['elements', index, 'id'], message: 'duplicate element ID' });
    ids.add(element.id);
    const problem = documentProblem(element, documents);
    if (problem) ctx.addIssue({ code: 'custom', path: ['elements', index, 'document'], message: problem });
  });
  catalog.retired.forEach((id, index) => {
    if (ids.has(id)) ctx.addIssue({ code: 'custom', path: ['retired', index], message: 'duplicate or active retired ID' });
    ids.add(id);
  });
});
export type ElementCatalog = z.infer<typeof elementCatalogSchema>;

function documentProblem(
  element: { readonly kind: ElementKind; readonly document: string },
  documents: ReadonlyMap<string, { readonly kind: 'plan' | 'principle' }>,
): string | undefined {
  const document = documents.get(element.document);
  if (document === undefined) return `${element.document} is not a captured document`;
  if (!elementSources[element.kind].includes(document.kind)) {
    return `a ${element.kind} element cannot be read from a ${document.kind} document`;
  }
  return undefined;
}

/** An empty catalog over a run's captured documents, before the first extraction is accepted. */
export function openElementCatalog(manifestHash: string, manifest: DocumentManifest): ElementCatalog {
  return elementCatalogSchema.parse({
    schema: 'ramify-agent.element-catalog/1', manifestHash,
    documents: manifest.documents.map(({ id, path, kind }) => ({ id, path, kind })),
    elements: [], retired: [],
  });
}

export type ElementAcceptance =
  | { readonly ok: true; readonly catalog: ElementCatalog; readonly ids: ReadonlyMap<string, string> }
  | { readonly ok: false; readonly errors: readonly string[] };

/**
 * Accept one submission's elements: IDs continue each kind's numbering past
 * every issued or retired ID, in submission order, and the returned map
 * rewrites the submission's local keys to them. Each element is parsed
 * here, and every error carries the path of the submitted element.
 */
export function acceptElements(catalog: ElementCatalog, submission: readonly unknown[]): ElementAcceptance {
  const errors: string[] = [];
  const documents = new Map(catalog.documents.map(document => [document.id, document]));
  const keys = new Set<string>();
  const submitted: SubmittedElement[] = [];
  submission.forEach((candidate, index) => {
    const parsed = submittedElementSchema.safeParse(candidate);
    if (!parsed.success) {
      errors.push(...parsed.error.issues.map(issue => `${[index, ...issue.path].join('.')}: ${issue.message}`));
      return;
    }
    const element = parsed.data;
    submitted.push(element);
    if (keys.has(element.key)) errors.push(`${index}.key: duplicate submission-local key ${element.key}`);
    keys.add(element.key);
    const problem = documentProblem(element, documents);
    if (problem) errors.push(`${index}.document: ${problem}`);
  });
  if (errors.length > 0) return { ok: false, errors };
  const next = new Map(elementKinds.map(kind => [kind, highestNumber(catalog, kind) + 1]));
  const ids = new Map<string, string>();
  const accepted = submitted.map(({ key, ...body }) => {
    const number = next.get(body.kind)!;
    next.set(body.kind, number + 1);
    const id = `${elementPrefixes[body.kind]}-${String(number).padStart(3, '0')}`;
    ids.set(key, id);
    return { id, ...body };
  });
  return { ok: true, catalog: elementCatalogSchema.parse({ ...catalog, elements: [...catalog.elements, ...accepted] }), ids };
}

function highestNumber(catalog: ElementCatalog, kind: ElementKind): number {
  const prefix = `${elementPrefixes[kind]}-`;
  return [...catalog.elements.map(element => element.id), ...catalog.retired]
    .filter(id => id.startsWith(prefix))
    .reduce((highest, id) => Math.max(highest, Number(id.slice(prefix.length))), 0);
}

/**
 * Resolve citations to element IDs. A citation is a key of the citing
 * submission, rewritten through `keys`, or an ID among `elements`; anything
 * else, including a retired ID, is rejected with its path.
 */
export function resolveCitations(
  citations: readonly string[],
  scope: { readonly keys?: ReadonlyMap<string, string>; readonly elements: ReadonlySet<string> },
  path: string,
): { readonly ok: true; readonly ids: readonly string[] } | { readonly ok: false; readonly errors: readonly string[] } {
  const errors: string[] = [];
  const ids = citations.map((citation, index) => {
    const id = scope.keys?.get(citation) ?? (scope.elements.has(citation) ? citation : undefined);
    if (id === undefined) errors.push(`${path}.${index}: unknown element ${citation}`);
    return id ?? citation;
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, ids };
}

/** The bytes the harness writes as `analysis/catalog.json`: sorted keys, one trailing newline. */
export function serializeElementCatalog(catalog: ElementCatalog): string {
  return `${canonical(catalog)}\n`;
}

/** The catalog's identity for the run: the SHA-256 of its serialized bytes. */
export function elementCatalogHash(catalog: ElementCatalog): string {
  return createHash('sha256').update(serializeElementCatalog(catalog)).digest('hex');
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * A plan deviation as a package renders it. The harness owns deviation
 * records and supplies this view of them; the text is the amended
 * requirement, read under the deviation's own authority.
 */
export const packageDeviationSchema = z.object({
  id: planDeviationIdSchema,
  /** Requirements and recommendations only; context states no requirement to amend. */
  amends: z.array(elementIdSchema.refine(id => !id.startsWith('ctx-'), 'a deviation cannot amend context')).min(1),
  /** Who recorded the deviation and for what, for example the global architect for a work item. */
  authority: text,
  text,
}).strict();
export type PackageDeviation = z.infer<typeof packageDeviationSchema>;

export interface PackageRequest {
  readonly catalog: ElementCatalog;
  /** Every plan deviation of the run, in recorded order; only the named ones are rendered. */
  readonly planDeviations: readonly PackageDeviation[];
  readonly elements: readonly string[];
  readonly deviations: readonly string[];
}

export type Package =
  | { readonly text: string; readonly hash: string; readonly bytes: number }
  | { readonly unavailable: { readonly missing: readonly string[] } };

const kindHeadings: Record<ElementKind, string> = {
  context: 'Context',
  functional: 'Functional requirements',
  'non-functional': 'Non-functional requirements of the plan',
  fixed: 'Fixed requirements',
  recommendation: 'Recommendations',
};

const kindLabels: Record<ElementKind, string> = {
  context: 'context',
  functional: 'functional requirement',
  'non-functional': 'non-functional requirement of the plan',
  fixed: 'fixed requirement',
  recommendation: 'recommendation',
};

/** The fixed sentence under the context heading. */
export const contextNotice = 'Context describes the situation the plan starts from and why the plan exists. It is not a requirement, and nothing assesses it.';

/** The fixed sentence under the recommendations heading. */
export const recommendationNotice = 'Recommendations are not requirements: nothing assesses them, and a departure from one is reported in your result, not justified.';

/** The fixed sentence under the plan deviations heading. */
export const deviationNotice = 'Each plan deviation amends the elements it names for the rest of this run, under its own authority; the elements above are unchanged.';

/**
 * Render elements and plan deviations into one package. Elements appear by
 * kind, context first and recommendations last, in catalog order within a
 * kind, whole; the named deviations follow
 * in recorded order. The request's order and repetitions do not change the
 * bytes. A missing ID, including an amended element the catalog does not
 * hold, makes the whole package unavailable; an amended element may lie
 * outside the package. Malformed or duplicate deviations are a
 * caller defect and throw.
 */
export function createPackage(request: PackageRequest): Package {
  const { catalog } = request;
  const recorded = z.array(packageDeviationSchema).parse(request.planDeviations);
  if (new Set(recorded.map(deviation => deviation.id)).size !== recorded.length) throw new Error('Duplicate plan deviation ID');
  const requested = new Set(request.elements);
  const named = new Set(request.deviations);
  const elements = catalog.elements.filter(element => requested.has(element.id));
  const deviations = recorded.filter(deviation => named.has(deviation.id));
  const active = new Set(catalog.elements.map(element => element.id));
  const missing = [
    ...[...requested].filter(id => !elements.some(element => element.id === id)),
    ...[...named].filter(id => !deviations.some(deviation => deviation.id === id)),
    ...new Set(deviations.flatMap(deviation => deviation.amends).filter(id => !active.has(id) && !requested.has(id))),
  ];
  if (missing.length > 0) return { unavailable: { missing } };

  const paths = new Map(catalog.documents.map(document => [document.id, document.path]));
  const ordered = elementKinds.flatMap(kind => elements.filter(element => element.kind === kind));
  const lines = [
    '# Plan context package',
    '',
    `Catalog: ${elementCatalogHash(catalog)}`,
    `Elements: ${list(ordered.map(element => element.id))}`,
    `Deviations: ${list(deviations.map(deviation => deviation.id))}`,
  ];
  for (const kind of elementKinds) {
    const ofKind = ordered.filter(element => element.kind === kind);
    if (ofKind.length === 0) continue;
    lines.push('', `## ${kindHeadings[kind]}`);
    if (kind === 'context') lines.push('', contextNotice);
    if (kind === 'recommendation') lines.push('', recommendationNotice);
    for (const element of ofKind) {
      lines.push('', `### ${element.id}: ${kindLabels[kind]} from ${paths.get(element.document)!}`, '', quote(element.text), '');
      if (element.conditions.length === 0) lines.push('Conditions: none recorded.');
      else lines.push('Conditions:', ...element.conditions.map(condition => `- ${condition.source}: ${indent(condition.text)}`));
      lines.push('', `Uncertainty: ${element.uncertainty.trim() === '' ? 'none recorded.' : indent(element.uncertainty)}`);
    }
  }
  if (deviations.length > 0) {
    lines.push('', '## Plan deviations', '', deviationNotice);
    for (const deviation of deviations) {
      lines.push('', `### ${deviation.id} amends ${deviation.amends.join(', ')}`, '', `Authority: ${indent(deviation.authority)}`, '', quote(deviation.text));
    }
  }
  const body = `${lines.join('\n')}\n`;
  return { text: body, hash: createHash('sha256').update(body).digest('hex'), bytes: new TextEncoder().encode(body).length };
}

function list(ids: readonly string[]): string {
  return ids.length === 0 ? 'none' : ids.join(', ');
}

/** Quote source text line by line so its own headings cannot read as package structure. */
function quote(value: string): string {
  return value.split('\n').map(line => (line === '' ? '>' : `> ${line}`)).join('\n');
}

function indent(value: string): string {
  return value.split('\n').join('\n  ');
}
