import { createHash } from 'node:crypto';
import { relative, isAbsolute } from 'node:path';
import type { ProjectIssue } from './interfaces/project.js';

/**
 * UTF-8 byte order without encoding either string. UTF-8 preserves scalar
 * order and no scalar's encoding prefixes another's, so comparing scalars
 * orders exactly as `Buffer.compare` over `Buffer.from` does. Code-unit order
 * would not: a surrogate pair sorts below U+E000-U+FFFF there. `Buffer.from`
 * encodes a lone surrogate as U+FFFD, so it compares as U+FFFD here too.
 */
export function byteOrder(a: string, b: string): number {
  if (a === b) return 0;
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const x = a.charCodeAt(i), y = b.charCodeAt(j);
    if (x === y && (x < 0xd800 || x > 0xdfff)) { i++; j++; continue; }
    const p = scalar(a, i), q = scalar(b, j);
    if (p !== q) return p < q ? -1 : 1;
    i += p > 0xffff ? 2 : 1; j += q > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : j < b.length ? -1 : 0;
}
/** The scalar value `Buffer.from` encodes at one code unit. */
function scalar(text: string, index: number): number {
  const unit = text.charCodeAt(index);
  if (unit < 0xd800 || unit > 0xdfff) return unit;
  if (unit <= 0xdbff && index + 1 < text.length) {
    const low = text.charCodeAt(index + 1);
    if (low >= 0xdc00 && low <= 0xdfff) return 0x10000 + ((unit - 0xd800) << 10) + (low - 0xdc00);
  }
  return 0xfffd;
}
export const hash = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
export function within(parent: string, path: string): boolean {
  const tail = relative(parent, path);
  return tail === '' || (tail !== '..' && !tail.startsWith('../') && !isAbsolute(tail));
}
export function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
export class AcquisitionError extends Error {
  constructor(readonly code: ProjectIssue['code'], readonly path: string, message: string) {
    super(message);
  }
}
/** An acquisition its operation's signal stopped. Session code recognises it by name. */
export class Cancelled extends Error {
  override readonly name = 'Cancelled';
  constructor() { super('Acquisition was cancelled'); }
}
export const missing = (error: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');
