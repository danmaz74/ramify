import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
} from '@xyflow/react';
import type { Edge, EdgeProps, Node, NodeProps, ReactFlowInstance } from '@xyflow/react';
import type { Point } from '../../layout/src/interfaces/layout.js';
import type {
  ExplorerCoverage,
  ExplorerEdge,
  ExplorerExport,
  ExplorerModule,
  ProjectExplorerModel,
} from './interfaces/project-view.js';
import {
  ancestorsOf,
  indexModuleTree,
  layoutModuleTree,
  PROJECT_NODE_ID,
  TREE_NODE_HEIGHT,
  TREE_NODE_WIDTH,
} from './module-tree.js';
import { useAutoFit } from './auto-fit.js';
import { getPresentationClassColor, getPresentationClassLabel } from './moduleTypePresentation.js';
import './project-view.css';
import './module-tree.css';

export interface ModuleTreeViewProps {
  readonly data: ProjectExplorerModel | null;
  readonly isLoading: boolean;
  readonly error: Error | null;
  readonly unavailableReason: string | null;
  readonly isStale: boolean;
  readonly notice: string | null;
  readonly selectedModuleId: string | null;
  readonly collapsedModuleIds: ReadonlySet<string>;
  readonly onSelectModule: (id: string | null) => void;
  readonly onToggleCollapsed: (id: string) => void;
  readonly onExpandAll: () => void;
  readonly onCollapseToDepth: (depth: number) => void;
  readonly onOpenModule: (id: string) => void;
  readonly onRefresh: () => void;
  /** Centres this module once, instead of fitting the whole tree, when it is laid out. */
  readonly centerModuleId?: string | null;
}

interface TreeNodeData extends Record<string, unknown> {
  readonly module: ExplorerModule | null;
  readonly isSelected: boolean;
  readonly isCollapsed: boolean;
  readonly childCount: number;
  readonly hiddenCount: number;
  readonly coverageCount: number;
  readonly onSelect: (id: string) => void;
  readonly onToggle: (id: string) => void;
  readonly onOpen: (id: string) => void;
}

type TreeNode = Node<TreeNodeData, 'moduleTreeNode'>;
type TreeEdge = Edge<{ readonly points: readonly Point[] }, 'treeElbow'>;

function ModuleTreeNodeView({ data }: NodeProps<TreeNode>): React.ReactElement {
  const module = data.module;
  if (module === null) {
    return <div className="module-tree__node module-tree__node--project" style={{ width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT }}>
      <Handle type="source" position={Position.Bottom} className="module-tree__handle" />
      <span className="module-tree__node-name">Project</span>
    </div>;
  }
  const color = getPresentationClassColor(module.presentationClass);
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') data.onSelect(module.id);
    else if (event.key === 'ArrowLeft' && data.childCount > 0 && !data.isCollapsed) data.onToggle(module.id);
    else if (event.key === 'ArrowRight' && data.isCollapsed) data.onToggle(module.id);
    else if (event.key === 'o') data.onOpen(module.id);
    else return;
    event.preventDefault();
    event.stopPropagation();
  };
  return (
    <div
      className={`module-tree__node${data.isSelected ? ' module-tree__node--selected' : ''}`}
      style={{ width: TREE_NODE_WIDTH, height: TREE_NODE_HEIGHT, borderLeftColor: color }}
      data-module-id={module.id}
      role="treeitem"
      aria-selected={data.isSelected}
      aria-expanded={data.childCount > 0 ? !data.isCollapsed : undefined}
      aria-label={module.name}
      tabIndex={0}
      onKeyDown={keyDown}
      title={module.directory}
    >
      <Handle type="target" position={Position.Top} className="module-tree__handle" />
      <Handle type="source" position={Position.Bottom} className="module-tree__handle" />
      <div className="module-tree__node-top">
        <span className="module-tree__node-name">{module.name}</span>
        {module.metrics.deniedAccesses > 0 && (
          <span className="module-tree__marker module-tree__marker--denied" title="Denied accesses">
            {module.metrics.deniedAccesses}
          </span>
        )}
        {data.coverageCount > 0 && (
          <span className="module-tree__marker module-tree__marker--coverage" title="Coverage notes">!</span>
        )}
      </div>
      <div className="module-tree__node-class" style={{ color }}>
        {getPresentationClassLabel(module.presentationClass)}
      </div>
      <div className="module-tree__node-meta">
        <span>{module.metrics.ownedFiles} files · {data.childCount} subs</span>
        {module.purpose.state !== 'present' && <span className="module-tree__marker--readme">no README</span>}
      </div>
      {data.childCount > 0 && (
        <button
          type="button"
          className="module-tree__toggle nodrag nopan"
          aria-label={`${data.isCollapsed ? 'Expand' : 'Collapse'} ${module.name}`}
          onClick={event => { event.stopPropagation(); data.onToggle(module.id); }}
          onDoubleClick={event => event.stopPropagation()}
        >
          {data.isCollapsed ? `+${data.hiddenCount}` : '−'}
        </button>
      )}
    </div>
  );
}

