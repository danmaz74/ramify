import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ModuleTreeView } from '../../presentation/subs/project-view/src/ModuleTreeView.js';
import { ancestorsOf, collapsibleAtDepth, indexModuleTree, type ModuleTreeIndex } from '../../presentation/subs/project-view/src/module-tree.js';
import { usePublishedProjectView, type ExplorerClient } from './published-project-view.js';

/** Trees larger than this start collapsed below depth 2. */
export const EXPANDED_TREE_LIMIT = 60;

export interface ModuleTreePageProps {
  readonly client: ExplorerClient;
  readonly pollIntervalMs?: number;
  /** Opens a module in the import explorer; defaults to a new browser tab. */
  readonly openModule?: (id: string) => void;
  /** A module to select, reveal and centre in the first loaded model (`?module=`). */
  readonly initialModuleId?: string | null;
}

export function ModuleTreePage({ client, pollIntervalMs = 3000, openModule = openInImportExplorer,
  initialModuleId = null }: ModuleTreePageProps): React.ReactElement {
  const { data, isLoading, error, unavailableReason, isStale, bindingNotice, refresh } =
    usePublishedProjectView(client, { pollIntervalMs });
  const [selected, setSelected] = useState<string | null>(initialModuleId);
  const [focusNotice, setFocusNotice] = useState<string | null>(null);
  // null until the first model arrives; the initial rule then applies in the same render.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string> | null>(null);
  const index = useMemo(() => indexModuleTree(data?.modules ?? [], data?.rootModuleId), [data]);

  // Selection and collapsed IDs survive a refresh only while their modules still exist.
  const selectedModuleId = selected !== null && index.modulesById.has(selected) ? selected : null;
  const collapsedModuleIds = useMemo<ReadonlySet<string>>(() => {
    if (collapsed === null) {
      const initial = data && data.modules.length > EXPANDED_TREE_LIMIT ? collapsibleAtDepth(index, 2) : new Set<string>();
      if (initialModuleId !== null) for (const ancestor of ancestorsOf(index, initialModuleId)) initial.delete(ancestor);
      return initial;
    }
    return keptCollapsible(collapsed, index);
  }, [collapsed, data, index, initialModuleId]);

  useEffect(() => {
    if (!data) return;
    if (collapsed === null && initialModuleId !== null && !index.modulesById.has(initialModuleId)) {
      setFocusNotice(`Module ${initialModuleId} is not in this revision`);
    }
    // Updater functions: a click can land between this render's commit and this effect, so the
    // stored value may be newer than the one this render saw. Only the starting set replaces null.
    if (selected !== selectedModuleId) {
      setSelected(previous => previous !== null && index.modulesById.has(previous) ? previous : null);
    }
    if (collapsed !== collapsedModuleIds) {
      setCollapsed(previous => previous === null ? collapsedModuleIds : keptCollapsible(previous, index));
    }
  }, [collapsed, collapsedModuleIds, data, index, initialModuleId, selected, selectedModuleId]);

  const toggleCollapsed = useCallback((id: string) => setCollapsed(previous => {
    const next = new Set(previous ?? collapsedModuleIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), [collapsedModuleIds]);

  return <ModuleTreeView
    data={data} isLoading={isLoading} error={error} unavailableReason={unavailableReason}
    isStale={isStale} notice={joinNotices(bindingNotice, focusNotice)}
    selectedModuleId={selectedModuleId} collapsedModuleIds={collapsedModuleIds}
    onSelectModule={setSelected}
    onToggleCollapsed={toggleCollapsed}
    onExpandAll={() => setCollapsed(new Set())}
    onCollapseToDepth={depth => setCollapsed(collapsibleAtDepth(index, depth))}
    onOpenModule={openModule}
    onRefresh={refresh}
    centerModuleId={initialModuleId !== null && index.modulesById.has(initialModuleId) ? initialModuleId : null} />;
}

/** The import explorer URL focused on one module. */
export function importExplorerUrl(id: string): string {
  return `/analysis/latest?module=${encodeURIComponent(id)}`;
}

function openInImportExplorer(id: string): void {
  window.open(importExplorerUrl(id), '_blank', 'noopener');
}

/** The collapsed IDs whose modules still have children, the same set when none was dropped. */
function keptCollapsible(collapsed: ReadonlySet<string>, index: ModuleTreeIndex): ReadonlySet<string> {
  const kept = [...collapsed].filter(id => (index.children.get(id)?.length ?? 0) > 0);
  return kept.length === collapsed.size ? collapsed : new Set(kept);
}

function joinNotices(...notices: readonly (string | null)[]): string | null {
  const present = notices.filter((notice): notice is string => notice !== null);
  return present.length ? present.join(' · ') : null;
}
