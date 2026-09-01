/**
 * A ramify diagram, as React SVG.
 *
 * This file renders geometry it did not compute. Every coordinate comes from
 * `./layout.js`, which validated itself against the model evaluator before
 * handing anything over; the view's only jobs are painting and selection.
 *
 * The component knows no universe of its own: it draws whichever
 * `DiagramDefinition` it is given (the core-model shop by default), and every
 * word, hue and layer in the output comes from that definition's layout.
 *
 * Layer structure (§3.7): one `<g>` per traced symbol, one for the neutral
 * propagation bundle, one for chords, one for the tree, one for the nodes, one
 * for the legend. Selecting a symbol *dims* every other layer rather than
 * hiding it, so the tree never reflows and the reader keeps their place.
 *
 * The component assumes nothing about its host: no Docusaurus, no global
 * stylesheet, no CSS framework. Colors travel with the markup as custom
 * properties (see `./theme.js`), and the light values are the defaults, so the
 * emitted `model-core.svg` also renders standalone.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import {
  NEUTRAL_LAYER,
  type ColorKey,
  type DiagramDefinition,
  type LegendEntry,
  type TracedSymbol,
} from './diagram-definition.js';
import { shopDiagram } from './diagrams/shop.js';
import { LAYOUT, rowLabelDx, textWidth } from './geometry.js';
import type { ChordLayout } from './layout-chords.js';
import type { DecisionDot, LaneChip, LanePath, TreeEdgeLayout } from './layout-lanes.js';
import {
  TAG_GLYPHS,
  type Compartment,
  type DrawnContext,
  type NodeLayout,
  type SymbolRow,
} from './layout-nodes.js';
import type { LegendGroupLayout } from './layout-legend.js';
import { diagramLayout, type DiagramLayout, type HeaderLayout } from './layout.js';
import type { SymbolName } from './model-access.js';
import { ROOT_CLASS, diagramStylesheet, fillClass, strokeClass, type Theme } from './theme.js';
import {
  CENTER,
  DRAG_THRESHOLD,
  MAX_SCALE,
  MIN_SCALE,
  isReset,
  panBy,
  scaleOf,
  wheelFactor,
  zoomAt,
  type ViewRect,
} from './viewport.js';

export interface ModelDiagramProps {
  /**
   * Which diagram to draw. Defaults to the core-model shop; its layout is
   * built and validated once, on first use.
   */
  readonly definition?: DiagramDefinition;
  /** A prebuilt layout, overriding `definition`. */
  readonly layout?: DiagramLayout;
  /** Pin the palette. Omitted follows the reader's `prefers-color-scheme`. */
  readonly theme?: Theme;
  /** Controlled selection. Omit to let the component own it. */
  readonly selectedSymbol?: SymbolName | null;
  readonly defaultSelectedSymbol?: SymbolName | null;
  readonly onSelectSymbol?: (symbol: SymbolName | null) => void;
  /** Panel B. On by default; the walkthrough turns it off to isolate Panel A. */
  readonly showChords?: boolean;
  /** Prefix for every element id, so two diagrams can share a page. */
  readonly idPrefix?: string;
  readonly className?: string;
  /** Adds `xmlns`, for markup written to a `.svg` file. */
  readonly standalone?: boolean;

  // --- viewport, used by the interactive wrapper; the static export sets none.

  /** The window onto the diagram. Omitted shows the whole thing. */
  readonly view?: ViewRect;
  /** Scale the SVG to its container's width instead of its intrinsic size. */
  readonly responsive?: boolean;
  /** Floor for responsive scaling; below it the container scrolls (§3.9). */
  readonly minWidth?: number;
  readonly svgRef?: Ref<SVGSVGElement>;
  readonly cursor?: string;
  readonly onPointerDown?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerMove?: (event: ReactPointerEvent<SVGSVGElement>) => void;
  readonly onPointerUp?: (event: ReactPointerEvent<SVGSVGElement>) => void;

  // --- the traced-contract tour, driven by the interactive wrapper.

  /** Whether the tour is running; drawn on the play/stop toggle. */
  readonly playing?: boolean;
  /**
   * Renders the play/stop toggle on the selectable legend group's caption
   * row. The static export passes nothing and stays a picture.
   */
  readonly onTogglePlay?: () => void;
}

export interface ModelDiagramInteractiveProps extends ModelDiagramProps {
  /** Pan and zoom, with an overlaid control cluster. On by default. */
  readonly interactive?: boolean;
  /**
   * Cap on how wide the diagram may grow. Defaults to the diagram's own
   * width: it takes whatever room its container offers, but never magnifies
   * itself past 1:1, which would only make the figure taller without showing
   * anything more. Zoom is for magnification.
   */
  readonly maxWidth?: number | string;
  /**
   * Start with the traced-contract tour running: each traced symbol is
   * selected in turn, forever, until the reader takes over. On by default
   * for uncontrolled selection; a controlled component never plays.
   */
  readonly autoPlay?: boolean;
}

/** §3.9: legible down to ~820 CSS px; narrower than that, the container scrolls. */
const DEFAULT_MIN_WIDTH = 820;

/**
 * How long the tour holds each traced contract: five ~1s animation cycles -
 * enough to follow the longest chain twice, not so long the one-hop contracts
 * drag. Uniform on purpose: a steady rhythm reads as a guided tour.
 */
export const TOUR_DWELL_MS = 5000;

/** Marker colors are defined once per palette slot, not once per diagram. */
const CHEVRON_COLORS: readonly ColorKey[] = ['neutral', 'traced1', 'traced2', 'traced3', 'traced4'];

/** Join class names, collapsing "nothing to say" to an omitted attribute. */
function classes(...values: readonly (string | false | undefined)[]): string | undefined {
  const kept = values.filter((value): value is string => typeof value === 'string' && value.length > 0);
  return kept.length === 0 ? undefined : kept.join(' ');
}

/**
 * The diagram as a live figure: fills its container, pans by dragging, zooms
 * about the cursor, and selects a symbol on click.
 *
 * Two decisions worth knowing about:
 *
 * - **The wheel zooms whenever the pointer is over the diagram.** Requiring a
 *   modifier kept the page scrolling naturally past the figure, but nobody
 *   found it: a reader who has aimed at a diagram this dense means the
 *   diagram. Scrolling is therefore trapped over the figure, deliberately, and
 *   the page still scrolls everywhere else. Ctrl/Cmd + wheel does the same
 *   thing, so a trackpad pinch works with no extra code.
 * - **A click is a click below 5 px of travel.** Panning and selecting share
 *   the same pointer, so the drag threshold is what keeps "click a symbol"
 *   working: past it the gesture pans and the trailing click is swallowed.
 *
 * §3.9 still holds underneath: the SVG scales to whatever width its container
 * offers, up to its own natural size and never below `minWidth` - past which
 * the container scrolls rather than shrinking the picture below legibility.
 */
