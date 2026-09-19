import { posix } from 'node:path';
import type { MaterializeViewId, ServiceError, ServiceOperation } from '../../../src/interfaces/service.js';

const operations: ReadonlySet<string> = new Set<ServiceOperation>([
  'openContext', 'contextStatus', 'check', 'subscribe', 'unsubscribe', 'closeContext', 'daemonStatus', 'stopDaemon', 'materialize',
  'measure', 'explorerDetails', 'dependencyDiagram',
]);
const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const contextId = /^ctx\/1:[0-9a-f]{64}$/;
const generationId = new RegExp(`^gen/1:${uuid}$`);
const revisionId = new RegExp(`^rev/1:${uuid}:[1-9][0-9]*$`);
const requestId = /^[\x20-\x7e]{1,128}$/;
const sha256 = /^[0-9a-f]{64}$/;

/** Plain own data only: direct callers must not gain semantics JSON cannot carry. */
function record(value: unknown, required: readonly string[], optional: readonly string[] = []): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return required.every(key => Object.hasOwn(descriptors, key))
    && Reflect.ownKeys(descriptors).every(key => typeof key === 'string'
      && (required.includes(key) || optional.includes(key))
      && 'value' in descriptors[key] && descriptors[key].enumerable);
}

function array(value: unknown, item: (value: unknown) => boolean, maximum = Infinity): value is readonly unknown[] {
  if (!Array.isArray(value) || value.length > maximum || Reflect.ownKeys(value).length !== value.length + 1) return false;
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable || !item(descriptor.value)) return false;
  }
  return true;
}

function text(value: unknown): value is string { return typeof value === 'string'; }
function nonempty(value: unknown): value is string { return text(value) && value.length > 0; }
function matches(value: unknown, expression: RegExp): boolean { return text(value) && value.match(expression)?.[0] === value; }
function canonicalText(value: unknown): value is string {
  return nonempty(value) && !/[\u0000-\u001f\u007f\uD800-\uDFFF]/u.test(value);
}
function canonicalPath(value: unknown): value is string {
  return canonicalText(value) && !value.includes('\\') && !/^[a-zA-Z][a-zA-Z\d+.-]*:/.test(value)
    && value.split('/').every(part => part !== '' && part !== '.' && part !== '..');
}
function moduleId(value: unknown): value is string {
  return text(value) && value.split('/').every(part => /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(part));
}

function token(value: unknown): boolean {
  return record(value, ['context', 'generation'])
    && matches(value.context, contextId) && matches(value.generation, generationId);
}

function project(value: unknown): boolean {
  return record(value, ['cwd', 'scope', 'configuration'], ['root']) && nonempty(value.cwd)
    && (!Object.hasOwn(value, 'root') || nonempty(value.root))
    && value.scope === 'whole-project' && value.configuration === 'discover';
}

function setup(value: unknown): boolean {
  // Unsupported registry and capability names are domain outcomes, not shape errors.
  return record(value, ['registry', 'capabilities']) && text(value.registry) && array(value.capabilities, text);
}

function freshness(value: unknown): boolean {
  if (record(value, ['mode', 'wait'], ['revision']) && value.mode === 'published') {
    return typeof value.wait === 'boolean'
      && (!Object.hasOwn(value, 'revision') || matches(value.revision, revisionId));
  }
  if (!record(value, ['mode', 'expect']) || value.mode !== 'synchronized') return false;
  const paths = new Set<string>();
  return array(value.expect, entry => {
    if (!record(entry, ['path', 'sha256']) || !nonempty(entry.path)
      || entry.path.includes('\\') || entry.path.includes('\0') || posix.isAbsolute(entry.path)
      || posix.normalize(entry.path) !== entry.path || entry.path === '.' || entry.path === '..'
      || entry.path.startsWith('../') || paths.has(entry.path)
      || !(entry.sha256 === null || matches(entry.sha256, sha256))) return false;
    paths.add(entry.path);
    return true;
  }, 10_000);
}

/** A canonical project-relative path (`/`-separated, no leading/trailing slash,
 * no empty/`.`/`..` segment), or the literal `.` selecting the project root
 * itself. Mirrors `analysis`'s own local `canonicalPath` check (that helper is
 * not exposed outside its owner) plus the `.` exception `resolveModules` grants. */
function fromPath(value: unknown): value is string {
  if (!nonempty(value) || value.includes('\\') || value.includes('\0')) return false;
  if (value === '.') return true;
  if (value.startsWith('/') || value.endsWith('/')) return false;
  return value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..');
}

function selection(value: unknown): boolean {
  if (record(value, ['scope']) && value.scope === 'all') return true;
  return record(value, ['scope', 'from']) && value.scope === 'module' && fromPath(value.from);
}

