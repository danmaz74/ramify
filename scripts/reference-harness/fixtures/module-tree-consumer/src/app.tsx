import { useCallback, useState } from 'react';
import { ModuleTreeCanvas, type ModuleTreeCanvasEmphasis, type ModuleTreeCanvasNode } from 'ramify.ts/module-tree';

/** A consumer-owned hierarchy: each node's height follows its number of rows. */
export const entries: ReadonlyArray<{ id: string; parent: string | null; rows: readonly string[]; emphasis?: ModuleTreeCanvasEmphasis }> = [
  { id: 'workspace', parent: null, rows: ['layout'] },
  { id: 'workspace/alpha', parent: 'workspace', rows: [], emphasis: 'muted' },
  { id: 'workspace/beta', parent: 'workspace', rows: ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'] },
  { id: 'workspace/beta/gamma', parent: 'workspace/beta', rows: ['north', 'south', 'east'], emphasis: 'provisional' },
];

export const ROW_HEIGHT = 28;
export const HEADER_HEIGHT = 48;

export const nodes: readonly ModuleTreeCanvasNode[] = entries.map(entry => ({
  id: entry.id,
  name: entry.id.split('/').at(-1)!,
  parent: entry.parent,
  children: entries.filter(child => child.parent === entry.id).map(child => child.id),
  color: '#2563eb',
  width: 220,
  height: HEADER_HEIGHT + entry.rows.length * ROW_HEIGHT,
  ...entry.emphasis ? { emphasis: entry.emphasis } : {},
}));

/** A body with its own hook state and focusable controls. */
function RowList({ node }: { node: ModuleTreeCanvasNode }) {
  const [marked, setMarked] = useState<readonly string[]>([]);
  const rows = entries.find(entry => entry.id === node.id)!.rows;
  return (
    <div className="consumer-body" data-node={node.id}>
      <strong>{node.name}</strong> <span data-testid={`marked-${node.id}`}>marked {marked.length}</span>
      {rows.map(row => (
        <button key={row} type="button" style={{ display: 'block', height: ROW_HEIGHT }}
          aria-pressed={marked.includes(row)}
          onClick={() => setMarked(current => current.includes(row) ? current.filter(item => item !== row) : [...current, row])}>
          {row}
        </button>
      ))}
    </div>
  );
}

export function App({ onSelect }: { onSelect?: (id: string | null) => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const select = useCallback((id: string | null) => { setSelected(id); onSelect?.(id); }, [onSelect]);
  const toggle = useCallback((id: string) => setCollapsed(current => {
    const next = new Set(current);
    if (!next.delete(id)) next.add(id);
    return next;
  }), []);
  const body = useCallback((node: ModuleTreeCanvasNode) => <RowList node={node} />, []);
  return (
    <div style={{ width: 960, height: 720 }}>
      <ModuleTreeCanvas nodes={nodes} selectedNodeId={selected} collapsedNodeIds={collapsed} ariaLabel="Consumer tree"
        renderNodeBody={body} onSelectNode={select} onToggleCollapsed={toggle} />
    </div>
  );
}