export function ModelDiagram(props: ModelDiagramInteractiveProps): ReactElement {
  const {
    defaultSelectedSymbol = null,
    selectedSymbol,
    onSelectSymbol,
    interactive = true,
    maxWidth,
    minWidth = DEFAULT_MIN_WIDTH,
    autoPlay,
    ...rest
  } = props;

  const layout = rest.layout ?? diagramLayout(rest.definition ?? shopDiagram);
  const base = layout.viewBox;

  const [internal, setInternal] = useState<SymbolName | null>(defaultSelectedSymbol);
  const isControlled = selectedSymbol !== undefined;
  const current = isControlled ? selectedSymbol : internal;

  const tourSymbols = layout.definition.tracedSymbols.map((entry) => entry.symbol);
  const [playing, setPlaying] = useState(
    (autoPlay ?? !isControlled) && interactive && tourSymbols.length > 0,
  );

  const [view, setView] = useState<ViewRect>(base);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ x: number; y: number; travel: number; captured: boolean } | null>(null);
  /** Set when a drag ends past the threshold, so its trailing click is ignored. */
  const swallowClickRef = useRef(false);
  const viewRef = useRef(view);
  viewRef.current = view;

  useEffect(() => {
    setView(base);
  }, [base]);

  const select = useCallback(
    (next: SymbolName | null) => {
      if (!isControlled) {
        setInternal(next);
      }
      onSelectSymbol?.(next);
    },
    [isControlled, onSelectSymbol],
  );

  /** The reader taking the wheel - any manual selection - stops the tour. */
  const userSelect = useCallback(
    (next: SymbolName | null) => {
      setPlaying(false);
      select(next);
    },
    [select],
  );

  const currentRef = useRef(current);
  currentRef.current = current;
  const selectRef = useRef(select);
  selectRef.current = select;

  // The tour: hold each traced contract for TOUR_DWELL_MS, forever. It rides
  // the ordinary selection state, so what it shows is exactly what a hand
  // selection shows. Play begins at the current selection when that is a
  // traced contract (restarting its dwell), else at the first.
  useEffect(() => {
    const symbols = layout.definition.tracedSymbols.map((entry) => entry.symbol);
    if (!playing || symbols.length === 0) {
      return undefined;
    }
    // Each lap ends on a none-selected beat: every layer back at full
    // strength, the whole picture for one dwell, then round again.
    const stops: (SymbolName | null)[] = [...symbols, null];
    // The tour keeps its own cursor: rendered state lags inside a batch, and
    // any manual selection stops the tour anyway, so the two cannot diverge.
    let index = symbols.indexOf(currentRef.current ?? ('' as SymbolName));
    if (index === -1) {
      index = 0;
      selectRef.current(symbols[0] as SymbolName);
    }
    const timer = setInterval(() => {
      index = (index + 1) % stops.length;
      selectRef.current(stops[index] as SymbolName | null);
    }, TOUR_DWELL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [playing, layout]);

  /**
   * The rendered size of the SVG, for converting pointer pixels into diagram
   * units. Falls back to the diagram's own size where layout has not happened
   * (jsdom, or an element that is still display:none), which makes the
   * conversion a no-op rather than a division by zero.
   */
  const pixelSize = useCallback((): { width: number; height: number; left: number; top: number } => {
    const rect = svgRef.current?.getBoundingClientRect();
    return {
      width: rect !== undefined && rect.width > 0 ? rect.width : base.width,
      height: rect !== undefined && rect.height > 0 ? rect.height : base.height,
      left: rect?.left ?? 0,
      top: rect?.top ?? 0,
    };
  }, [base]);

  const zoomAbout = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const box = pixelSize();
      setView((previous) =>
        zoomAt(base, previous, { u: (clientX - box.left) / box.width, v: (clientY - box.top) / box.height }, factor),
      );
    },
    [base, pixelSize],
  );

  const zoomCentre = useCallback(
    (factor: number) => {
      setView((previous) => zoomAt(base, previous, CENTER, factor));
    },
    [base],
  );

  // Two native listeners, both for things React's synthetic system cannot do.
  useEffect(() => {
    const element = svgRef.current;
    if (element === null || !interactive) {
      return undefined;
    }

    // The wheel zooms whenever the pointer is over the diagram, modifier or
    // not: requiring one made zooming undiscoverable, and a reader who has
    // aimed at the figure means the figure. Ctrl/Cmd + wheel - a trackpad
    // pinch, among other things - does the same, so pinch works for free.
    //
    // React registers `wheel` passively, so this listener has to be a native
    // one: only a non-passive listener may cancel the page scroll, and the
    // browser's own Ctrl-wheel page zoom.
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      zoomAbout(event.clientX, event.clientY, wheelFactor(event.deltaY, event.deltaMode));
    };

    // The click a drag leaves behind must not select anything. Swallowing it
    // here - in the capture phase, at the root of the diagram - stops it before
    // React's delegated handlers ever see it, and clears the flag whatever the
    // click landed on. A flag checked inside the select handler would instead
    // stay armed when a drag ends over empty canvas, and would then eat the
    // next genuine click.
    const onClickCapture = (event: MouseEvent): void => {
      if (!swallowClickRef.current) {
        return;
      }
      swallowClickRef.current = false;
      event.stopPropagation();
      event.preventDefault();
    };

    element.addEventListener('wheel', onWheel, { passive: false });
    element.addEventListener('click', onClickCapture, true);
    return () => {
      element.removeEventListener('wheel', onWheel);
      element.removeEventListener('click', onClickCapture, true);
    };
  }, [interactive, zoomAbout]);

  const onPointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    if (event.button !== 0) {
      return;
    }
    swallowClickRef.current = false;
    // Deliberately *not* capturing the pointer yet. Capturing on pointerdown
    // retargets the whole gesture - including the `click` - to the capturing
    // element, so every click would land on the <svg> and nothing inside it
    // would ever be selectable. Capture is taken below, once the gesture has
    // proved itself a drag.
    dragRef.current = { x: event.clientX, y: event.clientY, travel: 0, captured: false };
    setDragging(true);
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>): void => {
      const drag = dragRef.current;
      if (drag === null) {
        return;
      }
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      drag.travel += Math.abs(dx) + Math.abs(dy);
      if (drag.travel < DRAG_THRESHOLD) {
        return;
      }
      if (!drag.captured) {
        // Now it is a drag: take the pointer so it keeps panning outside the
        // figure, and accept that this gesture's click lands on the <svg>.
        drag.captured = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      const box = pixelSize();
      const currentView = viewRef.current;
      setView((previous) =>
        panBy(base, previous, (dx * currentView.width) / box.width, (dy * currentView.height) / box.height),
      );
    },
    [base, pixelSize],
  );

  const onPointerUp = useCallback((event: ReactPointerEvent<SVGSVGElement>): void => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    if (drag?.captured === true) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
    if (drag === null || drag.travel < DRAG_THRESHOLD) {
      return;
    }
    // Arm the swallow for exactly this gesture. The browser synthesizes the
    // click immediately after `pointerup`, so anything that arrives later is a
    // new gesture and must be allowed through - including a drag that ended
    // over empty canvas and produced no click at all.
    swallowClickRef.current = true;
    setTimeout(() => {
      swallowClickRef.current = false;
    }, 0);
  }, []);

  const scale = scaleOf(base, view);
  const rootStyle: CSSProperties = {
    position: 'relative',
    width: '100%',
    maxWidth: maxWidth ?? base.width,
    marginInline: 'auto',
    // A drag is also the browser's text-selection gesture, and the diagram's
    // labels are ordinary <text>. Panning wins: nothing in the live component
    // is selectable. The static export has no drag, so its text stays
    // selectable.
    userSelect: 'none',
    WebkitUserSelect: 'none',
  };

  return (
    <div className="rmf-root" style={rootStyle} data-kind="diagram-root">
      <div className="rmf-scroll" style={{ overflowX: 'auto', maxWidth: '100%' }} data-kind="diagram-scroll">
        <ModelDiagramSvg
          {...rest}
          selectedSymbol={current}
          onSelectSymbol={userSelect}
          view={view}
          responsive
          minWidth={minWidth}
          svgRef={svgRef}
          {...(interactive
            ? {
                cursor: dragging ? 'grabbing' : 'grab',
                onPointerDown,
                onPointerMove,
                onPointerUp,
              }
            : {})}
          {...(interactive && tourSymbols.length > 0
            ? { playing, onTogglePlay: () => setPlaying((was) => !was) }
            : {})}
        />
      </div>
      {interactive ? (
        <ViewportControls
          scale={scale}
          reset={isReset(base, view)}
          onZoomIn={() => zoomCentre(1.25)}
          onZoomOut={() => zoomCentre(1 / 1.25)}
          onReset={() => setView(base)}
        />
      ) : null}
    </div>
  );
}

