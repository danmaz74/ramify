import { measureBounds } from './bounds.js';
import type { LegendInput, LegendResult, LayoutNode, LayoutOptions } from './interfaces/layout.js';

/** Flow measured items in input order, wrapping before an item crosses maxWidth. */
export function placeLegend(input: LegendInput, options: LayoutOptions): LegendResult {
  if (options.orientation === 'vertical') {
    const placed = placeLegend({
      items: input.items.map(item => ({ ...item, width: item.height, height: item.width })),
      maxWidth: input.maxWidth,
    }, { ...options, orientation: 'horizontal', gapX: options.gapY, gapY: options.gapX });
    const items = placed.items.map(item => ({ key: item.key, box: {
      x: item.box.y, y: item.box.x, width: item.box.height, height: item.box.width,
    } }));
    return { items, bounds: measureBounds(items.map(item => item.box)) };
  }
  const items: LayoutNode[] = [];
  let x = options.padding;
  let y = options.padding;
  let bandHeight = 0;
  for (const item of input.items) {
    if (x > options.padding && x + item.width > options.padding + input.maxWidth) {
      x = options.padding;
      y += bandHeight + options.gapY;
      bandHeight = 0;
    }
    items.push({ key: item.key, box: { x, y, width: item.width, height: item.height } });
    bandHeight = Math.max(bandHeight, item.height);
    x += item.width + options.gapX;
  }
  return { items, bounds: measureBounds(items.map(item => item.box)) };
}
