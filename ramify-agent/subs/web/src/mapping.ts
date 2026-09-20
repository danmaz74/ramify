import type { JobState } from '../../harness/src/interfaces/protocol/jobs.js';
import type { MappingState } from '../../harness/src/interfaces/protocol/queries.js';

/** The label of a job's state. */
export function jobStateLabel(state: JobState): string {
  switch (state) {
    case 'running': return 'Mapping';
    case 'completed': return 'Mapped';
    case 'failed': return 'Mapping failed';
    case 'stopped': return 'Mapping stopped';
    case 'interrupted': return 'Mapping interrupted';
  }
}

/** A map revision as its file names it: `001`. */
export function revisionLabel(revision: number): string {
  return String(revision).padStart(3, '0');
}

/** The label of a plan's latest mapping state. */
export function mappingLabel(mapping: MappingState): string {
  if (mapping.state === 'not-mapped') return 'Not mapped';
  const label = mapping.state === 'running' ? 'Mapping…' : jobStateLabel(mapping.state);
  if (mapping.state === 'completed' && mapping.latestRevision !== null) return `${label} (revision ${revisionLabel(mapping.latestRevision)})`;
  return mapping.state !== 'completed' && mapping.latestRevision !== null ? `${label}; revision ${revisionLabel(mapping.latestRevision)} saved` : label;
}
