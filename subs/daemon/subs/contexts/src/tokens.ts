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

const shortEscapes: Readonly<Record<number, number>> = { 8: 0x62, 9: 0x74, 10: 0x6e, 12: 0x66, 13: 0x72 };
const isHigh = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const isLow = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;
/** The `JSON.stringify` encoding of the code unit at `index`, or of the closing quote past
 * the end, as one number ordered as the encodings compare. No encoding is a proper
 * prefix of another, so the first differing encoding decides the order. */
function encodedUnit(value: string, index: number): number {
  const lead = 2 ** 32, second = 2 ** 16;
  if (index >= value.length) return 0x22 * lead;
  const unit = value.charCodeAt(index);
  if (unit === 0x22 || unit === 0x5c) return 0x5c * lead + unit * second;
  if (unit < 0x20) return 0x5c * lead + (shortEscapes[unit] ?? 0x75) * second + (shortEscapes[unit] ? 0 : unit);
  if ((isHigh(unit) && !isLow(value.charCodeAt(index + 1))) || (isLow(unit) && !isHigh(value.charCodeAt(index - 1)))) {
    return 0x5c * lead + 0x75 * second + unit;
  }
  return unit * lead;
}
/** Orders two strings as their `JSON.stringify` encodings, closing quote included, compare. */
function compareEncoded(left: string, right: string): number {
  if (left === right) return 0;
  for (let index = 0; ; index++) {
    const a = left.charCodeAt(index);
    // Equal units outside the surrogate range encode alike; paired surrogates depend on neighbours.
    if (a === right.charCodeAt(index) && (a < 0xd800 || a > 0xdfff)) continue;
    const x = encodedUnit(left, index), y = encodedUnit(right, index);
    if (x !== y) return x < y ? -1 : 1;
    if (index >= left.length) return 0;
  }
}
const encodedNumber = (value: number) => `${Number.isFinite(value) ? String(value) : 'null'}]`;
type Observation = readonly [string, CapturedInput['role'], string, number];
/** The order of the tuples' `JSON.stringify` texts, without serializing them. */
function compareObservations(left: Observation, right: Observation): number {
  const order = compareEncoded(left[0], right[0]) || compareEncoded(left[1], right[1]) || compareEncoded(left[2], right[2]);
  if (order || left[3] === right[3]) return order;
  const a = encodedNumber(left[3]), b = encodedNumber(right[3]);
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Hash detached observations only; this helper never acquires project inputs. */
export function createFingerprints(inputId: string, inputs: readonly CapturedInput[],
  registryIdentity: string, engine: string): InputFingerprints {
  // Explicit tuples remove property insertion order and locale dependencies.
  const observations = inputs.map((input): Observation => [input.path, input.role, input.sha256, input.bytes])
    .sort(compareObservations);
  return Object.freeze({
    inputId,
    declarations: hash(observations.filter(input => input[1] === 'description')),
    source: hash(observations.filter(input => ['source', 'resource', 'dependency', 'directory', 'absent'].includes(input[1]))),
    configuration: hash(observations.filter(input => input[1] === 'configuration')),
    registry: hash(registryIdentity),
    engine: hash(engine),
  });
}
