import { describe, expect, it } from 'vitest';
import type { ProjectExplorerModel } from '../../presentation/subs/project-view/src/interfaces/project-view.js';
import { createProjectExplorerModel } from '../../service-api/src/project-view.js';

type ProjectionResult = ReturnType<typeof createProjectExplorerModel>;
type ReadyProjection = Extract<ProjectionResult, { readonly status: 'ready' }>;

/** Compile-time owner-boundary witness: the dispatch-only projector infers the
 * one DTO owned by project-view without importing or duplicating that UI type. */
function assignedModel(result: ReadyProjection): ProjectExplorerModel {
  return result.view;
}

type RemovedTransportKeys = Extract<keyof ProjectExplorerModel, 'otherTargets'>;
const noRemovedTransportKeys: RemovedTransportKeys extends never ? true : false = true;

describe('project explorer projection contract', () => {
  it('assigns the inferred ready view to the frozen presentation DTO', () => {
    expect(typeof assignedModel).toBe('function');
    expect(noRemovedTransportKeys).toBe(true);
  });
});
