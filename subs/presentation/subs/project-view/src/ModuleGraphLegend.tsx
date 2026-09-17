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
  /** Whether non-behavioral-only links are currently drawn. */
  readonly showsDottedLinks?: boolean;
}

export default function ModuleGraphLegend({
  presentationClasses,
  showsDottedLinks = false,
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
      {showsDottedLinks && (
        <div className="module-arch__graph-legend-row">
          <span className="module-arch__graph-legend-edge module-arch__graph-legend-edge--dotted" />
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
