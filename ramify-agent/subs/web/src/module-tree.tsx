import type { TouchedModule, Weight } from '../../harness/src/interfaces/map.js';
import type { ModuleTree as Tree } from '../../harness/src/interfaces/protocol/maps.js';

interface Node {
  readonly module: string;
  readonly parent: string | null;
  readonly proposed: boolean;
}

const weightLabel: Record<Weight, string> = { heavy: 'heavy', light: 'light', 'exposure-only': 'exposure only' };

function WeightBadge({ weight }: { readonly weight: Weight }) {
  return <span className={`weight weight-${weight}`}>{weightLabel[weight]}</span>;
}

/** The last segment of a declared-name path. */
function leaf(module: string): string {
  return module.slice(module.lastIndexOf('/') + 1);
}

/**
 * The modules a map touches, drawn on the project's module tree with their
 * weights. The branches that hold touched modules are open; every other
 * module is one muted line with the number of modules beneath it. A proposed
 * module is drawn under its parent and marked as proposed.
 */
export function ModuleTree({ tree, touched }: { readonly tree: Tree; readonly touched: readonly TouchedModule[] }) {
  const byModule = new Map(touched.map(entry => [entry.module, entry]));
  if (tree.status === 'unavailable') {
    return (
      <div aria-label="Module tree">
        <p className="muted">The module tree is not available: {tree.message}</p>
        <TouchedList touched={touched} />
      </div>
    );
  }
  const nodes = new Map<string, Node>(tree.modules.map(entry => [entry.module, { module: entry.module, parent: entry.parent, proposed: false }]));
  for (const entry of touched) {
    if (entry.proposed && !nodes.has(entry.module)) nodes.set(entry.module, { module: entry.module, parent: entry.proposed.parent, proposed: true });
  }
  const children = new Map<string | null, Node[]>();
  for (const node of nodes.values()) {
    const parent = node.parent !== null && nodes.has(node.parent) ? node.parent : null;
    children.set(parent, [...(children.get(parent) ?? []), node]);
  }
  for (const list of children.values()) list.sort((a, b) => (a.module < b.module ? -1 : 1));
  const open = new Set<string>();
  for (const entry of touched) {
    for (let current: string | null | undefined = entry.module; current != null && nodes.has(current) && !open.has(current); current = nodes.get(current)?.parent) {
      open.add(current);
    }
  }
  const count = (module: string): number => (children.get(module) ?? []).reduce((sum, child) => sum + 1 + count(child.module), 0);
  const missing = touched.filter(entry => !nodes.has(entry.module));

  const render = (list: readonly Node[]) => (
    <ul>
      {list.map(node => {
        const entry = byModule.get(node.module);
        const beneath = count(node.module);
        return (
          <li key={node.module} className={entry ? 'tree-touched' : open.has(node.module) ? 'tree-path' : 'tree-other'} data-module={node.module}>
            <span className="tree-name" title={node.module}>{leaf(node.module)}</span>
            {entry && <WeightBadge weight={entry.weight} />}
            {node.proposed && <span className="proposed">proposed</span>}
            {!open.has(node.module) && beneath > 0 && <span className="muted"> +{beneath} beneath</span>}
            {entry && <p className="why">{entry.why}{entry.proposed && <> Purpose: {entry.proposed.purpose}{entry.proposed.tags.length ? ` Tags: ${entry.proposed.tags.join(', ')}.` : ''}</>}</p>}
            {open.has(node.module) && children.get(node.module) && render(children.get(node.module)!)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <div className="module-tree" aria-label="Module tree">
      {render(children.get(null) ?? [])}
      {missing.length > 0 && (
        <>
          <p className="failure">Not in the module tree the architect view last recorded:</p>
          <TouchedList touched={missing} />
        </>
      )}
    </div>
  );
}

function TouchedList({ touched }: { readonly touched: readonly TouchedModule[] }) {
  return (
    <ul className="touched-list">
      {touched.map(entry => (
        <li key={entry.module}>
          <code>{entry.module}</code> <WeightBadge weight={entry.weight} />
          {entry.proposed && <span className="proposed">proposed under {entry.proposed.parent}</span>}
          <p className="why">{entry.why}</p>
        </li>
      ))}
    </ul>
  );
}