const CONTROL_BUTTON: CSSProperties = {
  font: 'inherit',
  fontSize: 12,
  lineHeight: 1,
  padding: '4px 8px',
  minWidth: 26,
  borderRadius: 5,
  border: '1px solid currentColor',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  opacity: 0.75,
};

interface ViewportControlsProps {
  readonly scale: number;
  readonly reset: boolean;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onReset: () => void;
}

/** The zoom cluster, overlaid on the container rather than drawn into the SVG. */
function ViewportControls({ scale, reset, onZoomIn, onZoomOut, onReset }: ViewportControlsProps): ReactElement {
  return (
    <div
      data-kind="diagram-controls"
      style={{
        position: 'absolute',
        top: 6,
        right: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        userSelect: 'none',
      }}
    >
      <span data-kind="diagram-hint" style={{ fontSize: 11, opacity: 0.55 }}>
        drag to pan · scroll to zoom
      </span>
      <button
        type="button"
        data-kind="zoom-out"
        aria-label="Zoom out"
        title="Zoom out"
        style={CONTROL_BUTTON}
        disabled={scale <= MIN_SCALE}
        onClick={onZoomOut}
      >
        −
      </button>
      <button
        type="button"
        data-kind="zoom-in"
        aria-label="Zoom in"
        title="Zoom in"
        style={CONTROL_BUTTON}
        disabled={scale >= MAX_SCALE}
        onClick={onZoomIn}
      >
        +
      </button>
      <button
        type="button"
        data-kind="zoom-reset"
        aria-label="Reset the view"
        title="Reset the view"
        style={CONTROL_BUTTON}
        disabled={reset}
        onClick={onReset}
      >
        {`Reset${reset ? '' : ` (${String(Math.round(scale * 100))}%)`}`}
      </button>
    </div>
  );
}

/** The bare `<svg>`. This is what the static emitter renders. */
export function ModelDiagramSvg(props: ModelDiagramProps): ReactElement {
  const {
    definition = shopDiagram,
    layout = diagramLayout(definition),
    theme,
    selectedSymbol = null,
    onSelectSymbol,
    showChords = true,
    idPrefix = 'rmf',
    className,
    standalone = false,
    view,
    responsive = false,
    minWidth,
    svgRef,
    cursor,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    playing = false,
    onTogglePlay,
  } = props;

  const { viewBox } = layout;
  // The window actually shown. Zoom narrows it; the static export never sets it.
  const shown = view ?? viewBox;
  const select = (next: SymbolName | null): void => onSelectSymbol?.(next);
  const toggle = (symbol: SymbolName): void => select(selectedSymbol === symbol ? null : symbol);

  const layerClass = (layer: string): string | undefined => {
    if (selectedSymbol === null) {
      return undefined;
    }
    return layer === selectedSymbol ? undefined : 'rmf-dim';
  };

  const traced = layout.definition.tracedSymbols;
  const propagationLayers = [NEUTRAL_LAYER, ...traced.map((entry) => entry.symbol)];

  // Responsive: fill the container's width and take the height from the
  // viewBox's ratio, but never render narrower than legibility allows - below
  // that the wrapper scrolls, which is what §3.9 asks for. `touch-action:
  // pan-y` leaves vertical page scrolling to the page.
  const style: CSSProperties | undefined = responsive
    ? {
        display: 'block',
        width: '100%',
        height: 'auto',
        ...(minWidth === undefined ? {} : { minWidth }),
        touchAction: 'pan-y',
        ...(cursor === undefined ? {} : { cursor }),
      }
    : undefined;

  return (
    <svg
      {...(standalone ? { xmlns: 'http://www.w3.org/2000/svg' } : {})}
      className={classes(ROOT_CLASS, className)}
      {...(theme === undefined ? {} : { 'data-theme': theme })}
      data-kind="diagram"
      data-selected-symbol={selectedSymbol ?? ''}
      id={`${idPrefix}-diagram`}
      width={viewBox.width}
      height={viewBox.height}
      viewBox={`${shown.x} ${shown.y} ${shown.width} ${shown.height}`}
      role="img"
      aria-label={layout.definition.ariaLabel}
      {...(style === undefined ? {} : { style })}
      {...(svgRef === undefined ? {} : { ref: svgRef })}
      {...(onPointerDown === undefined ? {} : { onPointerDown })}
      {...(onPointerMove === undefined ? {} : { onPointerMove })}
      {...(onPointerUp === undefined ? {} : { onPointerUp, onPointerCancel: onPointerUp })}
    >
      <style dangerouslySetInnerHTML={{ __html: diagramStylesheet() }} />
      <defs>{renderMarkers(idPrefix)}</defs>

      {/*
        The ground, and the click target that clears a selection. Under zoom the
        visible window can be twice the diagram and offset by half of it, so the
        interactive ground is grown to cover every reachable view. The static
        export passes no `view` and keeps the exact diagram-sized rect.
      */}
      <rect
        id={`${idPrefix}-background`}
        data-kind="background"
        className={fillClass('bg')}
        x={view === undefined ? viewBox.x : viewBox.x - viewBox.width}
        y={view === undefined ? viewBox.y : viewBox.y - viewBox.height}
        width={view === undefined ? viewBox.width : viewBox.width * 3}
        height={view === undefined ? viewBox.height : viewBox.height * 3}
        onClick={() => select(null)}
      />

      {layout.title === undefined ? null : (
        <text
          id={`${idPrefix}-title`}
          data-kind="title"
          className={fillClass('text')}
          x={layout.title.at.x}
          y={layout.title.at.y}
          fontSize={LAYOUT.title.fontSize}
          fontWeight={600}
        >
          {layout.title.text}
        </text>
      )}

      {layout.header === undefined
        ? null
        : renderHeader(layout.header, idPrefix, traced, selectedSymbol, toggle, playing, onTogglePlay)}

      <Layer
        id={`${idPrefix}-layer-tree`}
        kind="tree"
        className={selectedSymbol === null ? undefined : 'rmf-dim-soft'}
      >
        {layout.propagation.edges.map((edge) => renderTreeEdge(edge))}
      </Layer>

      {showChords ? renderChordLayer(layout, idPrefix, selectedSymbol) : null}

      {propagationLayers.map((layer) => (
        <Layer
          key={layer}
          id={`${idPrefix}-layer-propagation-${layer}`}
          kind="propagation"
          symbol={layer}
          className={layerClass(layer)}
          onClick={layer === NEUTRAL_LAYER ? undefined : () => toggle(layer)}
        >
          {layout.propagation.lanes
            .filter((lane) => lane.layer === layer)
            .map((lane) => renderLane(lane, idPrefix, layer === selectedSymbol))}
          {layout.propagation.dots.filter((dot) => dot.layer === layer).map((dot) => renderDot(dot))}
          {layout.propagation.chips.filter((chip) => chip.layer === layer).map((chip) => renderChip(chip))}
        </Layer>
      ))}

      <Layer id={`${idPrefix}-layer-nodes`} kind="nodes">
        {layout.tree.nodes.map((node) => renderNode(node, selectedSymbol, toggle, view !== undefined))}
      </Layer>

      <Layer id={`${idPrefix}-layer-legend`} kind="legend">
        {layout.legend.footnote.map((line, index) => (
          <text
            key={line.text}
            id={`${idPrefix}-footnote-${String(index)}`}
            data-kind="footnote"
            className={fillClass('muted')}
            x={line.at.x}
            y={line.at.y}
            fontSize={LAYOUT.legend.noteFontSize}
          >
            {line.text}
          </text>
        ))}
        {layout.legend.groups.map((group) =>
          renderLegendGroup(group, idPrefix, traced, selectedSymbol, toggle),
        )}
        {layout.legend.notes.map((note, index) => (
          <text
            key={note.text}
            id={`${idPrefix}-legend-note-${String(index)}`}
            data-kind="legend-note"
            className={fillClass('muted')}
            x={note.at.x}
            y={note.at.y}
            fontSize={LAYOUT.legend.noteFontSize}
          >
            {note.text}
          </text>
        ))}
      </Layer>
    </svg>
  );
}

