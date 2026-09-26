import { createHash } from 'node:crypto';
import {
  catalogSchema, documentManifestSchema, resolvePassage,
  type Catalog, type DocumentManifest,
} from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { assignmentContextSchema, contextSelectionSchema, type ContextSelection } from './contracts.js';

export type SelectionPackage = {
  readonly status: 'available';
  readonly text: string;
  readonly hash: string;
  /** Describes the selector report, not semantic coverage. */
  readonly noReportedUnavailable: boolean;
} | { readonly status: 'unavailable'; readonly errors: readonly string[] };

type SelectionWithoutHash = Omit<ContextSelection, 'packageHash'>;

/** Assemble the same source package on initial delivery and reconstruction. */
export function assembleContextPackage(
  selection: SelectionWithoutHash,
  catalog: Catalog,
  manifest: DocumentManifest,
  bytes: ReadonlyMap<string, Uint8Array>,
): SelectionPackage {
  const errors: string[] = [];
  const parsedCatalog = catalogSchema.safeParse(catalog);
  const parsedManifest = documentManifestSchema.safeParse(manifest);
  if (!parsedCatalog.success) errors.push('Invalid accepted catalog');
  if (!parsedManifest.success) errors.push('Invalid document manifest');
  if (errors.length) return { status: 'unavailable', errors };

  const byId = new Map(catalog.items.map(item => [item.id, item]));
  const principles = new Map(manifest.documents.filter(document => document.kind === 'principle').map(document => [document.id, document]));
  const known = (id: string) => byId.has(id) || principles.has(id);
  const examined = new Set<string>();
  for (const id of selection.examined) {
    if (!known(id)) errors.push(`Examined item ${id} is absent from the accepted catalog and captured principles`);
    if (examined.has(id)) errors.push(`Examined item ${id} occurs twice`);
    examined.add(id);
  }
  const selected = new Set<string>();
  const unavailable = new Set<string>();
  for (const entry of selection.unavailable) {
    if (!examined.has(entry.item)) errors.push(`Unavailable item ${entry.item} was not examined`);
    if (unavailable.has(entry.item)) errors.push(`Unavailable item ${entry.item} occurs twice`);
    unavailable.add(entry.item);
  }

  const sections: string[] = [
    `# Captured context for work item ${selection.workItem}`,
    '',
    `Orientation invocation: ${selection.orientationInvocation}`,
    `Selector invocation: ${selection.selectorInvocation}`,
    `Selection start: ${selection.degraded ? 'degraded fresh start' : 'forked from recorded orientation'}`,
    `Catalog manifest: ${catalog.manifestHash}`,
    '',
    'Classifications and stated conditions below are the initial architect\'s accepted reading. Selection reasons are the selector\'s judgments.',
  ];
  for (const entry of selection.selected) {
    const item = byId.get(entry.item);
    const principle = principles.get(entry.item);
    const identity = item === undefined
      ? `${entry.item}\u0000${entry.passage?.document ?? ''}\u0000${entry.passage?.locator ?? ''}\u0000${entry.passage?.quote ?? ''}`
      : entry.item;
    if (selected.has(identity)) errors.push(`Selected passage for ${entry.item} occurs twice`);
    selected.add(identity);
    if (!examined.has(entry.item)) errors.push(`Selected item ${entry.item} was not examined`);
    if (unavailable.has(entry.item)) errors.push(`Selected item ${entry.item} is also unavailable`);
    if (item === undefined && principle === undefined) continue;
    if (item === undefined && entry.passage === undefined) {
      errors.push(`Selected principle ${entry.item} needs an excerpt`);
      continue;
    }
    if (item === undefined && entry.passage?.document !== entry.item) {
      errors.push(`Selected principle passage for ${entry.item} names another document`);
      continue;
    }
    const reference = item?.passage ?? entry.passage!;
    const document = manifest.documents.find(source => source.id === reference.document);
    const passage = resolvePassage(manifest, reference, bytes.get(reference.document));
    if (document === undefined || passage.status === 'unavailable') {
      errors.push(`${entry.item}: ${passage.status === 'unavailable' ? passage.reason : 'Unknown captured document'}`);
      continue;
    }
    if (item === undefined) {
      sections.push(
        '', `## ${entry.item}: captured principle evidence`,
        `Source: ${document.path} (${document.id}, captured SHA-256 ${document.sha256})`,
        ...(reference.locator ? [`Selector locator: ${reference.locator}`] : []),
        `Captured revision: ${document.revision.commit ?? 'unknown'}; dirty: ${String(document.revision.dirty)}`,
        `Selector scope judgment: ${entry.reason}`,
        `Selector conditions: ${entry.conditions.length === 0 ? 'none' : entry.conditions.join('; ')}`,
        `Selector uncertainty: ${entry.uncertainty || 'none recorded'}`,
        'Selector source excerpt:', passage.text,
      );
      continue;
    }
    sections.push(
      '', `## ${item.id}: ${item.classification}`,
      `Source: ${document.path} (${document.id}, captured SHA-256 ${document.sha256})`,
      ...(reference.locator ? [`Architect locator: ${reference.locator}`] : []),
      `Captured revision: ${document.revision.commit ?? 'unknown'}; dirty: ${String(document.revision.dirty)}`,
      `Catalog conditions: ${item.conditions.length === 0 ? 'none' : item.conditions.map(condition => `${condition.source}: ${condition.text}`).join('; ')}`,
      `Catalog uncertainty: ${item.uncertainty || 'none recorded'}`,
      `Selection reason: ${entry.reason}`,
      `Selection conditions: ${entry.conditions.length === 0 ? 'none' : entry.conditions.join('; ')}`,
      `Selection uncertainty: ${entry.uncertainty || 'none recorded'}`,
      'Architect source excerpt:',
      passage.text,
    );
  }
  if (errors.length) return { status: 'unavailable', errors };
  sections.push('', '## Selection report', '',
    `Examined: ${selection.examined.join(', ') || 'none'}`,
    `Selected: ${selection.selected.map(entry => entry.item).join(', ') || 'none'}`,
    `Unavailable: ${selection.unavailable.length === 0 ? 'none' : selection.unavailable.map(entry => `${entry.item}: ${entry.reason}`).join('; ')}`,
    'An omitted item is not a waiver of its source requirement.',
  );
  const text = sections.join('\n');
  return { status: 'available', text, hash: createHash('sha256').update(text, 'utf8').digest('hex'),
    noReportedUnavailable: selection.unavailable.length === 0 };
}

