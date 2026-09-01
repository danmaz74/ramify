// ramify.ts — toolkit for the cross-module importability model.
// See docs/model/cross-module-importability-rules.md for the model definition
// and docs/model/glossary.md for its vocabulary.

// The tree half of the model: the ownership tree, availability over it, and the
// importability rule built on both halves.
export {
  allSymbols,
  ancestorsOf,
  buildTree,
  explainAvailability,
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

// The contextual half: the declared classifications that restrict who may
// import what — the exposure tags a symbol carries, the importer contexts a
// module declares, and the importer descriptor the complete rule reads.
export {
  MODULE_TAGS,
  SYMBOL_TAGS,
  appliesToBinding,
  moduleTagsOf,
  defaultSymbolTag,
  symbolTagsOf,
  requireImporterContext,
} from './model/index.js';
export type {
  ContextName,
  ModuleTag,
  ModuleTagDefinition,
  SymbolTag,
  SymbolTagDefinition,
  ImportBinding,
  Importer,
  ImporterContextDeclaration,
  ImporterDescriptor,
  RequirementScope,
  UnmetTagRequirement,
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
  example2Diagram,
  example3Diagram,
  example4Diagram,
  shopDeclaration,
  shopDiagram,
  shopTree,
  tracedSymbols,
  chordSpecs,
} from './viz/index.js';
export type { DiagramDefinition, DiagramLayout, ModelDiagramProps } from './viz/index.js';