interface LayerProps {
  readonly id: string;
  readonly kind: string;
  readonly symbol?: string;
  readonly className?: string;
  readonly onClick?: () => void;
  readonly children: ReactNode;
}

function Layer({ id, kind, symbol, className, onClick, children }: LayerProps): ReactElement {
  return (
    <g
      id={id}
      data-kind="layer"
      data-layer={kind}
      {...(symbol === undefined ? {} : { 'data-symbol': symbol })}
      className={classes('rmf-layer', className, onClick === undefined ? undefined : 'rmf-clickable')}
      {...(onClick === undefined ? {} : { onClick })}
    >
      {children}
    </g>
  );
}

function renderMarkers(idPrefix: string): ReactElement[] {
  const markers: ReactElement[] = [];
  for (const key of CHEVRON_COLORS) {
    markers.push(
      <marker
        key={`arrow-${key}`}
        id={`${idPrefix}-arrow-${key.toLowerCase()}`}
        markerUnits="userSpaceOnUse"
        markerWidth={9}
        markerHeight={9}
        refX={7}
        refY={0}
        viewBox="0 -4 8 8"
        orient="auto"
      >
        <path className={fillClass(key)} d="M0,-3.4L7,0L0,3.4Z" />
      </marker>,
    );
    markers.push(
      <marker
        key={`chevron-${key}`}
        id={`${idPrefix}-chevron-${key.toLowerCase()}`}
        markerUnits="userSpaceOnUse"
        markerWidth={11}
        markerHeight={11}
        refX={5}
        refY={0}
        viewBox="-1 -5 11 10"
        orient="auto"
      >
        <path
          className={strokeClass(key)}
          fill="none"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M0,-4L4.6,0L0,4"
        />
      </marker>,
    );
  }
  return markers;
}

function renderTreeEdge(edge: TreeEdgeLayout): ReactElement {
  return (
    <path
      key={edge.id}
      id={edge.id}
      data-kind="tree-edge"
      data-parent={edge.parent}
      data-child={edge.child}
      className={strokeClass('edge')}
      fill="none"
      strokeWidth={LAYOUT.edge.strokeWidth}
      d={edge.d}
    />
  );
}

/**
 * One lane.
 *
 * `flowing` marches its dashes toward the head while its symbol is selected.
 * That is safe without a per-path direction flag because a lane is always
 * drawn from where the symbol starts to where it arrives: `headAt` is the last
 * point of `d`, and the marker is `marker-end`. `layout.test.ts` holds that
 * invariant for every lane of every diagram.
 */
function renderLane(lane: LanePath, idPrefix: string, flowing: boolean): ReactElement {
  const marker =
    lane.head === 'chevron'
      ? `url(#${idPrefix}-chevron-${lane.color.toLowerCase()})`
      : `url(#${idPrefix}-arrow-${lane.color.toLowerCase()})`;
  return (
    <path
      key={lane.id}
      id={lane.id}
      data-kind="lane"
      data-lane-kind={lane.kind}
      data-symbol={lane.layer}
      data-reaches={lane.reaches}
      className={classes(strokeClass(lane.color), flowing ? 'rmf-flow' : undefined)}
      fill="none"
      strokeWidth={LAYOUT.lane.strokeWidth}
      strokeLinejoin="round"
      strokeLinecap="butt"
      markerEnd={marker}
      d={lane.d}
    />
  );
}

function renderDot(dot: DecisionDot): ReactElement {
  return (
    <circle
      key={dot.id}
      id={dot.id}
      data-kind="decision-dot"
      data-symbol={dot.layer}
      data-decider={dot.decider}
      data-policy={dot.policyId}
      className={fillClass(dot.color)}
      cx={dot.at.x}
      cy={dot.at.y}
      r={LAYOUT.lane.dotRadius}
    />
  );
}

function renderChip(chip: LaneChip): ReactElement {
  return (
    <text
      key={chip.id}
      id={chip.id}
      data-kind="lane-chip"
      data-symbol={chip.layer}
      data-at={chip.at}
      className={classes(fillClass(chip.color), 'rmf-knockout')}
      x={chip.x}
      y={chip.y}
      textAnchor={chip.anchor}
      fontSize={LAYOUT.lane.chipFontSize}
    >
      {chip.lines.map((linetext, index) => (
        <tspan key={linetext} x={chip.x} dy={index === 0 ? 0 : 11}>
          {linetext}
        </tspan>
      ))}
    </text>
  );
}

/**
 * Chords in two passes: every arc first, then every badge and reason label.
 *
 * A chord crossing another passes *under* it (§3.6), which means a lower row's
 * arc is painted over the row above - and would be painted over that row's
 * label too. Drawing all the text last, with a knockout halo, keeps every
 * reason readable no matter how the arcs cross.
 */
function renderChordLayer(
  layout: DiagramLayout,
  idPrefix: string,
  selectedSymbol: SymbolName | null,
): ReactElement {
  const dimOf = (chord: ChordLayout): string | undefined =>
    selectedSymbol === null || chord.layer === selectedSymbol ? undefined : 'rmf-dim';
  // Shortest span nearest the tree paints last, so it reads as being on top.
  const chords = [...layout.chords.all].sort((a, b) => b.row - a.row);
  return (
    <Layer id={`${idPrefix}-layer-chords`} kind="chords">
      {chords.map((chord) => renderChordArc(chord, idPrefix, dimOf(chord)))}
      {chords.map((chord) => renderChordAnnotation(chord, dimOf(chord)))}
    </Layer>
  );
}

function renderChordArc(chord: ChordLayout, idPrefix: string, dimClass: string | undefined): ReactElement {
  const denied = chord.verdict === 'denied';
  return (
    <g
      key={chord.id}
      id={chord.id}
      data-kind="chord"
      data-verdict={chord.verdict}
      data-symbol={chord.symbol}
      data-importer={chord.importer}
      data-owner={chord.owner}
      {...(dimClass === undefined ? {} : { className: dimClass })}
    >
      {/* Halo first: a crossing chord visibly passes *under* the one above it. */}
      <path
        id={`${chord.id}-halo`}
        data-kind="chord-halo"
        className={strokeClass('bg')}
        fill="none"
        strokeWidth={LAYOUT.chord.haloWidth}
        d={chord.d}
      />
      <path
        id={`${chord.id}-arc`}
        data-kind="chord-arc"
        className={strokeClass(chord.color)}
        fill="none"
        strokeWidth={LAYOUT.chord.strokeWidth}
        {...(denied ? { strokeDasharray: '4 3' } : {})}
        {...(denied ? {} : { markerEnd: `url(#${idPrefix}-arrow-${chord.color.toLowerCase()})` })}
        d={chord.d}
      />
      {chord.stopBar === undefined ? null : (
        <line
          id={`${chord.id}-stop`}
          data-kind="chord-stop-bar"
          className={strokeClass('denial')}
          strokeWidth={2}
          x1={chord.stopBar.at.x - chord.stopBar.halfWidth}
          x2={chord.stopBar.at.x + chord.stopBar.halfWidth}
          y1={chord.stopBar.at.y}
          y2={chord.stopBar.at.y}
        />
      )}
    </g>
  );
}

