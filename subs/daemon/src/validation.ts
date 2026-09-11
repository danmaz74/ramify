import { posix } from 'node:path';
import type { ServiceError, ServiceOperation } from '../../../src/interfaces/service.js';

const operations: ReadonlySet<string> = new Set<ServiceOperation>([
  'openContext', 'contextStatus', 'check', 'subscribe', 'unsubscribe', 'closeContext', 'daemonStatus', 'stopDaemon',
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
      case 'check': valid = record(params, ['token', 'requestId', 'freshness']) && token(params.token)
        && matches(params.requestId, requestId) && freshness(params.freshness); break;
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
