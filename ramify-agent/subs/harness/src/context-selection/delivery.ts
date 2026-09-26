import {
  createPackage, type ElementCatalog, type PackageCitation, type PackageDeviation,
} from '../../subs/plan-evidence/src/interfaces/catalog.js';

export type Delivery = { readonly status: 'available'; readonly text: string; readonly hash: string } |
  { readonly status: 'unavailable'; readonly reason: string };

/**
 * Render a cited package again from the frozen catalog and the run's plan
 * deviations. Every consumer and every reconstruction receives these bytes;
 * a missing ID or a rendering that differs from the recorded hash is
 * unavailable, never partial.
 */
export function deliverPackage(catalog: ElementCatalog, planDeviations: readonly PackageDeviation[], cited: PackageCitation): Delivery {
  const rendered = createPackage({ catalog, planDeviations, elements: cited.elements, deviations: cited.deviations });
  if ('unavailable' in rendered) return { status: 'unavailable', reason: `The package cites IDs the run does not hold: ${rendered.unavailable.missing.join(', ')}` };
  if (rendered.hash !== cited.hash) return { status: 'unavailable', reason: 'The package renders to other bytes than its citing record recorded' };
  return { status: 'available', text: rendered.text, hash: rendered.hash };
}

/** Cite a package that must render: the IDs, in the order given, and the hash of their text. */
export function citePackage(catalog: ElementCatalog, planDeviations: readonly PackageDeviation[], elements: readonly string[], deviations: readonly string[]):
  { readonly citation: PackageCitation; readonly text: string } | { readonly missing: readonly string[] } {
  const rendered = createPackage({ catalog, planDeviations, elements, deviations });
  if ('unavailable' in rendered) return { missing: rendered.unavailable.missing };
  return { citation: { elements: [...new Set(elements)], deviations: [...new Set(deviations)], hash: rendered.hash }, text: rendered.text };
}