function renderChordAnnotation(chord: ChordLayout, dimClass: string | undefined): ReactElement {
  return (
    <g
      key={`${chord.id}-annotation`}
      id={`${chord.id}-annotation`}
      data-kind="chord-annotation"
      data-chord={chord.id.replace('chord-', '')}
      data-symbol={chord.symbol}
      {...(dimClass === undefined ? {} : { className: dimClass })}
    >
      <circle
        id={`${chord.id}-badge`}
        data-kind="chord-badge"
        className={fillClass('bg')}
        stroke="none"
        cx={chord.badge.at.x}
        cy={chord.badge.at.y}
        r={LAYOUT.chord.badgeRadius}
      />
      <text
        id={`${chord.id}-badge-text`}
        data-kind="chord-badge-text"
        className={fillClass(chord.color)}
        x={chord.badge.at.x}
        y={chord.badge.at.y}
        textAnchor="middle"
        fontSize={11}
        fontWeight={700}
      >
        {chord.badge.text}
      </text>
      {chord.label === undefined ? null : (
        <>
          <rect
            id={`${chord.id}-label-plate`}
            data-kind="chord-label-plate"
            className={fillClass('bg')}
            x={chord.label.plate.x}
            y={chord.label.plate.y}
            width={chord.label.plate.width}
            height={chord.label.plate.height}
          />
          <text
            id={`${chord.id}-label`}
            data-kind="chord-label"
            className={fillClass(chord.color)}
            x={chord.label.at.x}
            y={chord.label.at.y}
            textAnchor={chord.label.anchor}
            fontSize={LAYOUT.chord.labelFontSize}
          >
            {chord.reason}
          </text>
        </>
      )}
    </g>
  );
}

function renderNode(
  node: NodeLayout,
  selectedSymbol: SymbolName | null,
  toggle: (symbol: SymbolName) => void,
  live: boolean,
): ReactElement {
  const { box, moduleContext } = node;
  // A whole-module context is drawn as the dashed sub-box that fills its node:
  // the same treatment a named context gets, at the size of the module, because
  // a context can be a subtree of a module's files or an entire module.
  const badgeShift =
    moduleContext === undefined
      ? 0
      : moduleContext.label.length * LAYOUT.node.contextCharWidth + 8;
  return (
    <g key={node.id} id={`node-${node.id}`} data-kind="node" data-module={node.id} data-depth={node.depth}>
      <rect
        id={`node-${node.id}-box`}
        data-kind="node-box"
        className={classes(fillClass('panel'), strokeClass('boxStroke'))}
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        rx={LAYOUT.node.cornerRadius}
        strokeWidth={1.2}
      />
      {moduleContext === undefined
        ? null
        : renderContext(
            moduleContext,
            `node-${node.id}-context`,
            {
              x: box.x + 3,
              y: box.y + 3,
              width: box.width - 6,
              height: box.height - 6,
            },
            {
              label: {
                x: box.x + box.width - LAYOUT.node.paddingX,
                y: box.y + LAYOUT.node.headerHeight / 2,
                anchor: 'end',
              },
            },
            selectedSymbol,
          )}
      <text
        id={`node-${node.id}-name`}
        data-kind="node-name"
        className={fillClass('text')}
        x={box.x + LAYOUT.node.paddingX}
        y={box.y + LAYOUT.node.headerHeight / 2}
        fontSize={13}
        fontWeight={700}
      >
        {node.id}
      </text>
      {node.badge === undefined ? null : (
        <text
          id={`node-${node.id}-badge`}
          data-kind="node-badge"
          className={fillClass('muted')}
          x={box.x + box.width - LAYOUT.node.paddingX - badgeShift}
          y={box.y + LAYOUT.node.headerHeight / 2}
          textAnchor="end"
          fontSize={9.5}
        >
          {node.badge}
        </text>
      )}
      {node.compartments.map((compartment) =>
        renderCompartment(node, compartment, selectedSymbol, toggle, live),
      )}
    </g>
  );
}

/**
 * A declared importer context: a dashed box, its `name` label, and - for a
 * named context - the line that says what its files are.
 *
 * The box pulses when the selected symbol is one its files may actually import,
 * so a selection separates the contexts that may take a tagged symbol from the
 * production compartments that may not.
 */
function renderContext(
  context: DrawnContext,
  id: string,
  frame: { x: number; y: number; width: number; height: number },
  text: {
    label: { x: number; y: number; anchor?: 'start' | 'end' };
    caption?: { x: number; y: number };
  },
  selectedSymbol: SymbolName | null,
): ReactElement {
  const lit = selectedSymbol !== null && context.imports.includes(selectedSymbol);
  const dim = selectedSymbol !== null && !lit ? 'rmf-dim-soft' : undefined;
  return (
    <g
      key={id}
      id={id}
      data-kind="node-context"
      data-module={context.module}
      {...(context.name === undefined ? {} : { 'data-context': context.name })}
      data-context-scope={context.name === undefined ? 'module' : 'named'}
      data-tags={context.tags.join(' ')}
      className={classes(dim, lit ? 'rmf-blink' : undefined)}
    >
      <rect
        id={`${id}-frame`}
        data-kind="node-context-frame"
        className={strokeClass('muted')}
        fill="none"
        strokeWidth={1}
        strokeDasharray="4 3"
        x={frame.x}
        y={frame.y}
        width={frame.width}
        height={frame.height}
        rx={LAYOUT.node.cornerRadius - 1}
      />
      <text
        id={`${id}-label`}
        data-kind="node-context-label"
        className={fillClass('muted')}
        x={text.label.x}
        y={text.label.y}
        {...(text.label.anchor === undefined ? {} : { textAnchor: text.label.anchor })}
        fontSize={10.5}
      >
        {withFullHeightRuleGlyphs(context.label, 10.5)}
      </text>
      {text.caption === undefined ? null : (
        <text
          id={`${id}-caption`}
          data-kind="node-context-caption"
          className={fillClass('muted')}
          x={text.caption.x}
          y={text.caption.y}
          fontSize={9.5}
          fontStyle="italic"
        >
          {context.caption}
        </text>
      )}
    </g>
  );
}

