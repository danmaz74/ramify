/**
 * The ramify model: a declared ownership tree, symbol availability over it, the
 * declared classifications that restrict who may import what, and the
 * importability rule that follows. Pure, framework-free and browser-compatible.
 *
 * Specified by `docs/model/cross-module-importability-rules.md`; vocabulary in
 * `docs/model/glossary.md`.
 */

export {
  allSymbols,
  ancestorsOf,
  buildTree,
  moduleTagsOf,
  symbolTagsOf,
  requireImporterContext,
} from './tree.js';
export type {
  ContextName,
  ExposureDeclaration,
  ImporterContextDeclaration,
  ModuleDeclaration,
  ModuleId,
  ModuleRecord,
  ModuleTree,
  OwnedSymbolDeclaration,
  ReExposureDeclaration,
  SymbolName,
  SymbolRef,
} from './tree.js';

export { MODULE_TAGS, SYMBOL_TAGS, appliesToBinding, defaultSymbolTag } from './tags.js';
export type {
  Tag,
  ModuleTag,
  ModuleTagDefinition,
  SymbolTag,
  SymbolTagDefinition,
  ImportBinding,
  RequirementScope,
} from './tags.js';

export { explainAvailability, explainImport, isAvailable, mayImport } from './availability.js';
export type {
  DenialReason,
  ImportAllowed,
  ImportClause,
  ImportDecision,
  ImportDenied,
  Importer,
  ImporterDescriptor,
  UnmetTagRequirement,
} from './availability.js';
