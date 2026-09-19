import { setImmediate as yieldImmediate } from 'node:timers/promises';
import type { RunControl } from '../../analysis/src/interfaces/analysis.js';

/** Normative, self-contained path attribution carried by every measure document. */
export const measurementOwnershipRule = [
  'Normalize the path within root; malformed paths and escapes are not attributable.',
  '1. A reserved generated segment is generated before area or owner lookup: .ramify, .ramify-architect, and their .tmp-<suffix>/.old-<suffix> siblings at any depth, including sibling marker files. Similar names are not reserved.',
  '2. A path in files is inventoried with exactly its recorded owner, area, kind, and bytes. A path in outsideModuleFiles is outside the owned inventory and has no owner.',
  '3. An unlisted path beneath .git, node_modules, bower_components, or jspm_packages is excluded.',
  '4. Every other unlisted path is unobserved. Its nearest listed module supplies only a provisional owner/area beneath that module\'s src/ (src/tests/ first) or at its root README.md/module.ramify; never climb to an ancestor source area when the nearest module does not own the location.',
  'Configured output exclusions, independent compiler scopes, invalid boundaries, and symlink observations are not fully encoded. Unobserved spelling proves neither inventory membership, ownership, area, emptiness, nor project exclusion; no symlink following is implied. Refreshing the inventory can establish a new file.',
].join('\n');

export type JsonByteCount =
  | { readonly status: 'within'; readonly bytes: number }
  | { readonly status: 'exceeded'; readonly bytes: number }
  | { readonly status: 'cancelled' }
  | { readonly status: 'superseded' };

const yieldRecords = 256;
const yieldBytes = 1024 ** 2;

/** Count JSON's exact escaped UTF-8 bytes without allocating the complete encoding.
 * Work is interruptible between values and after bounded array batches. */
export async function countJsonBytesBounded(value: unknown, maximumBytes: number,
  control: RunControl | undefined, current: () => boolean): Promise<JsonByteCount> {
  let bytes = 0, records = 0, bytesAtYield = 0;
  const add = (count: number): boolean => { bytes += count; return bytes <= maximumBytes; };
  const stopped = (): JsonByteCount | null => control?.signal?.aborted ? { status: 'cancelled' }
    : !current() ? { status: 'superseded' } : null;
  const pause = async (): Promise<JsonByteCount | null> => {
    const stop = stopped();
    if (stop) return stop;
    if (records < yieldRecords && bytes - bytesAtYield < yieldBytes) return null;
    records = 0; bytesAtYield = bytes;
    await yieldImmediate();
    return stopped();
  };
  const visit = async (item: unknown): Promise<JsonByteCount | null> => {
    const stop = stopped();
    if (stop) return stop;
    if (item === null || typeof item !== 'object') {
      const encoded = JSON.stringify(item);
      if (encoded === undefined) throw new Error('Measure response contains a non-JSON value');
      return add(Buffer.byteLength(encoded, 'utf8')) ? null : { status: 'exceeded', bytes };
    }
    if (Array.isArray(item)) {
      if (!add(1)) return { status: 'exceeded', bytes };
      for (let index = 0; index < item.length; index++) {
        if (index && !add(1)) return { status: 'exceeded', bytes };
        const nested = await visit(item[index]);
        if (nested) return nested;
        records++;
        const paused = await pause();
        if (paused) return paused;
      }
      return add(1) ? null : { status: 'exceeded', bytes };
    }
    if (!add(1)) return { status: 'exceeded', bytes };
    let emitted = 0;
    for (const key of Object.keys(item as object)) {
      const nestedValue = (item as Record<string, unknown>)[key];
      if (nestedValue === undefined || typeof nestedValue === 'function' || typeof nestedValue === 'symbol') continue;
      if (emitted++ && !add(1)) return { status: 'exceeded', bytes };
      if (!add(Buffer.byteLength(JSON.stringify(key), 'utf8') + 1)) return { status: 'exceeded', bytes };
      const nested = await visit(nestedValue);
      if (nested) return nested;
    }
    return add(1) ? null : { status: 'exceeded', bytes };
  };
  const outcome = await visit(value);
  if (outcome) return outcome;
  return { status: 'within', bytes };
}
