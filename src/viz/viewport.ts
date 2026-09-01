/**
 * Pan and zoom, as arithmetic on the SVG `viewBox`.
 *
 * The diagram zooms by narrowing the window it shows, not by transforming its
 * contents: no wrapper `<g>`, no `transform` attribute, nothing added to the
 * element tree. That keeps the static export byte-identical to what it was
 * before zoom existed, and it keeps stroke widths and font sizes scaling with
 * the picture the way a reader expects.
 *
 * Everything here is pure arithmetic over rectangles. The component converts
 * pointer positions into the fractional anchors these functions take, so this
 * module never touches the DOM and can be tested without one.
 */

/** A window onto the diagram, in diagram coordinates. */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Zoom limits. 1 is "the whole diagram fills the container"; below 0.5 the
 * labels stop being readable, and above 4 a single node fills the screen.
 */
export const MIN_SCALE = 0.5;
export const MAX_SCALE = 4;

/** A point inside the viewport, as a fraction of its width and height. */
export interface Anchor {
  readonly u: number;
  readonly v: number;
}

/** The centre of the viewport - the anchor the +/- buttons zoom about. */
export const CENTER: Anchor = { u: 0.5, v: 0.5 };

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/** How magnified the view is relative to the whole diagram. */
export function scaleOf(base: ViewRect, view: ViewRect): number {
  return base.width / view.width;
}

/**
 * Keep at least half the viewport over the diagram, in both axes, so the
 * picture can never be dragged completely out of sight.
 */
export function clampPan(base: ViewRect, view: ViewRect): ViewRect {
  const lowX = base.x - view.width / 2;
  const highX = base.x + base.width - view.width / 2;
  const lowY = base.y - view.height / 2;
  const highY = base.y + base.height - view.height / 2;
  return {
    ...view,
    x: clamp(view.x, Math.min(lowX, highX), Math.max(lowX, highX)),
    y: clamp(view.y, Math.min(lowY, highY), Math.max(lowY, highY)),
  };
}

/**
 * Zoom by `factor` about a fixed point: whatever was under the anchor stays
 * under the anchor. The requested factor is reduced, not refused, when it
 * would cross a zoom limit, so a fast scroll settles on the limit instead of
 * stopping short of it.
 */
export function zoomAt(base: ViewRect, view: ViewRect, anchor: Anchor, factor: number): ViewRect {
  const width = clamp(view.width / factor, base.width / MAX_SCALE, base.width / MIN_SCALE);
  const applied = view.width / width;
  if (applied === 1) {
    return view;
  }
  const height = view.height / applied;
  // The diagram-space point the anchor is over, before and after.
  const anchorX = view.x + anchor.u * view.width;
  const anchorY = view.y + anchor.v * view.height;
  return clampPan(base, {
    x: anchorX - anchor.u * width,
    y: anchorY - anchor.v * height,
    width,
    height,
  });
}

/** Drag the diagram by a distance already converted to diagram units. */
export function panBy(base: ViewRect, view: ViewRect, dx: number, dy: number): ViewRect {
  return clampPan(base, { ...view, x: view.x - dx, y: view.y - dy });
}

/** Whether the view is the untouched whole diagram. */
export function isReset(base: ViewRect, view: ViewRect): boolean {
  return (
    view.x === base.x && view.y === base.y && view.width === base.width && view.height === base.height
  );
}

/**
 * A wheel notch is not a fixed number: `deltaY` is only in pixels when
 * `deltaMode` says so. Firefox, and Chrome with some mice, report
 * `DOM_DELTA_LINE` with a `deltaY` of about 3 per notch instead of about 100 -
 * so a zoom step computed from the raw number comes out around 0.7% and reads
 * to the user as "scrolling does nothing at all". Normalising first is what
 * makes the wheel behave the same on every browser.
 */
const LINE_HEIGHT_PX = 16;
const PAGE_HEIGHT_PX = 400;
const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;

/** A wheel event's vertical delta in pixels, whatever unit it arrived in. */
export function normalizeWheelDelta(deltaY: number, deltaMode: number): number {
  if (deltaMode === DOM_DELTA_LINE) {
    return deltaY * LINE_HEIGHT_PX;
  }
  if (deltaMode === DOM_DELTA_PAGE) {
    return deltaY * PAGE_HEIGHT_PX;
  }
  return deltaY;
}

/** One wheel notch as a gentle, symmetric zoom step. */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const pixels = normalizeWheelDelta(deltaY, deltaMode);
  return Math.exp(-clamp(pixels, -240, 240) * 0.0025);
}

/** How far a pointer may travel and still count as a click, not a drag. */
export const DRAG_THRESHOLD = 5;
