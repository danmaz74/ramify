import { createHash, randomUUID } from 'node:crypto';
import type { CapturedInput } from '../../../../analysis/subs/project/src/interfaces/project.js';
import type { ContextId, ContextSelection, GenerationId, InputFingerprints, RevisionId } from './interfaces/contexts.js';

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/** Resolution owns canonicalization. Invocation facts never enter identity. */
export function createContextId(selection: ContextSelection): ContextId {
  return `ctx/1:${hash([selection.root, selection.scope, selection.configuration,
    selection.setup.registry, [...selection.setup.capabilities].sort()])}`;
}

export function createGenerationId(): GenerationId {
  return `gen/1:${randomUUID()}`;
}

export function createRevisionId(generation: GenerationId, sequence: number): RevisionId {
  if (!/^gen\/1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(generation)) {
    throw new Error('Revision requires a generation UUID');
  }
  if (!Number.isSafeInteger(sequence) || sequence < 1) throw new RangeError('Revision sequence must be a positive safe integer');
  return `rev/1:${generation.slice('gen/1:'.length)}:${sequence}`;
}

/** Hash detached observations only; this helper never acquires project inputs. */
export function createFingerprints(inputId: string, inputs: readonly CapturedInput[],
  registryIdentity: string, engine: string): InputFingerprints {
  // Explicit tuples remove property insertion order and locale dependencies.
  const observations = inputs.map(input => [input.path, input.role, input.sha256, input.bytes] as const)
    .sort((left, right) => {
      const a = JSON.stringify(left);
      const b = JSON.stringify(right);
      return a < b ? -1 : a > b ? 1 : 0;
    });
  return Object.freeze({
    inputId,
    declarations: hash(observations.filter(input => input[1] === 'description')),
    source: hash(observations.filter(input => ['source', 'resource', 'dependency', 'directory', 'absent'].includes(input[1]))),
    configuration: hash(observations.filter(input => input[1] === 'configuration')),
    registry: hash(registryIdentity),
    engine: hash(engine),
  });
}