/** Refuse a submitted hash that does not name the exact reproducible package. */
export function validateContextSelection(
  value: unknown,
  catalog: Catalog,
  manifest: DocumentManifest,
  bytes: ReadonlyMap<string, Uint8Array>,
): SelectionPackage {
  const parsed = contextSelectionSchema.safeParse(value);
  if (!parsed.success) return { status: 'unavailable', errors: ['Invalid context selection record'] };
  const result = assembleContextPackage(parsed.data, catalog, manifest, bytes);
  if (result.status === 'available' && result.hash !== parsed.data.packageHash) {
    return { status: 'unavailable', errors: ['Context package hash differs from assembled source package'] };
  }
  return result;
}

/** Assignment citations can name only passages delivered by this selection. */
export function validateAssignmentContext(value: unknown, selection: ContextSelection, selectionRef: string): string[] {
  const parsed = assignmentContextSchema.safeParse(value);
  if (!parsed.success) return ['Invalid assignment context record'];
  const errors: string[] = [];
  if (parsed.data.workItem !== selection.workItem) errors.push('Assignment names a different work item');
  if (parsed.data.selection !== selectionRef) errors.push('Assignment names a different selection');
  if (parsed.data.packageHash !== selection.packageHash) errors.push('Assignment names a different source package');
  const selected = new Set(selection.selected.map(entry => entry.item));
  const cited = new Set<string>();
  for (const id of parsed.data.citedItems) {
    if (!selected.has(id)) errors.push(`Assignment cites ${id}, which was not selected`);
    if (cited.has(id)) errors.push(`Assignment cites ${id} twice`);
    cited.add(id);
  }
  return errors;
}
