// Adapted from cucumber-viz
// src/domains/module-architecture/ui/components/ModuleGraphLegend.tsx at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import type React from 'react';
import type { DependencyDepthMode } from './interfaces/dependency-view.js';
import {
  getPresentationClassColor,
  getPresentationClassLabel,
} from './moduleTypePresentation.js';

export interface ModuleGraphLegendProps {
  readonly presentationClasses: readonly string[];
  /** Whether non-behavioral-only links are currently drawn. */
  readonly showsNonBehavioralLinks?: boolean;
  /** The unit of the drawn links; omitted while none is drawn. */
  readonly depthMode?: DependencyDepthMode;
}

export default function ModuleGraphLegend({
  presentationClasses,
  showsNonBehavioralLinks = false,
  depthMode,
}: ModuleGraphLegendProps): React.ReactElement {
  return (
    <div className="module-arch__graph-legend" aria-hidden="true">
      <div className="module-arch__graph-legend-title">Legend</div>
      {presentationClasses.map((presentationClass) => (
        <div className="module-arch__graph-legend-row" key={presentationClass}>
          <span
            className="module-arch__graph-legend-swatch"
            style={{ background: getPresentationClassColor(presentationClass) }}
          />
          <span>Tags: {getPresentationClassLabel(presentationClass)}</span>
        </div>
      ))}
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--ok" />
        <span>Link: behavioral or mixed</span>
      </div>
      {depthMode && (
        <div className="module-arch__graph-legend-row">
          <span>{depthMode === 'level'
            ? 'Link unit: a module and everything under it'
            : 'Link unit: one exact consumer and original owner'}</span>
        </div>
      )}
      {showsNonBehavioralLinks && (
        <div className="module-arch__graph-legend-row">
          <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--non-behavioral" />
          <span>Link: non-behavioral only</span>
        </div>
      )}
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--warn" />
        <span>Link status: limited</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--error" />
        <span>Link status: denied</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-badge module-arch__graph-legend-badge--error">denied</span>
        <span>Module badge: its displayed outgoing links</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span>Width: displayed classified count</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span>Module size: owned source files</span>
      </div>
    </div>
  );
}
