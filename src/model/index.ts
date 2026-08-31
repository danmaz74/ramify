/**
 * The ramify model: a declared ownership tree, symbol availability over it, and
 * the file-level importability rule that follows. Pure, framework-free and
 * browser-compatible.
 *
 * Specified by `docs/model/cross-module-importability-rules.md`; vocabulary in
 * `docs/model/glossary.md`.
 */

export { allSymbols, ancestorsOf, buildTree } from './tree.js';
export type {
  ExposureDeclaration,
  ModuleDeclaration,
  ModuleId,
  ModuleRecord,
  ModuleTree,
  OwnedSymbolDeclaration,
  ReExposureDeclaration,
  SymbolName,
  SymbolRef,
} from './tree.js';

export { explainImport, isAvailable, mayImport } from './availability.js';
export type {
  DenialReason,
  ImportAllowed,
  ImportClause,
  ImportDecision,
  ImportDenied,
} from './availability.js';
