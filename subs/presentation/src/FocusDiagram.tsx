/**
 * React SVG view of a {@link FocusDiagramLayout}: signpost, three cards, and
 * the whole tree as a small map with the focus marked.
 */

import type { CSSProperties, ReactElement } from 'react';

import {
  FOCUS_LAYOUT as F,
  layoutFocusDiagram,
  mapBoxToDiagram,
  type FocusCardLayout,
  type FocusDiagramDefinition,
  type FocusDiagramLayout,
} from './focus-diagram.js';
import { ROOT_CLASS, diagramStylesheet, fillClass, strokeClass, type Theme } from './theme.js';
import { TREE_LAYOUT as T } from './tree-diagram.js';
import { classes, renderTreeEdge, renderTreeNode, renderTreeRows } from './tree-render.js';

export interface FocusDiagramProps {
  readonly definition: FocusDiagramDefinition;
  readonly layout?: FocusDiagramLayout;
  readonly theme?: Theme;
  readonly idPrefix?: string;
  readonly className?: string;
  readonly standalone?: boolean;
  readonly responsive?: boolean;
}

export function FocusDiagramSvg(props: FocusDiagramProps): ReactElement {
  const {
    definition,
    layout = layoutFocusDiagram(definition),
    theme,
    idPrefix = 'rmf-focus',
    className,
    standalone = false,
    responsive = false,
  } = props;
  const { viewBox, map } = layout;
  const style: CSSProperties | undefined = responsive
    ? { display: 'block', width: '100%', height: 'auto' }
    : undefined;
  const marker = mapBoxToDiagram(map, map.focusNode.box);

  return (
    <svg
      {...(standalone ? { xmlns: 'http://www.w3.org/2000/svg' } : {})}
      className={classes(ROOT_CLASS, className)}
      {...(theme === undefined ? {} : { 'data-theme': theme })}
      data-kind="focus-diagram"
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

      <g data-kind="signpost">
        <text x={F.margin} y={F.margin + 8} fontSize={F.breadcrumbFontSize}>
          <tspan className={fillClass('text')}>{layout.kicker}</tspan>
          <tspan dx={6} className={fillClass('muted')}>
            {`· ${layout.breadcrumb}`}
          </tspan>
        </text>
        <text x={F.margin} y={F.margin + 34} fontSize={F.titleFontSize} className={fillClass('text')}>
          <tspan fontWeight={400}>{layout.titlePrefix}</tspan>
          <tspan fontWeight={700} dx={6}>
            {layout.title}
          </tspan>
        </text>
      </g>

      {layout.cards.map((card) => renderCard(card, idPrefix))}

      <g data-kind="map">
        <text
          x={map.x}
          y={map.captionY}
          fontSize={F.mapCaptionFontSize}
          className={fillClass('muted')}
        >
          {map.caption}
        </text>
        <g transform={`translate(${map.x} ${map.y}) scale(${map.scale})`}>
          {map.tree.edges.map((edge) => renderTreeEdge(edge))}
          {map.tree.nodes.map((node) => renderTreeNode(node, `${idPrefix}-map`))}
        </g>
        {/* The focus, filled in: the one box on the map that is "here". */}
        <g data-kind="you-are-here">
          <rect
            x={marker.x}
            y={marker.y}
            width={marker.width}
            height={marker.height}
            rx={T.cornerRadius * map.scale}
            className={fillClass('traced1')}
          />
          <text
            x={marker.x + marker.width / 2}
            y={marker.y + marker.height / 2}
            fontSize={T.nameFontSize * map.scale}
            fontWeight={700}
            textAnchor="middle"
            className={fillClass('bg')}
          >
            {map.focusNode.id}
          </text>
        </g>
      </g>

      {layout.notes.map((note) => (
        <text
          key={note.text}
          data-kind="note"
          x={F.margin}
          y={note.y}
          fontSize={T.noteFontSize}
          className={fillClass('muted')}
        >
          {note.text}
        </text>
      ))}
    </svg>
  );
}

function renderCard(card: FocusCardLayout, idPrefix: string): ReactElement {
  const { x, y, width, height } = card.box;
  const rowsTop = y + F.cardTitleHeight + F.cardSubtitleHeight;
  return (
    <g key={card.id} id={`${idPrefix}-card-${card.id}`} data-kind="card" data-card={card.id}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={T.cornerRadius}
        strokeWidth={card.id === 'module' ? 2 : 1}
        className={classes(
          fillClass('panel'),
          strokeClass(card.id === 'module' ? 'traced1' : 'boxStroke'),
        )}
      />
      <text
        x={x + F.cardPadding}
        y={y + F.cardTitleHeight / 2 + 1}
        fontSize={F.cardTitleFontSize}
        fontWeight={700}
        className={fillClass('text')}
      >
        {card.title}
      </text>
      <text
        x={x + F.cardPadding}
        y={y + F.cardTitleHeight + F.cardSubtitleHeight / 2}
        fontSize={F.cardSubtitleFontSize}
        className={fillClass('muted')}
      >
        {card.subtitle}
      </text>
      <line
        x1={x}
        x2={x + width}
        y1={rowsTop}
        y2={rowsTop}
        className={strokeClass('separator')}
      />
      {card.columns.map((column, index) => (
        <g key={index} data-kind="card-column">
          {renderTreeRows(column.rows, column.x, rowsTop + 2)}
        </g>
      ))}
    </g>
  );
}

export function FocusDiagram(props: FocusDiagramProps): ReactElement {
  const layout = props.layout ?? layoutFocusDiagram(props.definition);
  const rootStyle: CSSProperties = {
    width: '100%',
    maxWidth: layout.viewBox.width,
    marginInline: 'auto',
  };
  return (
    <div className="rmf-root" style={rootStyle} data-kind="focus-diagram-root">
      <FocusDiagramSvg {...props} layout={layout} responsive />
    </div>
  );
}