function TreeElbowEdge({ id, data }: EdgeProps<TreeEdge>): React.ReactElement | null {
  const points = data?.points ?? [];
  if (points.length === 0) return null;
  const path = points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x},${point.y}`).join(' ');
  return <path id={id} d={path} className="module-tree__edge" fill="none" />;
}

const nodeTypes = { moduleTreeNode: ModuleTreeNodeView };
const treeFitOptions = { padding: 0.12, minZoom: 0.1, maxZoom: 1.2 };
const edgeTypes = { treeElbow: TreeElbowEdge };

export function ModuleTreeView({
  data,
  isLoading,
  error,
  unavailableReason,
  isStale,
  notice,
  selectedModuleId,
  collapsedModuleIds,
  onSelectModule,
  onToggleCollapsed,
  onExpandAll,
  onCollapseToDepth,
  onOpenModule,
  onRefresh,
  centerModuleId = null,
}: ModuleTreeViewProps): React.ReactElement {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [sidebarWidth, setSidebarWidth] = useState(360);
  const contentRef = useRef<HTMLDivElement>(null);
  const centered = useRef<string | null>(null);

  const index = useMemo(() => indexModuleTree(data?.modules ?? [], data?.rootModuleId), [data]);
  const coverageByModule = useMemo(() => {
    const result = new Map<string, ExplorerCoverage[]>();
    for (const item of data?.coverage ?? []) for (const id of item.moduleIds) {
      const list = result.get(id) ?? [];
      list.push(item);
      result.set(id, list);
    }
    return result;
  }, [data]);
  const layout = useMemo(() => layoutModuleTree(index, collapsedModuleIds), [collapsedModuleIds, index]);

  const nodes = useMemo<TreeNode[]>(() => layout.nodes.map(node => {
    const module = index.modulesById.get(node.id) ?? null;
    const childCount = index.children.get(node.id)?.length ?? 0;
    return {
      id: node.id,
      type: 'moduleTreeNode',
      position: { x: node.x, y: node.y },
      // Controlled nodes never receive measurements back; the minimap needs their size.
      initialWidth: TREE_NODE_WIDTH,
      initialHeight: TREE_NODE_HEIGHT,
      draggable: false,
      selectable: module !== null,
      data: {
        module,
        isSelected: node.id === selectedModuleId,
        isCollapsed: collapsedModuleIds.has(node.id),
        childCount,
        hiddenCount: index.descendants.get(node.id) ?? 0,
        coverageCount: coverageByModule.get(node.id)?.length ?? 0,
        onSelect: onSelectModule,
        onToggle: onToggleCollapsed,
        onOpen: onOpenModule,
      },
    };
  }), [collapsedModuleIds, coverageByModule, index, layout, onOpenModule, onSelectModule, onToggleCollapsed, selectedModuleId]);
  const edges = useMemo<TreeEdge[]>(() => layout.edges.map(edge => ({
    id: edge.id, source: edge.parent, target: edge.child, type: 'treeElbow', data: { points: edge.points },
  })), [layout]);
  const autoFit = useAutoFit<ReactFlowInstance<TreeNode, TreeEdge>>(nodes.length, treeFitOptions, centerModuleId === null);
  const flow = autoFit.flow;

  useEffect(() => {
    if (!flow || !centerModuleId || centered.current === centerModuleId) return;
    const node = layout.nodes.find(item => item.id === centerModuleId);
    if (!node) return;
    centered.current = centerModuleId;
    void flow.setCenter(node.x + TREE_NODE_WIDTH / 2, node.y + TREE_NODE_HEIGHT / 2, { zoom: 1 });
  }, [centerModuleId, flow, layout]);

  const handleResizeStart = useCallback((event: React.MouseEvent) => {
    event.preventDefault();
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!contentRef.current) return;
      const rect = contentRef.current.getBoundingClientRect();
      setSidebarWidth(Math.max(240, Math.min(rect.right - moveEvent.clientX, rect.width * 0.6)));
    };
    const onMouseUp = () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, []);

  if (isLoading) return frame('Loading the published project report...',
    <div className="module-arch__loading"><div className="spinner" /><p>Loading module tree...</p></div>);
  if (error) return failure('Project analysis failed', error.message);
  if (unavailableReason) return failure('Module tree unavailable', unavailableReason);
  if (!data || data.modules.length === 0) {
    return frame('No declared modules are available', <div className="module-arch__empty"><h3>No modules found</h3>
      <p>The published report contains no declared Ramify modules.</p></div>);
  }
  const model = data;
  const selected = selectedModuleId ? index.modulesById.get(selectedModuleId) ?? null : null;

  return (
    <div className="project-explorer-page module-tree">
      <div className="module-arch">
        <div className="module-arch__header">
          <div>
            <h2 className="module-arch__title">Module tree</h2>
            <p className="module-arch__subtitle">
              {model.modules.length} modules, depth {index.maxDepth}
            </p>
            <p className="module-arch__revision">Revision {String(model.revision)}</p>
            {notice && <p role="status" className="module-tree__notice">{notice}</p>}
          </div>
          <div className="module-arch__header-actions">
            {model.state === 'partial' && (
              <span className="module-arch__health-badge module-arch__health-badge--warning">
                Partial coverage ({model.coverage.length} notes)
              </span>
            )}
            <button type="button" className="module-arch__refresh-btn" onClick={onExpandAll}>Expand all</button>
            <button type="button" className="module-arch__refresh-btn" onClick={() => onCollapseToDepth(1)}>
              Collapse to depth 1
            </button>
            <button
              type="button"
              className={`module-arch__refresh-btn${isStale ? ' module-arch__refresh-btn--stale' : ''}`}
              onClick={onRefresh}
              disabled={!isStale}
            >
              {isStale ? 'Refresh (stale)' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="module-arch__content" ref={contentRef}>
          <div className="module-arch__main">
            <div className="module-tree__canvas" role="tree" aria-label="Module tree" ref={autoFit.containerRef}>
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                nodesDraggable={false}
                nodesConnectable={false}
                onNodeClick={(_event, node) => { if (node.id !== PROJECT_NODE_ID) onSelectModule(node.id); }}
                onNodeDoubleClick={(_event, node) => { if (node.id !== PROJECT_NODE_ID) onOpenModule(node.id); }}
                onPaneClick={() => onSelectModule(null)}
                zoomOnDoubleClick={false}
                onInit={autoFit.onInit}
                onMoveStart={autoFit.onMoveStart}
                fitView={centerModuleId === null}
                fitViewOptions={treeFitOptions}
                minZoom={0.1}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="#dbe3f0" />
                <Controls showInteractive={false} />
                <MiniMap style={{ bottom: 12 }} pannable zoomable
                  nodeColor={node => {
                    const module = (node.data as TreeNodeData).module;
                    return module ? getPresentationClassColor(module.presentationClass) : '#94a3b8';
                  }} />
              </ReactFlow>
            </div>
          </div>

          <div
            className="module-arch__resize-handle"
            onMouseDown={handleResizeStart}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
          />

          <div className="module-arch__sidebar" style={{ width: sidebarWidth }}>
            {selected ? renderModuleDetail(selected) : renderSummary()}
          </div>
        </div>
      </div>
    </div>
  );

  function frame(subtitle: string, body: React.ReactNode): React.ReactElement {
    return (
      <div className="project-explorer-page module-tree"><div className="module-arch">
        <div className="module-arch__header"><div>
          <h2 className="module-arch__title">Module tree</h2>
          <p className="module-arch__subtitle">{subtitle}</p>
          {notice && <p role="status" className="module-tree__notice">{notice}</p>}
        </div></div>
        {body}
      </div></div>
    );
  }

  function failure(title: string, detail: string): React.ReactElement {
    return frame(title, (
      <div className="module-arch__error">
        <div className="module-arch__error-icon">!</div>
        <h3>{title}</h3>
        <p className="module-arch__error-detail">{detail || 'An unknown error occurred'}</p>
        <button type="button" className="module-arch__refresh-btn" onClick={onRefresh}>Retry</button>
      </div>
    ));
  }

  function renderSummary(): React.ReactNode {
    const summary = model.summary;
    return (
      <div className="module-arch__detail">
        <div className="module-arch__detail-header">
          <h3 className="module-arch__detail-name">Project summary</h3>
          <p className="module-arch__detail-description">Select a module to inspect its details.</p>
        </div>
        <div className="module-arch__detail-metrics">
          {metric(summary.owners, 'Modules')}
          {metric(summary.ownedFiles, 'Owned files')}
          {metric(summary.edges, 'Module dependencies')}
          {metric(summary.deniedAccesses, 'Denied accesses')}
          {metric(summary.limitedAccesses, 'Limited accesses')}
          {metric(summary.coverageNotes, 'Coverage notes')}
        </div>
      </div>
    );
  }

  function renderModuleDetail(module: ExplorerModule): React.ReactNode {
    const children = index.children.get(module.id) ?? [];
    const parent = module.parent ? index.modulesById.get(module.parent) ?? null : null;
    const dependencies = model.edges.filter(edge => edge.consumer === module.id);
    const dependents = model.edges.filter(edge => edge.provider === module.id);
    const coverage = coverageByModule.get(module.id) ?? [];
    const tests = module.files.filter(file => file.area === 'tests').length;
    const resources = module.files.filter(file => file.kind === 'resource').length;
    const exposed = exportGroups(module);
    return (
      <div className="module-arch__detail" data-testid="module-tree-detail">
        <div className="module-arch__detail-header">
          <h3 className="module-arch__detail-name">{module.name}</h3>
          <span className="module-arch__detail-path">{module.directory}</span>
          <div className="module-tree__chips">
            <span className="module-arch__dependency-badge module-arch__dependency-badge--class">
              {getPresentationClassLabel(module.presentationClass)}
            </span>
            {module.tags.map(tag => <span key={tag} className="module-tree__chip">{tag}</span>)}
          </div>
          <p className="module-arch__detail-description">
            {module.purpose.state === 'present'
              ? module.purpose.paragraph
              : `No README purpose (${module.purpose.state}): ${module.purpose.readme}`}
          </p>
          <button type="button" className="module-arch__submodule-enter" onClick={() => onOpenModule(module.id)}>
            Open in import explorer
          </button>
        </div>

        {collapsible('structure', 'Structure', (
          <>
            <div className="module-arch__detail-metrics">
              {metric(index.depth.get(module.id) ?? 0, 'Depth')}
              {metric(children.length, 'Direct children')}
              {metric(index.descendants.get(module.id) ?? 0, 'Subtree modules')}
            </div>
            <p className="module-tree__line">
              Parent: {parent ? moduleLink(parent.id) : <span>none</span>}
            </p>
            {children.length > 0 && (
              <div className="module-arch__submodule-list">
                {children.map(id => {
                  const child = index.modulesById.get(id)!;
                  return (
                    <button key={id} type="button" className="module-arch__submodule-item" onClick={() => reveal(id)}>
                      <span className="module-arch__submodule-name">{child.name}</span>
                      <span className="module-arch__submodule-files">{child.metrics.ownedFiles} owned files</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ))}

        {collapsible('files', 'Files', (
          <div className="module-arch__detail-metrics">
            {metric(module.metrics.ownedFiles, 'Owned files')}
            {metric(module.metrics.subtreeFiles, 'Subtree files')}
            {metric(module.files.length - tests, 'Ordinary')}
            {metric(tests, 'Tests')}
            {metric(module.files.length - resources, 'Source')}
            {metric(resources, 'Resources')}
          </div>
        ))}

        {collapsible('imports', 'Imports', (
          <>
            <div className="module-arch__detail-metrics">
              {metric(module.metrics.dependencies, 'Dependencies')}
              {metric(module.metrics.dependents, 'Dependents')}
              {metric(module.metrics.deniedAccesses, 'Denied accesses')}
              {metric(module.metrics.limitedAccesses, 'Limited accesses')}
            </div>
            {edgeList('Depends on', dependencies, 'provider')}
            {edgeList('Used by', dependents, 'consumer')}
          </>
        ))}

        {collapsible('exports', 'Exports', (
          module.exports.length === 0
            ? <p className="module-arch__no-exports">No exports found</p>
            : <>
              {exportGroup('To parent', exposed.parent)}
              {exportGroup('To descendants', exposed.descendants)}
              {exportGroup('Not exposed', exposed.none)}
            </>
        ), module.exports.length)}

        {coverage.length > 0 && collapsible('coverage', 'Coverage notes', (
          <ul className="module-arch__coverage-list">
            {coverage.map(item => (
              <li key={item.limit.id} className="module-arch__coverage-item">
                <strong>{item.limit.code}</strong>: {item.limit.message}
                <span>{`${item.limit.location.file}:${item.limit.location.line}:${item.limit.location.column}`}</span>
              </li>
            ))}
          </ul>
        ), coverage.length)}
      </div>
    );
  }

  function reveal(id: string): void {
    for (const ancestor of ancestorsOf(index, id)) if (collapsedModuleIds.has(ancestor)) onToggleCollapsed(ancestor);
    onSelectModule(id);
  }

  function moduleLink(id: string): React.ReactNode {
    const module = index.modulesById.get(id);
    if (!module) return <span>{id}</span>;
    return <button type="button" className="module-tree__link" onClick={() => reveal(id)}>{module.name}</button>;
  }

  function edgeList(title: string, list: readonly ExplorerEdge[], end: 'consumer' | 'provider'): React.ReactNode {
    if (list.length === 0) return null;
    return (
      <div className="module-tree__group">
        <div className="module-tree__group-title">{title}</div>
        <ul className="module-tree__list">
          {list.map(edge => (
            <li key={edge.id} className="module-tree__list-item">
              {moduleLink(edge[end])}
              <span className="module-arch__dependency-badge module-arch__dependency-badge--methods">
                {edge.accessCount} {edge.accessCount === 1 ? 'access' : 'accesses'}
              </span>
              {edge.status !== 'allowed' && (
                <span className={`module-arch__dependency-badge module-arch__dependency-badge--${edge.status}`}>
                  {edge.status}
                </span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function exportGroup(title: string, list: readonly ExplorerExport[]): React.ReactNode {
    if (list.length === 0) return null;
    return (
      <div className="module-tree__group">
        <div className="module-tree__group-title">{title} ({list.length})</div>
        <ul className="module-tree__list">
          {list.map(item => (
            <li key={item.id} className="module-tree__list-item">
              <code>{item.name}</code>
              {item.forwarded && <span className="module-tree__chip">forwarded</span>}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  function collapsible(key: string, title: string, body: React.ReactNode, count?: number): React.ReactElement {
    const expanded = !collapsedSections.has(key);
    return (
      <div className="module-arch__collapsible">
        <button type="button" className="module-arch__collapsible-header" aria-expanded={expanded}
          onClick={() => setCollapsedSections(previous => {
            const next = new Set(previous);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
          })}>
          <span className={`module-arch__collapsible-arrow${expanded ? ' module-arch__collapsible-arrow--expanded' : ''}`}>&#9654;</span>
          <span className="module-arch__collapsible-title">{title}</span>
          {count != null && <span className="module-arch__collapsible-badge">{count}</span>}
        </button>
        {expanded && <div className="module-arch__collapsible-body">{body}</div>}
      </div>
    );
  }
}

export default ModuleTreeView;

/** Owned exports by the destinations this module exposes them to. */
function exportGroups(module: ExplorerModule): {
  readonly parent: ExplorerExport[]; readonly descendants: ExplorerExport[]; readonly none: ExplorerExport[];
} {
  const parent: ExplorerExport[] = [];
  const descendants: ExplorerExport[] = [];
  const none: ExplorerExport[] = [];
  for (const item of module.exports) {
    const destinations = new Set(item.exposures.filter(exposure => exposure.module === module.id)
      .flatMap(exposure => exposure.destinations));
    if (destinations.has('parent')) parent.push(item);
    if (destinations.has('descendants')) descendants.push(item);
    if (destinations.size === 0) none.push(item);
  }
  return { parent, descendants, none };
}

function metric(value: React.ReactNode, label: string): React.ReactElement {
  return (
    <div className="module-arch__metric">
      <span className="module-arch__metric-value">{value}</span>
      <span className="module-arch__metric-label">{label}</span>
    </div>
  );
}

