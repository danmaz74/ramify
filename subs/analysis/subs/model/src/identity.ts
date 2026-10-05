import type { ModuleId, OriginalId } from './interfaces/model.js';
import { isRecord, namePattern, validPath, validText } from './data.js';

export function validModuleId(id: unknown): id is ModuleId {
  return typeof id === 'string' && id.split('/').every((name) => namePattern.test(name));
}

/**
 * An original's file is relative to its owner's ordinary `src/`. A file
 * beneath `src/` is a plain relative path; a file of auxiliary source, outside
 * `src/` but inside the owner's directory, has exactly one leading `../` and
 * never names `src/` again, so each file has one spelling.
 */
export function validOriginalFile(file: unknown): file is string {
  if (typeof file !== 'string') return false;
  if (!file.startsWith('../')) return validPath(file);
  const rest = file.slice(3);
  return validPath(rest) && rest !== 'src' && !rest.startsWith('src/');
}

/** Whether an original's file lies outside its owner's `src/`, in auxiliary source. */
export const auxiliaryOriginalFile = (file: string): boolean => file.startsWith('../');

/** The project-relative path of an original's file, from its owner's ordinary source root. */
export function originalSourcePath(ordinaryRoot: string, file: string): string {
  if (!auxiliaryOriginalFile(file)) return `${ordinaryRoot}/${file}`;
  const directory = ordinaryRoot === 'src' ? '' : ordinaryRoot.slice(0, -'/src'.length);
  return directory ? `${directory}/${file.slice(3)}` : file.slice(3);
}

export function validOriginalId(id: unknown): id is OriginalId {
  return isRecord(id) && (id.kind === 'code' || id.kind === 'resource')
    && validModuleId(id.owner) && validOriginalFile(id.file) && validText(id.binding);
}

export function originalKey(id: OriginalId): string {
  if (!validOriginalId(id)) throw new TypeError('Invalid canonical original identity');
  return JSON.stringify([id.kind, id.owner, id.file, id.binding]);
}
