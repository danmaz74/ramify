import type { ModuleId, OriginalId } from './interfaces/model.js';
import { isRecord, namePattern, validPath, validText } from './data.js';

export function validModuleId(id: unknown): id is ModuleId {
  return typeof id === 'string' && id.split('/').every((name) => namePattern.test(name));
}

export function validOriginalId(id: unknown): id is OriginalId {
  return isRecord(id) && (id.kind === 'code' || id.kind === 'resource')
    && validModuleId(id.owner) && validPath(id.file) && validText(id.binding);
}

export function originalKey(id: OriginalId): string {
  if (!validOriginalId(id)) throw new TypeError('Invalid canonical original identity');
  return JSON.stringify([id.kind, id.owner, id.file, id.binding]);
}
