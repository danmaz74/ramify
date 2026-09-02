/**
 * Ramify diagrams: a declared universe, its editorial data, pure layout, and a
 * React SVG view.
 *
 * Everything under `src/viz/` except this barrel's `ModelDiagram` export is
 * framework-free and browser-safe. File I/O happens in one place only -
 * `scripts/emit-diagrams.ts` - so the whole visualization can be embedded in
 * any React host without dragging Node along.
 *
 * The pipeline is parameterized by a {@link DiagramDefinition}: no layout
 * module knows which universe it is drawing. `diagrams/shop.ts` is the
 * core-model diagram and the default everywhere; `diagrams/example1.ts` to
 * `diagrams/example4.ts` are the illustrative-examples series - the last two of
 * them the tag examples, whose chips, contexts and blink sets are derived from
 * their declarations exactly like everything else. The shop's pieces are
 * re-exported here under their historical names.
 */

export {
  ModelDiagram,
  ModelDiagramSvg,
  TOUR_DWELL_MS,
  accessPolicyStatements,
  accessPolicyStatementsOf,
} from './ModelDiagram.js';
export type { ModelDiagramInteractiveProps, ModelDiagramProps } from './ModelDiagram.js';

export {
  CENTER,
  DRAG_THRESHOLD,
  MAX_SCALE,
  MIN_SCALE,
  clampPan,
  isReset,
  normalizeWheelDelta,
  panBy,
  scaleOf,
  wheelFactor,
  zoomAt,
} from './viewport.js';
export type { Anchor, ViewRect } from './viewport.js';

export { NEUTRAL_LAYER, createDiagramContext } from './diagram-definition.js';
export type {
  ChordSpec,
  ColorKey,
  DecisionPolicy,
  DiagramContext,
  DiagramDefinition,
  LegendEntry,
  LegendGroup,
  NodeContentOptions,
  TracedColorKey,
  TracedSymbol,
  WhatIfNote,
} from './diagram-definition.js';

export {
  shopDeclaration,
  shopDiagram,
  shopTree,
  moduleDepth,
  moduleOrder,
  chordSpecs,
  decisionPolicies,
  diagramTitle,
  legendGroups,
  legendNotes,
  tracedSymbols,
  uniformExposureFootnote,
  whatIfNote,
} from './diagrams/shop.js';

export { example1Declaration, example1Diagram } from './diagrams/example1.js';
export { example1aDeclaration, example1aDiagram } from './diagrams/example1a.js';
export { example1bDeclaration, example1bDiagram } from './diagrams/example1b.js';
export { example2Declaration, example2Diagram } from './diagrams/example2.js';
export { example3Declaration, example3Diagram } from './diagrams/example3.js';
export { example4Declaration, example4Diagram } from './diagrams/example4.js';
export { seriesLegendGroups, seriesNodeContent } from './diagrams/series.js';

export { buildDiagramLayout, coreModelLayout, diagramLayout } from './layout.js';
export type { DiagramLayout } from './layout.js';

export {
  descendantsOf,
  derivedChildExposures,
  derivedDescendantExposures,
  layoutTree,
  provenanceText,
  tagChipText,
} from './layout-nodes.js';
export type {
  Compartment,
  DrawnContext,
  NodeLayout,
  RowAnnotation,
  RowKind,
  SymbolRow,
  TreeGeometry,
} from './layout-nodes.js';

export { enumerateDecisions, layoutPropagation } from './layout-lanes.js';
export type {
  DecisionDot,
  LaneChip,
  LanePath,
  PropagationDecision,
  PropagationLayout,
  TreeEdgeLayout,
} from './layout-lanes.js';

export { layoutChords } from './layout-chords.js';
export type { ChordLayout, ChordsLayout } from './layout-chords.js';

export { layoutLegend } from './layout-legend.js';
export type { LegendLayout } from './layout-legend.js';

export {
  DiagramModelMismatch,
  validateChords,
  validateDecisionDots,
  validateDiagram,
  validateGrayRows,
  validateLandings,
  validateNodeRows,
  validateTagClaims,
} from './validate.js';

export { darkPalette, diagramStylesheet, lightPalette } from './theme.js';
export type { Palette, Theme } from './theme.js';

export { LAYOUT, rowLabelDx } from './geometry.js';
export type { Box, Point } from './geometry.js';
