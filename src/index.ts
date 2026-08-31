// ramify.ts — toolkit for the cross-module importability model.
// See docs/model/cross-module-importability-rules.md for the model definition
// and docs/model/glossary.md for its vocabulary.

export {
  allSymbols,
  ancestorsOf,
  buildTree,
  explainImport,
  isAvailable,
  mayImport,
} from './model/index.js';
export type {
  DenialReason,
  ExposureDeclaration,
  ImportAllowed,
  ImportClause,
  ImportDecision,
  ImportDenied,
  ModuleDeclaration,
  ModuleId,
  ModuleRecord,
  ModuleTree,
  OwnedSymbolDeclaration,
  ReExposureDeclaration,
  SymbolName,
  SymbolRef,
} from './model/index.js';

// The diagrams: a declared example universe per diagram, its pure layout, and
// the React SVG view. See src/viz/index.ts for the full visualization surface.
export {
  ModelDiagram,
  ModelDiagramSvg,
  buildDiagramLayout,
  coreModelLayout,
  diagramLayout,
  example1Diagram,
  shopDeclaration,
  shopDiagram,
  shopTree,
  tracedSymbols,
  chordSpecs,
} from './viz/index.js';
export type { DiagramDefinition, DiagramLayout, ModelDiagramProps } from './viz/index.js';
