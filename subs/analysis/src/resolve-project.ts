import type { RunControl } from './interfaces/analysis.js';
import { resolveProjectRoot } from '../subs/project/src/resolve-root.js';
import type { ProjectRequest, ProjectResolution } from '../subs/project/src/interfaces/project.js';
export function resolveProject(request: ProjectRequest, control: RunControl = {}): Promise<ProjectResolution> {
  return resolveProjectRoot(request, control.signal);
}
