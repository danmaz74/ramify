import { useMemo, useState } from 'react';
import type { ModuleTree as Tree } from '../../harness/src/interfaces/protocol/evidence.js';

export type InitialCapabilityRole = 'entry-owner' | 'suggested-owner' | 'involved';

export interface InitialCapabilityAssociation {
  readonly role: InitialCapabilityRole;
  readonly hypothesis: string | null;
}

export interface CompletedCapability {
  readonly reason: string;
  readonly evidence: readonly string[];
}

export interface CapabilityComparison {
  readonly capability: string;
  readonly initial: readonly InitialCapabilityAssociation[];
  readonly completedHere: CompletedCapability | null;
}

/** One module's two independent capability layers. */
export interface ModuleCapabilityComparison {
  readonly module: string;
  readonly capabilities: readonly CapabilityComparison[];
  readonly proposed?: { readonly parent: string; readonly purpose: string; readonly tags: readonly string[] } | undefined;
}

interface Node {
  readonly module: string;
  readonly parent: string | null;
  readonly proposed: boolean;
}

function leaf(module: string): string {
  return module.slice(module.lastIndexOf('/') + 1);
}

function hasComparison(entry: ModuleCapabilityComparison): boolean {
  return entry.capabilities.some(capability => capability.initial.length > 0 || capability.completedHere !== null);
}

function roleLabel(role: InitialCapabilityRole): string {
  if (role === 'entry-owner') return 'entry owner';
  if (role === 'suggested-owner') return 'suggested owner';
  return 'involved';
}

function comparisonCounts(entry: ModuleCapabilityComparison) {
  let initialOnly = 0;
  let implementedOnly = 0;
  let both = 0;
  for (const capability of entry.capabilities) {
    const initial = capability.initial.length > 0;
    const implemented = capability.completedHere !== null;
    if (initial && implemented) both += 1;
    else if (initial) initialOnly += 1;
    else if (implemented) implementedOnly += 1;
  }
  return { initialOnly, implementedOnly, both };
}

function Markers({ comparison }: { readonly comparison: ModuleCapabilityComparison }) {
  const counts = comparisonCounts(comparison);
  return (
    <span className="activity-markers" aria-label={`Capability markers for ${comparison.module}`}>
      {counts.both > 0 && <span className="activity-marker activity-marker-both">both {counts.both}</span>}
      {counts.initialOnly > 0 && <span className="activity-marker activity-marker-initial">initial {counts.initialOnly}</span>}
      {counts.implementedOnly > 0 && <span className="activity-marker activity-marker-implemented">implemented {counts.implementedOnly}</span>}
      {comparison.proposed && <span className="activity-marker activity-marker-proposed">proposed</span>}
    </span>
  );
}

/**
 * The retained module-tree presentation with independent initial-hypothesis
 * and currently implemented capability layers. The component renders the
 * supplied comparison; it does not infer placement, progress or deployment.
 */
export function ModuleActivityTree({ tree, modules, total, coverage, gaps, analysisIdentity }: {
  readonly tree: Tree;
  readonly modules: readonly ModuleCapabilityComparison[];
  readonly total: { readonly capabilities: number; readonly completed: number };
  readonly coverage: 'complete' | 'partial';
  readonly gaps: readonly string[];
  readonly analysisIdentity: string;
}) {
  const compared = modules.filter(hasComparison);
  const [selected, setSelected] = useState<string | null>(() => (
    compared.find(entry => comparisonCounts(entry).both > 0)?.module ?? compared[0]?.module ?? null
  ));
  const byModule = useMemo(() => new Map(modules.map(entry => [entry.module, entry])), [modules]);
  const selectedComparison = (selected === null ? undefined : byModule.get(selected)) ?? compared[0];

  return (
    <section className="module-activity panel" aria-labelledby="module-capability-heading">
      <header className="module-activity-header">
        <div>
          <p className="eyebrow">Initial hypothesis × implemented now</p>
          <h2 id="module-capability-heading">Capability placement by module</h2>
          <p className="muted">Compare where the initial architect associated each capability with where completed capabilities are implemented now.</p>
        </div>
        <dl className="activity-totals" aria-label="Capability completion total">
          <div><dt>Completed</dt><dd>{total.completed} of {total.capabilities}</dd></div>
        </dl>
      </header>

      {coverage === 'partial' && (
        <div className="activity-coverage" role="status">
          <strong>Partial comparison.</strong> {gaps.length > 0 ? gaps.join(' ') : 'Some comparison evidence is unavailable.'}
        </div>
      )}

      <div className="activity-toolbar">
        <div className="activity-legend" aria-label="Legend">
          <span><i className="activity-legend-swatch activity-legend-initial" /> initial hypothesis</span>
          <span><i className="activity-legend-swatch activity-legend-implemented" /> implemented now</span>
          <span><i className="activity-legend-swatch activity-legend-both" /> both in this module</span>
        </div>
        <span className="activity-count-note">Capability count, not effort or deployment progress</span>
      </div>

      <p className="activity-identity">
        Initial analysis <code>{analysisIdentity}</code>
        {tree.status === 'available' && <><span aria-hidden="true"> · </span>Current module tree <code>{tree.revision}</code></>}
      </p>

      <div className="module-activity-layout">
        <ComparisonTree tree={tree} modules={modules} selected={selectedComparison?.module ?? null} onSelect={setSelected} />
        <ComparisonDetail comparison={selectedComparison} />
      </div>
    </section>
  );
}