function renderCompartment(
  node: NodeLayout,
  compartment: Compartment,
  selectedSymbol: SymbolName | null,
  toggle: (symbol: SymbolName) => void,
  live: boolean,
): ReactElement {
  const { box } = node;
  const top = box.y + compartment.y;
  if (compartment.kind === 'context') {
    const inset = LAYOUT.node.contextInset;
    return renderContext(
      compartment.context,
      compartment.id,
      {
        x: box.x + inset,
        y: top + 3,
        width: box.width - 2 * inset,
        height: compartment.height - 6,
      },
      {
        label: {
          x: box.x + inset + LAYOUT.node.contextPadding,
          y: top + LAYOUT.node.contextPadding + LAYOUT.node.contextLineHeight / 2,
        },
        caption: {
          x: box.x + inset + LAYOUT.node.contextPadding,
          y:
            top +
            LAYOUT.node.contextPadding +
            LAYOUT.node.contextLineHeight +
            LAYOUT.node.contextLineHeight / 2,
        },
      },
      selectedSymbol,
    );
  }
  const isWhatIf = compartment.kind === 'what-if';
  return (
    <g key={compartment.id} id={compartment.id} data-kind="node-compartment" data-compartment={compartment.slug}>
      <line
        id={`${compartment.id}-rule`}
        data-kind="node-compartment-rule"
        className={strokeClass(isWhatIf ? 'muted' : 'separator')}
        strokeWidth={1}
        {...(isWhatIf ? { strokeDasharray: '3 3' } : {})}
        x1={box.x}
        x2={box.x + box.width}
        y1={top}
        y2={top}
      />
      <text
        id={`${compartment.id}-title`}
        data-kind="node-compartment-title"
        className={fillClass('muted')}
        x={box.x + LAYOUT.node.paddingX}
        y={top + LAYOUT.node.compartmentTitleHeight / 2}
        fontSize={9}
        letterSpacing={0.7}
      >
        {compartment.title}
      </text>
      {isWhatIf
        ? compartment.lines.map((linetext, index) => (
            <text
              key={linetext}
              id={`${compartment.id}-line-${String(index)}`}
              data-kind="node-what-if-line"
              className={fillClass('muted')}
              x={box.x + LAYOUT.node.paddingX}
              y={
                top +
                LAYOUT.node.compartmentTitleHeight +
                index * LAYOUT.node.whatIfLineHeight +
                LAYOUT.node.whatIfLineHeight / 2
              }
              fontSize={9.5}
              fontStyle="italic"
            >
              {linetext}
            </text>
          ))
        : null}
      {!isWhatIf && compartment.placeholder !== undefined ? (
        <text
          id={`${compartment.id}-placeholder`}
          data-kind="node-placeholder"
          className={fillClass('muted')}
          x={box.x + LAYOUT.node.paddingX}
          y={top + LAYOUT.node.compartmentTitleHeight + LAYOUT.node.rowHeight / 2}
          fontSize={11}
          fontStyle="italic"
        >
          {compartment.placeholder}
        </text>
      ) : null}
      {!isWhatIf
        ? compartment.rows.map((row) => renderRow(node, row, selectedSymbol, toggle, live))
        : null}
    </g>
  );
}

function renderRow(
  node: NodeLayout,
  row: SymbolRow,
  selectedSymbol: SymbolName | null,
  toggle: (symbol: SymbolName) => void,
  live: boolean,
): ReactElement {
  const { box } = node;
  const y = box.y + row.y;
  const traced = row.layer !== NEUTRAL_LAYER;
  const granted = row.kind === 'granted';
  const selected = selectedSymbol !== null && row.layer === selectedSymbol;
  // Selecting a symbol pulses every row that says "it is available here *and*
  // this module's files may import it" - the arrivals a reader could act on.
  // The owner's own row does not pulse: ownership is not an arrival, and it is
  // where the animated lanes start.
  const blink = selected && row.kind !== 'owns' && row.importable ? 'rmf-blink' : undefined;
  // An arrival a tag refuses goes dark instead: the row keeps its place and its
  // chip, and the selection simply passes it by. Dimming rather than only
  // withholding the pulse is what makes the contrast survive
  // `prefers-reduced-motion`, where nothing moves at all.
  const dark = selected && row.kind !== 'owns' && !row.importable;
  const dim = selectedSymbol !== null && (!selected || dark) ? 'rmf-dim-soft' : undefined;
  // A granted row has no decision of its own to report, so its name carries the
  // symbol's traced color instead: reach becomes scannable box by box.
  const labelColor: ColorKey = granted ? row.color : row.gray ? 'muted' : 'text';
  return (
    <g
      key={row.id}
      id={row.id}
      data-kind="node-row"
      data-compartment={row.compartment}
      {...(granted ? { 'data-row-kind': 'granted' } : {})}
      data-symbol={row.symbol}
      data-owner={row.owner}
      data-marker={row.marker}
      data-gray={row.gray ? 'true' : 'false'}
      {...(row.tags === undefined ? {} : { 'data-tags': row.tags.join(' ') })}
      {...(row.importable ? {} : { 'data-importable': 'false' })}
      className={classes(dim, blink, traced ? 'rmf-clickable' : undefined)}
      {...(traced ? { onClick: () => toggle(row.layer) } : {})}
    >
      {/*
        A clickable row is only as clickable as the ink in it: text elements are
        hit-tested per glyph, so without this the gaps between the marker, the
        name and the `from` label fall through to the node box. Drawn only for
        the live component, so the static export keeps exactly the elements it
        had before selection existed.
      */}
      {live && traced ? (
        <rect
          id={`${row.id}-hit`}
          data-kind="node-row-hit"
          fill="transparent"
          x={box.x + 1}
          y={y - LAYOUT.node.rowHeight / 2}
          width={box.width - 2}
          height={LAYOUT.node.rowHeight}
        />
      ) : null}
      {row.marker === undefined ? null : (
        <text
          id={`${row.id}-marker`}
          data-kind="node-row-marker"
          className={fillClass(row.gray ? 'muted' : row.color)}
          x={box.x + LAYOUT.node.paddingX}
          y={y}
          fontSize={10}
        >
          {row.marker}
        </text>
      )}
      {/* Arrivals are italic: the definition lives where the symbol is owned,
          and everywhere else the name is a reference. The label clears the
          marker column per glyph: `▲▼` is two glyphs wide, not one. A struck
          name is the static statement "visible here, not available": the row
          is drawn - the exposure chain really does put the symbol here - but
          no file of this module may import it. */}
      <text
        id={`${row.id}-label`}
        data-kind="node-row-label"
        className={fillClass(labelColor)}
        x={box.x + rowLabelDx(row.marker)}
        y={y}
        fontSize={12}
        {...(row.kind === 'owns' ? {} : { fontStyle: 'italic' })}
        {...(row.struck ? { textDecoration: 'line-through', 'data-struck': 'true' } : {})}
      >
        {row.symbol}
      </text>
      {/*
        The one mark the type story leaves in the picture: a struck row that is
        still type-available wears an unstruck `*` after its name - a footnote
        mark, decoded in the legend and expanded in the page's type-imports
        section. Its own element, because SVG draws a parent's line-through
        across every tspan: a child cannot opt out of the strike.
      */}
      {row.struck && row.typeAvailable ? (
        /* U+2217, the math operator: unlike the typographic `*` it sits
           centered on the line, like a multiplication sign. */
        <text
          id={`${row.id}-type-available`}
          data-kind="node-row-type-available"
          className={fillClass(labelColor)}
          x={box.x + rowLabelDx(row.marker) + row.symbol.length * LAYOUT.node.nameCharWidth - 2}
          y={y}
          fontSize={13}
          {...(row.kind === 'owns' ? {} : { fontStyle: 'italic' })}
        >
          ∗
        </text>
      ) : null}
      {/*
        The tag chip, and the binding note where the two bindings disagree.
        The chip writes each tag behind the glyph of the rule it carries
        (`⇥ testing`, `⇤ browser`) and sits on a filled pill: it is the one
        fact on a row a reader must not scan past, and muted text alone
        disappeared into the box (especially on the dark palette).
      */}
      {(row.annotations ?? []).map((annotation) => (
        <g key={annotation.kind}>
          {annotation.kind === 'tags' ? (
            <rect
              id={`${row.id}-${annotation.kind}-pill`}
              data-kind="node-row-tags-pill"
              className={fillClass('separator')}
              x={box.x + annotation.dx - 3}
              y={y - 6.5}
              width={annotation.text.length * LAYOUT.node.annotationCharWidth + 6}
              height={13}
              rx={6.5}
            />
          ) : null}
          <text
            id={`${row.id}-${annotation.kind}`}
            data-kind={`node-row-${annotation.kind}`}
            className={fillClass(annotation.kind === 'tags' ? 'text' : 'muted')}
            x={box.x + annotation.dx}
            y={y}
            fontSize={9.5}
          >
            {withFullHeightRuleGlyphs(annotation.text, 9.5)}
          </text>
        </g>
      ))}
      {row.provenance === undefined ? null : (
        <text
          id={`${row.id}-from`}
          data-kind="node-row-from"
          className={fillClass('muted')}
          x={box.x + box.width - LAYOUT.node.paddingX}
          y={y}
          textAnchor="end"
          fontSize={10}
        >
          {row.provenance}
        </text>
      )}
    </g>
  );
}

