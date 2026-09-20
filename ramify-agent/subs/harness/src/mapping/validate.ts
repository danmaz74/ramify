import type { MapSubmission } from '../interfaces/map.js';
import { findInView, symbolRecords, type ApiViewSnapshot, type ArchitectIndex, type SourceArea } from './views.js';

/** The key of a requester's API view in a job's evidence. */
export function viewKey(module: string, area: SourceArea): string {
  return `${module}\u0000${area}`;
}

/**
 * The mechanical checks of a shape-valid map against the job's views, and
 * nothing else:
 *
 * - every named module exists in the architect view or is marked proposed;
 * - every cited symbol exists in the architect view under the named owner;
 * - every availability agrees with the requester's API view as this job
 *   materialized it, and none but `unknown` is stated for a requester whose
 *   view this job never materialized.
 *
 * The checks that need no view (the entry point among the modules touched,
 * seams across branches) are the shape validator's. Errors name the offending
 * path, such as `reuse.0.availability: ...`.
 */
export function validateAgainstViews(map: MapSubmission, index: ArchitectIndex, views: ReadonlyMap<string, ApiViewSnapshot>): string[] {
  const errors: string[] = [];
  const proposed = new Set(map.modulesTouched.filter(entry => entry.proposed).map(entry => entry.module));
  const named = (path: string, module: string) => {
    if (!index.modules.has(module) && !proposed.has(module)) {
      errors.push(`${path}: "${module}" is not a module of the architect view and is not marked proposed in modulesTouched`);
    }
  };

  map.modulesTouched.forEach((entry, i) => {
    if (!entry.proposed) named(`modulesTouched.${i}.module`, entry.module);
    else named(`modulesTouched.${i}.proposed.parent`, entry.proposed.parent);
  });
  map.newCapabilities.forEach((capability, i) => {
    named(`newCapabilities.${i}.owner`, capability.owner);
    capability.consumers.forEach((consumer, j) => named(`newCapabilities.${i}.consumers.${j}`, consumer));
  });
  map.seams.forEach((seam, i) => {
    named(`seams.${i}.owner`, seam.owner);
    named(`seams.${i}.consumer`, seam.consumer);
  });
  named('entryPoint.module', map.entryPoint.module);
  map.workItems.forEach((item, i) => named(`workItems.${i}.subtreeRoot`, item.subtreeRoot));

  map.reuse.forEach((reuse, i) => {
    const at = `reuse.${i}`;
    let symbolsExist = true;
    reuse.symbols.forEach((symbol, j) => {
      if (!index.modules.has(symbol.owner)) {
        errors.push(`${at}.symbols.${j}.owner: "${symbol.owner}" is not a module of the architect view; reused symbols must exist`);
        symbolsExist = false;
      } else if (symbolRecords(index, symbol.owner, symbol.name).length === 0) {
        errors.push(`${at}.symbols.${j}: the architect view records no exported "${symbol.name}" owned by "${symbol.owner}"`);
        symbolsExist = false;
      }
    });
    named(`${at}.requester.module`, reuse.requester.module);
    const availability = reuse.availability;
    if (availability.status === 'unknown') return;
    if (availability.status === 'unavailable') {
      availability.exposures.forEach((exposure, j) => named(`${at}.availability.exposures.${j}.module`, exposure.module));
    }

    const view = views.get(viewKey(reuse.requester.module, reuse.requester.area));
    if (!view) {
      errors.push(`${at}.availability: "${availability.status}" is stated for ${reuse.requester.module} (${reuse.requester.area}), whose API view this job never materialized. Call materialize_api_view for it and read the view, or state "unknown" with the reason`);
      return;
    }
    if (!symbolsExist) return;
    const placements = reuse.symbols.map(symbol => ({
      symbol,
      found: symbolRecords(index, symbol.owner, symbol.name).map(record => findInView(view, record)).find(place => place !== undefined),
    }));

    if (availability.status === 'available') {
      for (const { symbol, found } of placements) {
        if (!found) {
          errors.push(`${at}.availability: "${symbol.name}" of ${symbol.owner} is not in ${view.path}, the API view of ${reuse.requester.module} (${reuse.requester.area}), so the view does not show it available${view.coverage === null ? '' : `; the view reports coverage limits (${view.coverage}), so state "unknown" if you cannot establish it`}`);
        }
      }
      const record = availability.record.replace(/^\.\//, '');
      const file = view.files.get(record);
      if (!file) {
        errors.push(`${at}.availability.record: "${availability.record}" is not a file of ${view.path}; cite the generated file that lists the symbol`);
      } else if (!reuse.symbols.some(symbol => placements.find(placement => placement.symbol === symbol)?.found?.path === record)) {
        errors.push(`${at}.availability.record: ${record} lists none of the reused symbols`);
      }
      return;
    }

    // unavailable
    for (const { symbol, found } of placements) {
      if (found) errors.push(`${at}.availability: "${symbol.name}" of ${symbol.owner} is listed in ${found.path}, so it is available to ${reuse.requester.module} (${reuse.requester.area}), not unavailable`);
    }
    if (view.coverage !== null) {
      errors.push(`${at}.availability: ${view.path} reports coverage limits (${view.coverage}); absence from an incomplete view does not establish "unavailable", so state "unknown" with that reason`);
    }
  });
  return errors;
}