function ComparisonTree({ tree, modules, selected, onSelect }: {
  readonly tree: Tree;
  readonly modules: readonly ModuleCapabilityComparison[];
  readonly selected: string | null;
  readonly onSelect: (module: string) => void;
}) {
  const byModule = new Map(modules.map(entry => [entry.module, entry]));
  const compared = modules.filter(hasComparison);
  if (tree.status === 'unavailable') {
    return (
      <div className="activity-tree activity-tree-unavailable" aria-label="Capability placement module tree">
        <p className="warn">The module tree is unavailable: {tree.message}</p>
        <ul>{compared.map(entry => <ComparisonListItem key={entry.module} comparison={entry} selected={selected === entry.module} onSelect={onSelect} />)}</ul>
      </div>
    );
  }

  const nodes = new Map<string, Node>(tree.modules.map(entry => [entry.module, { module: entry.module, parent: entry.parent, proposed: false }]));
  for (const entry of modules) {
    if (entry.proposed && !nodes.has(entry.module)) nodes.set(entry.module, { module: entry.module, parent: entry.proposed.parent, proposed: true });
  }
  const children = new Map<string | null, Node[]>();
  for (const node of nodes.values()) {
    const parent = node.parent !== null && nodes.has(node.parent) ? node.parent : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  for (const list of children.values()) list.sort((left, right) => left.module.localeCompare(right.module));

  const missing = compared.filter(entry => !nodes.has(entry.module));
  const render = (list: readonly Node[]) => (
    <ul>
      {list.map(node => {
        const comparison = byModule.get(node.module);
        const marked = comparison !== undefined && hasComparison(comparison);
        return (
          <li key={node.module} className={marked ? 'activity-node activity-node-marked' : 'activity-node activity-node-muted'}>
            <div className="activity-node-line">
              <button type="button" className="activity-node-button" aria-pressed={selected === node.module} onClick={() => onSelect(node.module)} disabled={!marked} title={node.module}>
                <span>{leaf(node.module)}</span>
              </button>
              {marked && <Markers comparison={comparison} />}
            </div>
            {children.get(node.module) && render(children.get(node.module)!)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="activity-tree" aria-label="Capability placement module tree">
      {render(children.get(null) ?? [])}
      {missing.length > 0 && (
        <div className="activity-missing">
          <p className="warn">Associated modules not present in the current module tree:</p>
          <ul>{missing.map(entry => <ComparisonListItem key={entry.module} comparison={entry} selected={selected === entry.module} onSelect={onSelect} />)}</ul>
        </div>
      )}
    </div>
  );
}

function ComparisonListItem({ comparison, selected, onSelect }: {
  readonly comparison: ModuleCapabilityComparison;
  readonly selected: boolean;
  readonly onSelect: (module: string) => void;
}) {
  return (
    <li>
      <button type="button" className="activity-node-button" aria-pressed={selected} onClick={() => onSelect(comparison.module)}>{comparison.module}</button>
      <Markers comparison={comparison} />
    </li>
  );
}

function ComparisonDetail({ comparison }: { readonly comparison: ModuleCapabilityComparison | undefined }) {
  if (comparison === undefined) return <aside className="activity-detail"><p className="muted">No capability is present in either comparison layer.</p></aside>;
  const initial = comparison.capabilities.filter(capability => capability.initial.length > 0);
  const implemented = comparison.capabilities.filter(capability => capability.completedHere !== null);
  return (
    <aside className="activity-detail" aria-label={`Details for ${comparison.module}`}>
      <p className="eyebrow">Selected module</p>
      <h3><code>{comparison.module}</code></h3>
      {comparison.proposed && <p><span className="activity-marker activity-marker-proposed">proposed</span> {comparison.proposed.purpose}</p>}

      <div className="activity-detail-columns">
        <div className="activity-detail-section">
          <h4>Initial hypothesis</h4>
          {initial.length === 0 ? <p className="muted">No initial association with this module.</p> : (
            <ul className="activity-capabilities">
              {initial.map(capability => (
                <li key={`initial-${capability.capability}`}>
                  <code>{capability.capability}</code>
                  <div className="activity-roles">
                    {capability.initial.map((association, index) => (
                      <span key={`${association.role}-${association.hypothesis ?? 'entry'}-${index}`} className="activity-role">
                        {roleLabel(association.role)}{association.hypothesis === null ? '' : ` · ${association.hypothesis}`}
                      </span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="activity-detail-section">
          <h4>Implemented now</h4>
          {implemented.length === 0 ? <p className="muted">No completed capability is currently owned here.</p> : (
            <ul className="activity-capabilities">
              {implemented.map(capability => (
                <li key={`implemented-${capability.capability}`}>
                  <code>{capability.capability}</code> <span className="activity-capability-completed">implemented</span>
                  <p>{capability.completedHere!.reason}</p>
                  {capability.completedHere!.evidence.length > 0 && <p className="muted">Evidence: {capability.completedHere!.evidence.join(', ')}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  );
}
