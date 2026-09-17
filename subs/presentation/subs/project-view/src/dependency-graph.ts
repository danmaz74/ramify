import type {
  DependencyGraphEdge,
  DependencyGraphModel,
  DependencyGraphState,
  DependencySettings,
} from './interfaces/dependency-view.js';

export const defaultDependencySettings: DependencySettings = Object.freeze({
  showNonBehavioral: false,
  linkTarget: 'imported-module',
});

export const idleDependencyGraph: DependencyGraphState = Object.freeze({
  data: null,
  phase: 'idle',
  reason: null,
  isStale: false,
});

/** One link drawn under the current settings, taken from exactly one edge collection. */
export interface ActiveDependencyEdge {
  /** The projection-specific edge ID from the model. */
  readonly id: string;
  readonly projection: DependencySettings['linkTarget'];
  readonly consumer: string;
  readonly provider: string;
  /** Behavioral count in the projection's unit. */
  readonly behavioral: number;
  /** Non-behavioral count in the projection's unit, drawn or not. */
  readonly nonBehavioral: number;
  /** The classified count the current setting displays. */
  readonly displayed: number;
  /** Solid when any behavioral count supports the link; dotted for non-behavioral-only. */
  readonly pattern: 'solid' | 'dotted';
  /** Denied, then limited, then allowed over all of the edge's evidence; settings never change it. */
  readonly status: 'allowed' | 'limited' | 'denied';
  readonly source: DependencyGraphEdge;
}

export const minimumLinkWidth = 1.5;
export const maximumLinkWidth = 6;

export function activeDependencyEdges(
  model: DependencyGraphModel,
  settings: DependencySettings,
): ActiveDependencyEdge[] {
  const collection: readonly DependencyGraphEdge[] = settings.linkTarget === 'imported-module'
    ? model.importedModuleEdges
    : model.originalOwnerEdges;
  const result: ActiveDependencyEdge[] = [];
  for (const edge of collection) {
    const { behavioral, nonBehavioral } = edgeCounts(edge);
    const displayed = behavioral + (settings.showNonBehavioral ? nonBehavioral : 0);
    if (displayed === 0) continue;
    result.push({
      id: edge.id,
      projection: edge.projection,
      consumer: edge.consumer,
      provider: edge.provider,
      behavioral,
      nonBehavioral,
      displayed,
      pattern: behavioral > 0 ? 'solid' : 'dotted',
      status: edgeStatus(edge),
      source: edge,
    });
  }
  return result;
}

/** Status precedence denied, limited, allowed over the per-original status of the edge's evidence. */
export function edgeStatus(edge: DependencyGraphEdge): ActiveDependencyEdge['status'] {
  if (edge.evidence.some((item) => item.status === 'denied')) return 'denied';
  if (edge.evidence.some((item) => item.status === 'limited')) return 'limited';
  return 'allowed';
}

export function edgeCounts(edge: DependencyGraphEdge): { behavioral: number; nonBehavioral: number } {
  return edge.projection === 'imported-module'
    ? { behavioral: edge.counts.behavioralUsedOriginals, nonBehavioral: edge.counts.nonBehavioralUsedOriginals }
    : { behavioral: edge.counts.behavioral, nonBehavioral: edge.counts.nonBehavioral };
}

/** A bounded logarithmic width over the displayed classified count. */
export function linkWidth(displayed: number): number {
  const count = Math.max(1, displayed);
  return Math.min(maximumLinkWidth, minimumLinkWidth + Math.log2(count) * 1.1);
}