function original(value: unknown): boolean {
  return record(value, ['kind', 'owner', 'file', 'binding'])
    && (value.kind === 'code' || value.kind === 'resource')
    && moduleId(value.owner) && canonicalPath(value.file) && canonicalText(value.binding);
}

function detailRequest(value: unknown): boolean {
  return record(value, ['original', 'exportName']) && original(value.original)
    && canonicalText(value.exportName);
}

const viewIds: ReadonlySet<string> = new Set<MaterializeViewId>(['api', 'architect']);
/** `MaterializeParams.views`: a non-empty list of distinct known view identifiers. */
function views(value: unknown): boolean {
  return array(value, item => text(item) && viewIds.has(item), viewIds.size) && value.length > 0
    && new Set(value).size === value.length;
}

/** `MaterializeParams.freshness` is always synchronized: a materialize
 * request never uses `published` freshness or a `since` baseline. */
function synchronizedFreshness(value: unknown): boolean {
  return freshness(value) && record(value, ['mode', 'expect']) && value.mode === 'synchronized';
}

/** Shared structural validation before dispatch to the real context manager. */
export function validateServiceRequest(operation: unknown, params: unknown): ServiceError | null {
  if (!text(operation) || !operations.has(operation)) {
    return { code: 'unsupported-operation', message: 'Unsupported service operation', details: {} };
  }
  let valid = false;
  try {
    switch (operation) {
      case 'openContext': valid = record(params, ['project', 'setup']) && project(params.project) && setup(params.setup); break;
      case 'contextStatus':
      case 'subscribe':
      case 'closeContext': valid = record(params, ['token']) && token(params.token); break;
      case 'check': valid = record(params, ['token', 'requestId', 'freshness'], ['scope', 'since', 'deadlineMs']) && token(params.token)
        && matches(params.requestId, requestId) && freshness(params.freshness)
        && (!Object.hasOwn(params, 'scope') || params.scope === 'report' || params.scope === 'delta')
        && (!Object.hasOwn(params, 'since') || matches(params.since, revisionId))
        && (!Object.hasOwn(params, 'deadlineMs') || (typeof params.deadlineMs === 'number'
          && Number.isSafeInteger(params.deadlineMs) && params.deadlineMs > 0 && params.deadlineMs <= 600_000)); break;
      case 'materialize': valid = record(params, ['token', 'requestId', 'freshness', 'selection'], ['deadlineMs', 'views']) && token(params.token)
        && matches(params.requestId, requestId) && synchronizedFreshness(params.freshness) && selection(params.selection)
        && (!Object.hasOwn(params, 'views') || views(params.views))
        && (!Object.hasOwn(params, 'deadlineMs') || (typeof params.deadlineMs === 'number'
          && Number.isSafeInteger(params.deadlineMs) && params.deadlineMs > 0 && params.deadlineMs <= 600_000)); break;
      case 'measure': valid = record(params, ['token', 'requestId', 'freshness'], ['deadlineMs']) && token(params.token)
        && matches(params.requestId, requestId) && synchronizedFreshness(params.freshness)
        && (!Object.hasOwn(params, 'deadlineMs') || (typeof params.deadlineMs === 'number'
          && Number.isSafeInteger(params.deadlineMs) && params.deadlineMs > 0 && params.deadlineMs <= 600_000)); break;
      case 'explorerDetails': {
        if (!record(params, ['token', 'requestId', 'revision', 'requests']) || !token(params.token)
          || !matches(params.requestId, requestId) || !matches(params.revision, revisionId)
          || !array(params.requests, detailRequest, 10_000)) break;
        const unique = new Set((params.requests as readonly { readonly original: {
          readonly kind: string; readonly owner: string; readonly file: string; readonly binding: string;
        }; readonly exportName: string }[]).map(item => JSON.stringify([
          item.original.kind, item.original.owner, item.original.file, item.original.binding, item.exportName,
        ])));
        valid = unique.size <= 50;
        break;
      }
      case 'dependencyDiagram': valid = record(params, ['token', 'requestId', 'revision']) && token(params.token)
        && matches(params.requestId, requestId) && matches(params.revision, revisionId); break;
      case 'unsubscribe': valid = record(params, ['subscription']) && nonempty(params.subscription); break;
      case 'daemonStatus': valid = record(params, []); break;
      case 'stopDaemon': valid = record(params, ['instanceId']) && nonempty(params.instanceId); break;
    }
  } catch {
    // A throwing proxy is not wire data and must not escape boundary validation.
    valid = false;
  }
  return valid ? null : { code: 'invalid-request', message: `Invalid parameters for ${operation}`, details: { operation } };
}
