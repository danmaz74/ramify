import { createHash } from 'node:crypto';
import { relative, isAbsolute } from 'node:path';
import type { ProjectIssue } from './interfaces/project.js';

export const byteOrder = (a: string, b: string): number => Buffer.compare(Buffer.from(a), Buffer.from(b));
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
export class Cancelled extends Error {}
export const missing = (error: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '');
