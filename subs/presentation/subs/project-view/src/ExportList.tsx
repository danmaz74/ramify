// Adapted from cucumber-viz
// src/domains/module-architecture/ui/components/ExportList.tsx at
// 44b7f30e0fdfda79ead8363ef4c85c100e36fda0.

import React from 'react';
import type { ExplorerExport } from './interfaces/project-view.js';

export const COMPONENT_UID = 'cmp_project_explorer_exports';

export type ExportDetailState =
  | { readonly state: 'idle' }
  | { readonly state: 'loading' }
  | { readonly state: 'described'; readonly signature: string;
      readonly documentation?: string }
  | { readonly state: 'truncated'; readonly signature: string;
      readonly documentation?: string;
      readonly truncated: readonly ('signature' | 'documentation' | 'overloads')[] }
  | { readonly state: 'unavailable'; readonly reason: string };

export interface ExportListProps {
  readonly exports: readonly ExplorerExport[];
  readonly expandedExportId: string | null;
  readonly detail: ExportDetailState;
  readonly onToggleExport: (item: ExplorerExport) => void;
}

const CAPABILITY_STYLES: Record<ExplorerExport['capability'], {
  readonly bg: string;
  readonly color: string;
  readonly label: string;
}> = {
  value: { bg: '#dbeafe', color: '#1d4ed8', label: 'value' },
  type: { bg: '#fce7f3', color: '#be185d', label: 'type' },
  'value-and-type': { bg: '#f3e8ff', color: '#7c3aed', label: 'value + type' },
  resource: { bg: '#ecfdf5', color: '#047857', label: 'resource' },
  unknown: { bg: '#f1f5f9', color: '#475569', label: 'unknown' },
};

export default function ExportList({
  exports: exportItems,
  expandedExportId,
  detail,
  onToggleExport,
}: ExportListProps): React.ReactElement {
  return (
    <div className="export-list">
      {exportItems.map((item) => {
        const isExpanded = item.id === expandedExportId;
        const capabilityStyle = CAPABILITY_STYLES[item.capability];

        return (
          <div
            key={item.id}
            className={`export-list__item${isExpanded ? ' export-list__item--expanded' : ''}`}
          >
            <button
              type="button"
              className="export-list__toggle"
              aria-expanded={isExpanded}
              onClick={() => onToggleExport(item)}
            >
              <span
                className="export-list__kind"
                style={{ background: capabilityStyle.bg, color: capabilityStyle.color }}
              >
                {capabilityStyle.label}
              </span>
              <span className="export-list__name">{item.name}</span>
              {item.exposures.length > 0 && (
                <span className="export-list__barrels" aria-label="Exposure destinations">
                  {exposureBadges(item).map((badge) => (
                    <span
                      key={badge.key}
                      className={`export-list__barrel-badge export-list__barrel-badge--${badge.effective ? 'effective' : 'ineffective'}`}
                    >
                      {badge.label}
                    </span>
                  ))}
                </span>
              )}
              {item.forwarded && <span className="export-list__reexport">forwarded</span>}
              <span className="export-list__chevron" aria-hidden="true">
                {isExpanded ? '\u25B2' : '\u25BC'}
              </span>
            </button>

            {isExpanded && (
              <div className="export-list__signature-container">
                <dl className="export-list__facts">
                  <div>
                    <dt>Aliases</dt>
                    <dd>{item.aliases.join(', ') || item.name}</dd>
                  </div>
                  <div>
                    <dt>Capability</dt>
                    <dd>{capabilityStyle.label}</dd>
                  </div>
                  <div>
                    <dt>Defined in</dt>
                    <dd>{item.file}</dd>
                  </div>
                </dl>
                {item.tags.length > 0 && (
                  <p className="export-list__metadata">Tags: {item.tags.join(', ')}</p>
                )}
                <div className="export-list__locations" aria-label="Source locations">
                  <strong>Source locations</strong>
                  {item.locations.length > 0 ? (
                    <ul>
                      {item.locations.map((location, index) => (
                        <li key={`${location.file}:${location.start}:${index}`}>
                          {formatLocation(location)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span> Unavailable</span>
                  )}
                </div>
                <div className="export-list__exposures" aria-label="Exposure details">
                  <strong>Exposures</strong>
                  {item.exposures.length > 0 ? (
                    <ul>
                      {item.exposures.map((exposure, index) => (
                        <li key={`${exposure.module}:${exposure.names.join(',')}:${index}`}>
                          {exposure.module}: {exposure.destinations.join(' + ')}
                          {!exposure.effective ? ' (ineffective)' : ''}
                          {exposure.provider ? ` via ${exposure.provider}` : ''}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <span> None declared</span>
                  )}
                </div>
                {item.signature.state === 'unavailable' ? (
                  <p className="export-list__no-signature">
                    Signature unavailable: missing original identity
                  </p>
                ) : (
                  renderDetail(detail)
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function renderDetail(detail: ExportDetailState): React.ReactNode {
  if (detail.state === 'loading') {
    return (
      <div className="export-list__signature-loading">
        <div className="spinner spinner--small" />
        <span>Loading signature...</span>
      </div>
    );
  }
  if (detail.state === 'described' || detail.state === 'truncated') {
    return (
      <div className="export-list__detail-result">
        <pre className="export-list__signature">{detail.signature}</pre>
        {detail.documentation && (
          <p className="export-list__documentation">{detail.documentation}</p>
        )}
        {detail.state === 'truncated' && (
          <p className="export-list__truncated">
            Truncated: {detail.truncated.join(', ')}
          </p>
        )}
      </div>
    );
  }
  if (detail.state === 'unavailable') {
    return <p className="export-list__no-signature">Signature unavailable: {detail.reason}</p>;
  }
  return <p className="export-list__no-signature">Signature details have not been loaded</p>;
}

function exposureBadges(item: ExplorerExport): readonly {
  readonly key: string;
  readonly label: string;
  readonly effective: boolean;
}[] {
  return item.exposures.flatMap((exposure, exposureIndex) =>
    exposure.destinations.map((destination) => ({
      key: `${exposure.module}:${destination}:${exposureIndex}`,
      label: destination,
      effective: exposure.effective,
    })),
  );
}

function formatLocation(location: ExplorerExport['locations'][number]): string {
  return `${location.file}:${location.line}:${location.column}`;
}
