import { createHash } from 'node:crypto';
import type { Catalog, DocumentManifest } from '../../subs/plan-evidence/src/interfaces/contracts.js';
import { assignmentContextSchema, type ContextSelection } from './contracts.js';
import { assembleContextPackage, validateAssignmentContext } from './selection.js';

export type AssignmentContext = ReturnType<typeof assignmentContextSchema.parse>;

export type AssignmentDelivery =
  | { readonly status: 'available'; readonly text: string; readonly hash: string; readonly noReportedUnavailable: boolean }
  | { readonly status: 'unavailable'; readonly reasons: readonly string[] };

/** Bind an assignment's citations to the immutable selection package, never to agent-authored prose. */
export function makeAssignmentContext(
  assignment: string,
  selectionRef: string,
  selection: ContextSelection,
  citedItems: readonly string[],
): AssignmentContext | { readonly errors: readonly string[] } {
  const value = assignmentContextSchema.parse({
    schema: 'ramify-agent.assignment-context/1',
    workItem: selection.workItem,
    assignment,
    selection: selectionRef,
    citedItems: [...citedItems],
    packageHash: selection.packageHash,
  });
  const errors = validateAssignmentContext(value, selection, selectionRef);
  return errors.length === 0 ? value : { errors };
}

/** Rebuild only cited passages for any session using the verified full selection as authority. */
export function assignmentDelivery(
  context: unknown,
  expected: { readonly assignment: string; readonly workItem: string; readonly selectionRef: string },
  recorded: { readonly selection: ContextSelection; readonly packageText: string },
  catalog: Catalog,
  manifest: DocumentManifest,
  bytes: ReadonlyMap<string, Uint8Array>,
): AssignmentDelivery {
  const parsed = assignmentContextSchema.safeParse(context);
  if (!parsed.success) return { status: 'unavailable', reasons: ['Invalid assignment context record'] };
  const value = parsed.data;
  const reasons = validateAssignmentContext(value, recorded.selection, expected.selectionRef);
  if (value.assignment !== expected.assignment) reasons.push('Assignment context names another assignment');
  if (value.workItem !== expected.workItem) reasons.push('Assignment context names another work item');
  const fullHash = createHash('sha256').update(recorded.packageText, 'utf8').digest('hex');
  if (fullHash !== recorded.selection.packageHash) reasons.push('Recorded source package differs from selection hash');
  if (reasons.length > 0) return { status: 'unavailable', reasons };

  const cited = new Set(value.citedItems);
  const assembled = assembleContextPackage({
    ...recorded.selection,
    selected: recorded.selection.selected.filter(entry => cited.has(entry.item)),
  }, catalog, manifest, bytes);
  if (assembled.status === 'unavailable') return { status: 'unavailable', reasons: assembled.errors };
  const text = [
    `# Source evidence for assignment ${value.assignment}`,
    `Full selection package SHA-256: ${value.packageHash}`,
    `Architect-cited IDs: ${value.citedItems.join(', ') || 'none'}`,
    '',
    assembled.text,
  ].join('\n');
  return { status: 'available', text, hash: createHash('sha256').update(text, 'utf8').digest('hex'),
    noReportedUnavailable: assembled.noReportedUnavailable };
}
