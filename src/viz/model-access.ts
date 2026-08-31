/**
 * The slice of the model the diagram uses, plus the one lookup helper the
 * public model surface does not export.
 *
 * Keeping this in one place makes the dependency direction obvious: the
 * visualization reads the model, and never the other way round.
 */

export {
  ancestorsOf,
  buildTree,
  explainImport,
  isAvailable,
  mayImport,
} from '../model/index.js';

export type {
  DenialReason,
  ImportClause,
  ImportDecision,
  ModuleDeclaration,
  ModuleId,
  ModuleRecord,
  ModuleTree,
  OwnedSymbolDeclaration,
  SymbolName,
  SymbolRef,
} from '../model/index.js';

import type { ModuleId, ModuleRecord, ModuleTree } from '../model/index.js';

/** Look up a module record, failing loudly on an unknown id. */
export function requireModuleRecord(tree: ModuleTree, id: ModuleId): ModuleRecord {
  const record = tree.modules.get(id);
  if (record === undefined) {
    throw new Error(`Unknown module "${id}".`);
  }
  return record;
}
