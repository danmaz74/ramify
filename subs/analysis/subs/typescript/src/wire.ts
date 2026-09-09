import type { SourceAnalysisInputs } from './interfaces/source.js';

/** Private, bounded protocol vocabulary. No compiler values cross this wire. */
export type HelperInputs = Pick<SourceAnalysisInputs, 'inventory' | 'areas' | 'limits'>;
export const FRAME_BYTES = 1024 * 1024;
export const CHUNK_BYTES = 192 * 1024;
export const FILE_BYTES = 8 * 1024 * 1024;
// JSON may escape each captured control byte as six ASCII bytes. This limit
// applies to read transport only; completed catalogs have their smaller cap.
export const READ_RESPONSE_BYTES = FILE_BYTES * 6 + 2;
export const RESULT_BYTES = 32 * 1024 * 1024 - 64 * 1024;
export const INPUT_BYTES = 256 * 1024 * 1024;
export const DISPOSAL_MS = 5000;
export type Operation = 'ready' | 'catalog' | 'accesses' | 'dispose';

export class SourceFailure extends Error {
  constructor(readonly code: string, message: string, readonly path?: string) { super(message); this.name = 'SourceAnalysisError'; }
}

/** Account JSON string escaping before constructing its encoded copy. */
function stringBytes(value: string): number {
  let bytes = Buffer.byteLength(value) + 2;
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code === 34 || code === 92) bytes++;
    else if (code < 32) bytes += code === 8 || code === 9 || code === 10 || code === 12 || code === 13 ? 1 : 5;
    else if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) index++;
      else bytes += 3;
    } else if (code >= 0xdc00 && code <= 0xdfff) bytes += 3;
  }
  return bytes;
}

/** Count the complete plain-data representation before allocating serialized bytes. */
export function encode(value: unknown, budget: number): Buffer {
  let size = 0;
  const admit = (bytes: number) => {
    size += bytes;
    if (size > budget) throw new SourceFailure('resource-limit', `Source transfer exceeds ${budget} encoded bytes`);
  };
  const count = (item: unknown, depth: number): void => {
    if (depth > 1024) throw new SourceFailure('resource-limit', 'Source transfer nesting limit exceeded');
    if (item === null) { admit(4); return; }
    switch (typeof item) {
      case 'string': admit(stringBytes(item)); return;
      case 'boolean': admit(item ? 4 : 5); return;
      case 'number':
        if (!Number.isFinite(item)) throw new SourceFailure('protocol-error', 'Nonfinite source wire number');
        admit(String(item).length); return;
      case 'object': {
        if (Array.isArray(item)) {
          admit(2 + Math.max(0, item.length - 1));
          for (const child of item) count(child, depth + 1);
          return;
        }
        if (Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) {
          throw new SourceFailure('protocol-error', 'Source wire accepts plain records only');
        }
        const entries = Object.entries(item).filter(([, child]) => child !== undefined);
        admit(2 + Math.max(0, entries.length - 1));
        for (const [key, child] of entries) { admit(stringBytes(key) + 1); count(child, depth + 1); }
        return;
      }
      default: throw new SourceFailure('protocol-error', 'Non-data source wire value');
    }
  };
  count(value, 0);
  const result = Buffer.from(JSON.stringify(value));
  if (result.length > budget) throw new SourceFailure('resource-limit', 'Source transfer byte limit exceeded');
  return result;
}

export function decodeChunk(value: unknown): Buffer {
  if (typeof value !== 'string' || value.length > Math.ceil(CHUNK_BYTES / 3) * 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new SourceFailure('protocol-error', 'Invalid source transfer chunk');
  }
  return Buffer.from(value, 'base64');
}

export function freezeData<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeData(child);
    Object.freeze(value);
  }
  return value;
}
