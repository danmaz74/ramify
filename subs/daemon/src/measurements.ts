import type { ArchitectMeasurements, MeasurementViewSize, MeasurementViews, ModuleMeasurement,
  SessionMeasurements } from '../../analysis/src/interfaces/measurements.js';
import type { ApiViewProjection } from '../../analysis/src/interfaces/session.js';
import { renderApiViewBounded, type BoundedApiViewRenderOptions, type BoundedApiViewRenderOutcome } from './api-view-documents.js';

/** The daemon-owned exact API-view measurement, using publication's encoder. */
export function measureApiViewBytes(projection: ApiViewProjection, revision: string,
  options: BoundedApiViewRenderOptions): Promise<BoundedApiViewRenderOutcome> {
  return renderApiViewBounded(projection, revision, options);
}

/** Join one session snapshot with one uniform view-byte state. */
export function architectMeasurements(snapshot: SessionMeasurements, views: MeasurementViews,
  exactViews: Readonly<Record<string, MeasurementViewSize>> = {}): ArchitectMeasurements {
  const children = new Map<string, string[]>();
  for (const module of snapshot.modules) {
    if (module.parent === null) continue;
    const list = children.get(module.parent) ?? [];
    list.push(module.id); children.set(module.parent, list);
  }
  const subtreeViews = (owner: string): MeasurementViewSize => {
    let ordinaryBytes = 0, testsBytes = 0;
    const pending = [owner], seen = new Set<string>();
    while (pending.length) {
      const next = pending.pop()!;
      if (seen.has(next)) continue;
      seen.add(next);
      const exact = exactViews[next] ?? { ordinaryBytes: 0, testsBytes: 0 };
      ordinaryBytes += exact.ordinaryBytes; testsBytes += exact.testsBytes;
      pending.push(...children.get(next) ?? []);
    }
    return { ordinaryBytes, testsBytes };
  };
  const modules: ModuleMeasurement[] = snapshot.modules.map(module => {
    if (views !== 'measured') return { ...module };
    const exact = exactViews[module.id];
    if (!exact) throw new Error(`View measurement has no module ${module.id}`);
    return { ...module, exact: { ...module.exact, views: exact },
      subtree: { ...module.subtree, views: subtreeViews(module.id) } };
  });
  if (views === 'measured' && Object.keys(exactViews).length !== modules.length) {
    throw new Error('View measurements do not name exactly the inventory modules');
  }
  return { state: 'measured', views, modules };
}