/**
 * The traced-contracts panel at the top left - the diagram's selection
 * control, promoted out of the legend but keeping its vertical row form:
 * `swatch symbol - role`, one row per contract. Rows select exactly as the
 * legend chips used to. The play/stop toggle is live-only: the static export
 * gets no handler and therefore no toggle.
 */
function renderHeader(
  header: HeaderLayout,
  idPrefix: string,
  traced: readonly TracedSymbol[],
  selectedSymbol: SymbolName | null,
  toggle: (symbol: SymbolName) => void,
  playing: boolean,
  onTogglePlay?: () => void,
): ReactElement {
  return (
    <g id={`${idPrefix}-header`} data-kind="header">
      <text
        id={`${idPrefix}-header-caption`}
        data-kind="header-caption"
        className={fillClass('text')}
        x={header.captionAt.x}
        y={header.captionAt.y}
        fontSize={LAYOUT.header.captionFontSize}
        fontWeight={700}
      >
        Traced contracts
      </text>
      {onTogglePlay === undefined ? null : (
        <g
          id={`${idPrefix}-header-play`}
          data-kind="play-toggle"
          data-playing={playing ? 'true' : 'false'}
          role="button"
          aria-label={playing ? 'Stop the tour' : 'Play the tour'}
          className="rmf-clickable"
          onClick={onTogglePlay}
        >
          <rect
            data-kind="play-toggle-hit"
            fill="transparent"
            x={header.toggleAt.x - 6}
            y={header.toggleAt.y - 18}
            width={LAYOUT.header.toggleWidth}
            height={27}
          />
          <text
            data-kind="play-toggle-label"
            className={fillClass('muted')}
            x={header.toggleAt.x}
            y={header.toggleAt.y}
            fontSize={16.5}
          >
            {playing ? '■ stop' : '▶ play'}
          </text>
        </g>
      )}
      {header.chips.map((chip) => {
        const entry = traced.find((candidate) => candidate.symbol === chip.symbol);
        const selected = chip.symbol === selectedSymbol;
        const dim = selectedSymbol !== null && !selected ? 'rmf-dim-soft' : undefined;
        return (
          <g
            key={chip.symbol}
            id={`${idPrefix}-header-chip-${chip.symbol}`}
            data-kind="header-chip"
            data-symbol={chip.symbol}
            data-selected={selected ? 'true' : 'false'}
            className={classes(dim, 'rmf-clickable')}
            onClick={() => toggle(chip.symbol as SymbolName)}
          >
            <rect
              data-kind="header-chip-hit"
              fill="transparent"
              x={chip.hitBox.x}
              y={chip.hitBox.y}
              width={chip.hitBox.width}
              height={chip.hitBox.height}
            />
            <line
              className={strokeClass(entry?.color ?? 'text')}
              strokeWidth={4.5}
              strokeLinecap="round"
              x1={chip.swatchFrom.x}
              y1={chip.swatchFrom.y}
              x2={chip.swatchTo.x}
              y2={chip.swatchTo.y}
            />
            <text
              data-kind="header-chip-label"
              className={fillClass('text')}
              x={chip.textAt.x}
              y={chip.textAt.y}
              fontSize={LAYOUT.header.fontSize}
              {...(selected ? { fontWeight: 600 } : {})}
            >
              {chip.symbol}
              <tspan className={fillClass('muted')} fontWeight={400}>
                {` - ${entry?.role ?? ''}`}
              </tspan>
            </text>
          </g>
        );
      })}
    </g>
  );
}

