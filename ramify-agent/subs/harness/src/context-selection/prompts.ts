import { createPackage, type ElementCatalog } from '../../subs/plan-evidence/src/interfaces/catalog.js';

/** The first local turn precedes every assignment and yields a session point. */
export function workOrientationMessage(localBriefing: string): string {
  return `${localBriefing}\n\nBefore organizing this work item, submit only your orientation. State what work you think it asks for, the focus you would use, and open questions. Do not assign an iteration or decide that a source suggestion is binding.`;
}

/** The kinds a selector chooses among; functional and context elements come with the entry. */
export const selectableKinds = ['non-functional', 'fixed', 'recommendation'] as const;

/** A read-only fork sees the parent's orientation packet and every selectable element, rendered by the package creator. */
export function contextSelectorMessage(packet: string, catalog: ElementCatalog): string {
  const ids = catalog.elements.filter(element => (selectableKinds as readonly string[]).includes(element.kind)).map(element => element.id);
  const rendered = createPackage({ catalog, planDeviations: [], elements: ids, deviations: [] });
  if ('unavailable' in rendered) throw new Error(`The catalog cannot render its own elements: ${rendered.unavailable.missing.join(', ')}`);
  return [
    packet,
    '', '# The selectable elements', '',
    ids.length === 0 ? 'The catalog holds no non-functional, fixed or recommendation element.' : rendered.text.trimEnd(),
    '', 'Select, by ID, the elements an engineer working this work item must keep in view, each with your reason, conditions and uncertainty. Omitting an element never waives it: every non-functional and fixed element is assessed against the final candidate. You may read a captured document to settle a doubt; answer with IDs only.',
  ].join('\n');
}
