import type { RunControl } from './interfaces/analysis.js';
import { readRootMarker } from '../subs/descriptions/src/parse.js';
import { resolveProjectRoot } from '../subs/project/src/resolve-root.js';
import type { ProjectRequest, ProjectResolution } from '../subs/project/src/interfaces/project.js';
/** `known` holds earlier resolutions, most recent first; one of an equal request is
 * returned unchanged while every discovery query it made answers the same. */
export function resolveProject(request: ProjectRequest, control: RunControl = {},
  known: readonly ProjectResolution[] = []): Promise<ProjectResolution> {
  return resolveProjectRoot(request, readRootMarker, control.signal, known);
}
