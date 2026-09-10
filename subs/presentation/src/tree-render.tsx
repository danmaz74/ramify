/**
 * The drawing vocabulary shared by the tree and focus diagrams: a module box
 * with its rows, an elbow connector, and the rows themselves.
 *
 * Every color is a palette class from `./theme.js`, so one stylesheet serves
 * both diagrams and both themes.
 */

import type { ReactElement } from 'react';

import { fillClass, strokeClass } from './theme.js';
import {
  TREE_LAYOUT as L,
  rowHeight,
  type ChainHop,
  type TreeConnectorLayout,
  type TreeNodeLayout,
  type TreeRow,
} from './tree-diagram.js';

export const MONO = 'ui-monospace,SFMono-Regular,Menlo,Consolas,monospace';

export function classes(...values: readonly (string | false | undefined)[]): string | undefined {
  const kept = values.filter((value): value is string => typeof value === 'string' && value !== '');
  return kept.length === 0 ? undefined : kept.join(' ');
}

export function renderTreeEdge(edge: TreeConnectorLayout): ReactElement {
  return (
    <path
      key={`${edge.parent}-${edge.child}`}
      data-kind="edge"
      data-parent={edge.parent}
      data-child={edge.child}
      d={edge.d}
      fill="none"
      strokeWidth={edge.role === 'focus' ? 1.6 : edge.role === 'source' ? 1.4 : 1.2}
      {...(edge.role === 'source' ? { strokeDasharray: '4 3' } : {})}
      className={classes(
        strokeClass(edge.role === 'focus' || edge.role === 'source' ? 'traced1' : 'edge'),
        edge.role === 'outside' && 'rmf-dim-soft',
      )}
    />
  );
}

export function renderTreeNode(entry: TreeNodeLayout, idPrefix: string): ReactElement {
  const { x, y, width, height } = entry.box;
  const accent = entry.role === 'focus' || entry.role === 'child' || entry.role === 'source';
  const strokeWidth = entry.role === 'focus' ? 2 : entry.role === 'child' ? 1.5 : 1;
  const ruled = entry.rows.length > 0;

  return (
    <g
      key={entry.id}
      id={`${idPrefix}-${entry.id}`}
      data-kind="module"
      data-module={entry.id}
      data-role={entry.role}
      className={entry.role === 'outside' ? 'rmf-dim-soft' : undefined}
    >
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={L.cornerRadius}
        strokeWidth={strokeWidth}
        {...(entry.role === 'source' ? { strokeDasharray: '4 3' } : {})}
        className={classes(fillClass('panel'), strokeClass(accent ? 'traced1' : 'boxStroke'))}
      />
      <text
        x={x + L.padding}
        y={y + L.header / 2}
        fontSize={L.nameFontSize}
        fontWeight={entry.role === 'focus' ? 700 : 600}
        className={fillClass('text')}
      >
        {entry.id}
      </text>
      {ruled ? (
        <line
          x1={x}
          x2={x + width}
          y1={y + L.header}
          y2={y + L.header}
          className={strokeClass('separator')}
        />
      ) : null}
      {renderTreeRows(entry.rows, x, y + L.header)}
    </g>
  );
}

/** Rows stacked from `top`, each vertically centered in its own height. */
export function renderTreeRows(rows: readonly TreeRow[], x: number, top: number): ReactElement[] {
  const out: ReactElement[] = [];
  let cy = top;
  for (const [index, row] of rows.entries()) {
    const height = rowHeight(row);
    out.push(renderTreeRow(row, index, x, cy + height / 2));
    cy += height;
  }
  return out;
}

/** `logging ▲ platform ▲ shop ▼`: modules muted, the channel glyphs in the accent. */
function renderChain(chain: readonly ChainHop[], x: number): ReactElement[] {
  return chain.flatMap((hop, index) => [
    <tspan
      key={`m${index}`}
      {...(index === 0 ? { x } : {})}
      {...(index === 0 ? {} : { dx: 4 })}
      fontSize={L.titleFontSize}
      className={fillClass('muted')}
    >
      {hop.module}
    </tspan>,
    <tspan key={`g${index}`} dx={3} fontSize={L.titleFontSize} className={fillClass('traced1')}>
      {hop.channel === 'toParent' ? '▲' : '▼'}
    </tspan>,
  ]);
}

export function renderTreeRow(row: TreeRow, index: number, x: number, y: number): ReactElement {
  const left = x + L.padding;
  switch (row.kind) {
    case 'title':
      return (
        <text
          key={index}
          data-kind="row-title"
          x={left}
          y={y}
          fontSize={L.titleFontSize}
          className={fillClass('muted')}
        >
          {row.text}
        </text>
      );
    case 'group':
      return (
        <text
          key={index}
          data-kind="row-group"
          x={left}
          y={y}
          fontSize={L.rowFontSize}
          fontWeight={600}
          className={fillClass('neutral')}
        >
          {row.text}
        </text>
      );
    case 'exposed':
      return (
        <text key={index} data-kind="row-exposed" x={left} y={y} fontSize={L.rowFontSize}>
          <tspan className={fillClass('traced1')}>{row.channel === 'toParent' ? '▲' : '▼'}</tspan>
          <tspan className={fillClass('text')} dx={5}>
            {row.symbol}
          </tspan>
        </text>
      );
    case 'received':
      // The route follows the name at a fixed gap: an over-estimated advance
      // width keeps the column straight for names of any realistic length.
      return (
        <text key={index} data-kind="row-received" x={left} y={y} fontSize={L.rowFontSize}>
          <tspan className={fillClass('text')}>{row.symbol}</tspan>
          {renderChain(row.chain, left + row.symbol.length * L.rowCharWidth + 8)}
        </text>
      );
    case 'file':
      return (
        <text
          key={index}
          data-kind="row-file"
          x={left}
          y={y}
          fontSize={L.fileFontSize}
          fontFamily={MONO}
          className={fillClass('text')}
        >
          {row.text}
        </text>
      );
  }
}
