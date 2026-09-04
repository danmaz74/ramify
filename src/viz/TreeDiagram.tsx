/**
 * React SVG view of a {@link TreeDiagramLayout}: a classic top-down tree, and
 * - with a focus - the rows that spell out one module's working context.
 *
 * `TreeDiagramSvg` is the pure `<svg>`; the static emitter renders it with
 * `standalone`. `TreeDiagram` wraps it for a page: natural size, centered,
 * shrinking only when the column is narrower than the drawing.
 */

import type { CSSProperties, ReactElement } from 'react';

import { ROOT_CLASS, diagramStylesheet, fillClass, type Theme } from './theme.js';
import {
  TREE_LAYOUT as L,
  layoutTreeDiagram,
  type TreeDiagramDefinition,
  type TreeDiagramLayout,
} from './tree-diagram.js';
import { classes, renderTreeEdge, renderTreeNode } from './tree-render.js';

export interface TreeDiagramProps {
  readonly definition: TreeDiagramDefinition;
  /** Precomputed layout; derived from the definition when omitted. */
  readonly layout?: TreeDiagramLayout;
  /** Pin the palette; omit to follow the reader's setting. */
  readonly theme?: Theme;
  readonly idPrefix?: string;
  readonly className?: string;
  /** Emit an `xmlns` so the markup is a valid file on its own. */
  readonly standalone?: boolean;
  /** Fill the container's width, keeping the aspect ratio. */
  readonly responsive?: boolean;
}

export function TreeDiagramSvg(props: TreeDiagramProps): ReactElement {
  const {
    definition,
    layout = layoutTreeDiagram(definition),
    theme,
    idPrefix = 'rmf-tree',
    className,
    standalone = false,
    responsive = false,
  } = props;
  const { viewBox } = layout;
  const style: CSSProperties | undefined = responsive
    ? { display: 'block', width: '100%', height: 'auto' }
    : undefined;

  return (
    <svg
      {...(standalone ? { xmlns: 'http://www.w3.org/2000/svg' } : {})}
      className={classes(ROOT_CLASS, className)}
      {...(theme === undefined ? {} : { 'data-theme': theme })}
      data-kind="tree-diagram"
      id={`${idPrefix}-${definition.id}`}
      width={viewBox.width}
      height={viewBox.height}
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      role="img"
      aria-label={definition.ariaLabel}
      {...(style === undefined ? {} : { style })}
    >
      <style dangerouslySetInnerHTML={{ __html: diagramStylesheet() }} />
      <rect
        data-kind="background"
        className={fillClass('bg')}
        x={viewBox.x}
        y={viewBox.y}
        width={viewBox.width}
        height={viewBox.height}
      />
      {layout.edges.map((edge) => renderTreeEdge(edge))}
      {layout.nodes.map((node) => renderTreeNode(node, idPrefix))}
      {layout.notes.map((note) => (
        <text
          key={note.text}
          data-kind="note"
          x={L.margin}
          y={note.y}
          fontSize={L.noteFontSize}
          className={fillClass('muted')}
        >
          {note.text}
        </text>
      ))}
    </svg>
  );
}

export function TreeDiagram(props: TreeDiagramProps): ReactElement {
  const layout = props.layout ?? layoutTreeDiagram(props.definition);
  const rootStyle: CSSProperties = {
    width: '100%',
    maxWidth: layout.viewBox.width,
    marginInline: 'auto',
  };
  return (
    <div className="rmf-root" style={rootStyle} data-kind="tree-diagram-root">
      <TreeDiagramSvg {...props} layout={layout} responsive />
    </div>
  );
}
