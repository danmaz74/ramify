import { resolvePredecessors } from './history.js';
import { findRecord } from './records.js';
import type {
  InspectionReport,
  ObservationCallback,
  RecordId,
  RevisionChain,
  RevisionScope,
} from '../../../../contracts/src/interfaces/vocabulary.js';

/**
 * What the catalog can do with a record, independently of any protocol.
 *
 * The two operations below are the whole capability: one summary for a list,
 * one report of the facts an inspection found. Both are exposed to the feature
 * parent, which adapts them to tRPC and to MCP.
 */

/**
 * What a caller needs to show one record without reading its revisions. It is
 * this owner's type, exposed alongside the behaviour that returns it.
 */
export interface CatalogSummary {
  recordId: RecordId;
  title: string;
  revisionCount: number;
  latestRevisionId: string;
}

/** Applies a scope to a chain, oldest revision first. */
function selectRevisions(chain: RevisionChain, scope: RevisionScope): RevisionChain {
  if (scope.kind === 'all') {
    return chain;
  }

  return chain.slice(Math.max(chain.length - scope.count, 0));
}

/**
 * The summary of one record, or `undefined` when no record has that id.
 * Turning that absence into a protocol error belongs to an adapter.
 */
export function getRecord(recordId: RecordId): CatalogSummary | undefined {
  const record = findRecord(recordId);

  if (!record) {
    return undefined;
  }

  const latest = record.revisions.at(-1);

  return {
    recordId: record.id,
    title: record.title,
    revisionCount: record.revisions.length,
    latestRevisionId: latest ? latest.id : '',
  };
}

/**
 * Inspects the scoped part of a record's chain and reports what it found.
 *
 * The report is facts only: the revisions as recorded, and which predecessor
 * references resolve to a revision of the scoped chain. `findings` stays empty,
 * because deciding which facts are defects is a reviewer's job. Progress is
 * reported through `observe`, so an inspection needs to know nothing about who
 * called it.
 */
export function inspect(
  recordId: RecordId,
  scope: RevisionScope,
  observe: ObservationCallback,
): InspectionReport | undefined {
  const record = findRecord(recordId);

  if (!record) {
    return undefined;
  }

  const chain = selectRevisions(record.revisions, scope);

  observe({
    kind: 'inspection-started',
    message: `Inspecting ${chain.length} of ${record.revisions.length} revisions`,
    recordId: record.id,
  });

  const predecessors = resolvePredecessors(chain);

  observe({
    kind: 'inspection-finished',
    message: `${predecessors.unresolved.length} predecessor reference(s) resolved to no revision`,
    recordId: record.id,
  });

  return {
    recordId: record.id,
    chain,
    resolvedPredecessors: predecessors.resolved,
    unresolvedPredecessors: predecessors.unresolved,
    findings: [],
  };
}