function renderLegendGroup(
  group: LegendGroupLayout,
  idPrefix: string,
  traced: readonly TracedSymbol[],
  selectedSymbol: SymbolName | null,
  toggle: (symbol: SymbolName) => void,
): ReactElement {
  return (
    <g key={group.id} id={`${idPrefix}-legend-${group.id}`} data-kind="legend-group" data-group={group.id}>
      <text
        id={`${idPrefix}-legend-${group.id}-title`}
        data-kind="legend-title"
        className={fillClass('text')}
        x={group.titleAt.x}
        y={group.titleAt.y}
        fontSize={11}
        fontWeight={700}
      >
        {group.title}
      </text>
      {group.entries.map((entry) => {
        const selects = entry.entry.selects;
        const selected = selects !== undefined && selects === selectedSymbol;
        const dim =
          selectedSymbol !== null && selects !== undefined && !selected ? 'rmf-dim-soft' : undefined;
        return (
          <g
            key={entry.entry.id}
            id={`${idPrefix}-legend-entry-${entry.entry.id}`}
            data-kind="legend-entry"
            {...(selects === undefined ? {} : { 'data-symbol': selects })}
            data-selected={selected ? 'true' : 'false'}
            className={classes(dim, selects === undefined ? undefined : 'rmf-clickable')}
            {...(selects === undefined ? {} : { onClick: () => toggle(selects) })}
          >
            <rect
              data-kind="legend-hit"
              fill="transparent"
              x={entry.hitBox.x}
              y={entry.hitBox.y}
              width={entry.hitBox.width}
              height={entry.hitBox.height}
            />
            {renderLegendGlyph(entry.entry, entry.glyphAt.x, entry.glyphAt.y, idPrefix, traced)}
            <text
              data-kind="legend-text"
              className={fillClass('text')}
              x={entry.textAt.x}
              y={entry.textAt.y}
              fontSize={LAYOUT.legend.fontSize}
            >
              {renderLegendEntryText(entry.entry)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/**
 * The compartment entry demonstrates the difference it describes: its
 * "exposed to this module" half is italic, exactly as arrival names are in
 * the boxes.
 */
function renderLegendEntryText(entry: LegendEntry): ReactNode {
  if (entry.glyph.kind !== 'compartment' || !entry.text.includes(' / ')) {
    return entry.text;
  }
  const separatorAt = entry.text.indexOf(' / ') + ' / '.length;
  return (
    <>
      {entry.text.slice(0, separatorAt)}
      <tspan fontStyle="italic">{entry.text.slice(separatorAt)}</tspan>
    </>
  );
}

/** The rule-arrow characters, as a set, for full-height rendering. */
const RULE_GLYPH_CHARS: ReadonlySet<string> = new Set(Object.values(TAG_GLYPHS));

/**
 * Measured on the diagram's font stack (canvas `actualBoundingBox`, em units):
 * the arrows span 0.442em, floating 0.095em above the baseline, while a
 * capital spans 0.726em from the baseline. Scaling by 0.726 / 0.442 and
 * shifting the floated bottom down onto the baseline renders the arrow at
 * exactly a capital's height. Other platforms' fonts will differ a little;
 * arrows sit near the x-height in every mainstream sans, so the correction
 * stays directionally right.
 */
const RULE_GLYPH_SCALE = 1.64;
const RULE_GLYPH_DROP_EM = 0.155;

/**
 * A text run in which every rule glyph (`⇥`, `⇤`) is enlarged to the height
 * of an uppercase character and seated on the baseline. The arrows' own font
 * glyphs are drawn small - under the x-height, lifted off the baseline - so
 * at chip size they read as specks. A larger tspan with a `dy` drop fixes
 * both without touching the measured layout, which counts characters; the
 * character after each glyph carries the compensating `dy` because SVG text
 * shifts are cumulative.
 */
function withFullHeightRuleGlyphs(text: string, fontSize: number): ReactNode {
  if (![...RULE_GLYPH_CHARS].some((glyph) => text.includes(glyph))) {
    return text;
  }
  const drop = Math.round(fontSize * RULE_GLYPH_DROP_EM * 100) / 100;
  const characters = [...text];
  return characters.map((character, index) =>
    RULE_GLYPH_CHARS.has(character) ? (
      <tspan key={index} fontSize={Math.round(fontSize * RULE_GLYPH_SCALE * 10) / 10} dy={drop}>
        {character}
      </tspan>
    ) : characters[index - 1] !== undefined && RULE_GLYPH_CHARS.has(characters[index - 1] ?? '') ? (
      <tspan key={index} dy={-drop}>
        {character}
      </tspan>
    ) : (
      character
    ),
  );
}

function renderLegendGlyph(
  entry: LegendEntry,
  cx: number,
  cy: number,
  idPrefix: string,
  traced: readonly TracedSymbol[],
): ReactElement {
  const { glyph } = entry;
  switch (glyph.kind) {
    case 'marker':
      return (
        <text
          data-kind="legend-glyph"
          className={fillClass(glyph.muted === true ? 'muted' : 'neutral')}
          x={cx}
          y={cy}
          textAnchor="middle"
          fontSize={11}
        >
          {withFullHeightRuleGlyphs(glyph.text, 11)}
        </text>
      );
    case 'struck':
      return (
        <g data-kind="legend-glyph">
          <text
            className={fillClass('muted')}
            x={cx}
            y={cy}
            textAnchor="middle"
            fontSize={10}
            fontStyle="italic"
            textDecoration="line-through"
          >
            {glyph.text}
          </text>
          {glyph.suffix === undefined ? null : (
            /* Unstruck, like the mark it reproduces - clear of the struck
               sample's tail, a size up so it reads at legend scale. */
            <text
              className={fillClass('muted')}
              x={cx + (glyph.text.length * 5) / 2 + 4}
              y={cy}
              fontSize={11}
              fontStyle="italic"
            >
              {glyph.suffix}
            </text>
          )}
        </g>
      );
    case 'compartment':
      return (
        <g data-kind="legend-glyph">
          <rect
            className={strokeClass('boxStroke')}
            fill="none"
            x={cx - 12}
            y={cy - 6}
            width={24}
            height={12}
            rx={2}
          />
          <line className={strokeClass('separator')} x1={cx - 12} x2={cx + 12} y1={cy} y2={cy} />
        </g>
      );
    case 'up-hop':
      return (
        <g data-kind="legend-glyph">
          <path
            className={strokeClass('neutral')}
            fill="none"
            strokeWidth={LAYOUT.lane.strokeWidth}
            markerEnd={`url(#${idPrefix}-arrow-neutral)`}
            d={`M${String(cx)},${String(cy + 5)}L${String(cx)},${String(cy - 4)}`}
          />
          <circle className={fillClass('neutral')} cx={cx} cy={cy + 5} r={2.6} />
        </g>
      );
    case 'grant':
      return (
        <g data-kind="legend-glyph">
          <path
            className={strokeClass('neutral')}
            fill="none"
            strokeWidth={LAYOUT.lane.strokeWidth}
            markerEnd={`url(#${idPrefix}-chevron-neutral)`}
            d={`M${String(cx - 7)},${String(cy - 5)}L${String(cx - 7)},${String(cy)}L${String(cx + 7)},${String(cy)}L${String(cx + 7)},${String(cy + 3)}`}
          />
          <circle className={fillClass('neutral')} cx={cx - 7} cy={cy - 5} r={2.6} />
        </g>
      );
    case 'granted':
      // The arrival a grant produces, with no marker on the row: a chevron
      // landing on the box, and nothing decided there.
      return (
        <path
          data-kind="legend-glyph"
          className={strokeClass('neutral')}
          fill="none"
          strokeWidth={LAYOUT.lane.strokeWidth}
          markerEnd={`url(#${idPrefix}-chevron-neutral)`}
          d={`M${String(cx - 6)},${String(cy)}L${String(cx + 2)},${String(cy)}`}
        />
      );
    case 'dot':
      return <circle data-kind="legend-glyph" className={fillClass('neutral')} cx={cx} cy={cy} r={3.2} />;
    case 'arrowhead':
      return (
        <path
          data-kind="legend-glyph"
          className={strokeClass('neutral')}
          fill="none"
          strokeWidth={LAYOUT.lane.strokeWidth}
          markerEnd={`url(#${idPrefix}-arrow-neutral)`}
          d={`M${String(cx - 6)},${String(cy)}L${String(cx + 2)},${String(cy)}`}
        />
      );
    case 'chord-allowed':
      return (
        <g data-kind="legend-glyph">
          <path
            className={strokeClass('neutral')}
            fill="none"
            strokeWidth={LAYOUT.chord.strokeWidth}
            d={`M${String(cx - 12)},${String(cy - 4)}Q${String(cx)},${String(cy + 7)} ${String(cx + 8)},${String(cy - 4)}`}
          />
          <text className={fillClass('neutral')} x={cx + 13} y={cy} textAnchor="middle" fontSize={10} fontWeight={700}>
            ✓
          </text>
        </g>
      );
    case 'chord-denied':
      return (
        <g data-kind="legend-glyph">
          <path
            className={strokeClass('denial')}
            fill="none"
            strokeWidth={LAYOUT.chord.strokeWidth}
            strokeDasharray="4 3"
            d={`M${String(cx - 12)},${String(cy - 4)}Q${String(cx)},${String(cy + 7)} ${String(cx + 8)},${String(cy - 4)}`}
          />
          <text className={fillClass('denial')} x={cx + 13} y={cy} textAnchor="middle" fontSize={10} fontWeight={700}>
            ✗
          </text>
        </g>
      );
    case 'traced': {
      const entryFor = traced.find((candidate) => candidate.symbol === glyph.symbol);
      const color: ColorKey = entryFor?.color ?? 'neutral';
      return (
        <g data-kind="legend-glyph" data-symbol={glyph.symbol}>
          <line
            className={strokeClass(color)}
            strokeWidth={LAYOUT.lane.strokeWidth + 0.8}
            x1={cx - 13}
            x2={cx + 9}
            y1={cy}
            y2={cy}
          />
          <circle className={fillClass(color)} cx={cx - 13} cy={cy} r={3} />
        </g>
      );
    }
  }
}

/** A diagram's access policy as prose, for a host page that wants the sentences. */
export function accessPolicyStatementsOf(definition: DiagramDefinition): readonly string[] {
  return definition.decisionPolicies.map((policy) => policy.text);
}

/** The five policy statements of §4.1, for a host page that wants them as prose. */
export const accessPolicyStatements: readonly string[] = accessPolicyStatementsOf(shopDiagram);
