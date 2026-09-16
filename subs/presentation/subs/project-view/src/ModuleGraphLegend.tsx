// Adapted from cucumber-viz
// src/domains/module-architecture/ui/components/ModuleGraphLegend.tsx at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import type React from 'react';
import {
  getPresentationClassColor,
  getPresentationClassLabel,
} from './moduleTypePresentation.js';

export interface ModuleGraphLegendProps {
  readonly presentationClasses: readonly string[];
}

export default function ModuleGraphLegend({
  presentationClasses,
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
        <span className="module-arch__graph-legend-badge module-arch__graph-legend-badge--healthy">ok</span>
        <span>Module accesses: allowed</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-badge module-arch__graph-legend-badge--warn">limited</span>
        <span>Module accesses: limited</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-badge module-arch__graph-legend-badge--error">denied</span>
        <span>Module accesses: denied</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--ok" />
        <span>Edge: allowed</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--warn" />
        <span>Edge: limited evidence</span>
      </div>
      <div className="module-arch__graph-legend-row">
        <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--error" />
        <span>Edge: denied</span>
      </div>
    </div>
  );
}
