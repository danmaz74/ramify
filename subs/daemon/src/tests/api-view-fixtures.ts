import type {
  ApiViewAreaProjection, ApiViewEntry, ApiViewFile, ApiViewModuleProjection, ApiViewProjection,
} from '../../../analysis/src/interfaces/session.js';
import type { SymbolDetail } from '../../../analysis/subs/typescript/src/interfaces/source.js';

/** Small, independently readable builders for `ApiViewProjection` test data,
 * shared by the renderer tests, the publisher tests, the crash-recovery
 * child-process fixture and the reference harness's I2A-06/I2A-07 handlers. */

export function original(owner: string, file: string, binding: string) {
  return { kind: 'code' as const, owner, file, binding };
}
export function described(name: string, signature: string, documentation?: string): SymbolDetail {
  return documentation === undefined
    ? { state: 'described', original: original('m', 'f.ts', name), exportName: name, signature }
    : { state: 'described', original: original('m', 'f.ts', name), exportName: name, signature, documentation };
}
export function truncated(name: string, signature: string): SymbolDetail {
  return { state: 'truncated', original: original('m', 'f.ts', name), exportName: name, signature, truncated: ['signature'] };
}
export function unavailable(name: string): SymbolDetail {
  return { state: 'unavailable', original: original('m', 'f.ts', name), exportName: name, reason: 'unsupported-declaration' };
}
export function entry(name: string, form: ApiViewEntry['form'], detail: SymbolDetail): ApiViewEntry {
  return { name, form, detail };
}
export function file(category: ApiViewFile['category'], definingFile: string, entries: readonly ApiViewEntry[]): ApiViewFile {
  return { category, definingFile, entries };
}
export function area(kind: 'ordinary' | 'tests', root: string, files: readonly ApiViewFile[],
  extra: Partial<Pick<ApiViewAreaProjection, 'coverage' | 'detailsUnavailable' | 'truncated'>> = {}): ApiViewAreaProjection {
  return { area: kind, root, files, coverage: 0, detailsUnavailable: 0, truncated: 0, ...extra };
}
export function moduleProjection(id: string, directory: string, ordinary: ApiViewAreaProjection | null, tests: ApiViewAreaProjection | null = null): ApiViewModuleProjection {
  return { module: id, directory, ordinary, tests };
}
export function projection(modules: readonly ApiViewModuleProjection[], sequence = 1, inputId = 'input-1'): ApiViewProjection {
  return { schema: 'ramify.api-view-projection/1', sequence, inputId, modules, bytes: 0 };
}
