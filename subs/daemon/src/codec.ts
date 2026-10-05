// Private byte framing only. The future message codec validates the value as
// WireMessage; JSON syntax alone never establishes the service schema.
function validLimit(maximumBytes: number): void {
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 || maximumBytes > 0xffff_ffff) {
    throw new Error('Invalid frame payload limit');
  }
}

function payloadLength(header: Uint8Array, maximumBytes: number): number {
  const length = new DataView(header.buffer, header.byteOffset, 4).getUint32(0, false);
  if (!length) throw new Error('Zero-length frame');
  if (length > maximumBytes) throw new Error(`Frame payload exceeds ${maximumBytes} bytes`);
  return length;
}

function parsePayload(payload: Uint8Array): unknown {
  // Preserve a BOM as a character so JSON parsing rejects it instead of the
  // decoder silently accepting a non-JSON prefix.
  const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload);
  return JSON.parse(json) as unknown;
}

export function encodeJsonFrame(value: unknown, maximumBytes: number): Uint8Array {
  validLimit(maximumBytes);
  const json = JSON.stringify(value);
  if (json === undefined) throw new Error('Frame payload is not JSON');
  const length = Buffer.byteLength(json, 'utf8');
  if (length > maximumBytes) throw new Error(`Frame payload exceeds ${maximumBytes} bytes`);
  const frame = Buffer.allocUnsafe(4 + length);
  frame.writeUInt32BE(length, 0);
  frame.write(json, 4, length, 'utf8');
  return frame;
}

export function decodeJsonFrame(frame: Uint8Array, maximumBytes: number): unknown {
  validLimit(maximumBytes);
  if (frame.byteLength < 4) throw new Error('Truncated frame header');
  const length = payloadLength(frame, maximumBytes);
  if (frame.byteLength !== length + 4) throw new Error('Frame length does not match its payload');
  return parsePayload(frame.subarray(4));
}

interface FrameDecoder {
  setMaximumBytes(bytes: number): void;
  push(bytes: Uint8Array): void;
  finish(): void;
  dispose(): void;
}

/** Deliver one JSON value at a time, retaining at most one bounded body and
 * four header bytes. No array of complete messages accumulates in the decoder.
 * The socket owner must send a failure goodbye and close when this throws. */
export function createFrameDecoder(maximumBytes: number, receive: (value: unknown) => void): FrameDecoder {
  validLimit(maximumBytes);
  const header = new Uint8Array(4);
  let headerBytes = 0;
  let body: Uint8Array | null = null;
  let bodyBytes = 0;
  let listener: ((value: unknown) => void) | null = receive;
  let delivering = false;

  function dispose(): void {
    listener = null;
    body = null;
    bodyBytes = 0;
    headerBytes = 0;
  }

  return {
    setMaximumBytes(bytes) { validLimit(bytes); maximumBytes = bytes; },
    push(bytes) {
      if (!listener) throw new Error('Frame decoder is closed');
      if (delivering) throw new Error('Reentrant frame delivery');
      delivering = true;
      try {
        let offset = 0;
        while (offset < bytes.byteLength && listener) {
          if (headerBytes < 4) {
            const count = Math.min(4 - headerBytes, bytes.byteLength - offset);
            header.set(bytes.subarray(offset, offset + count), headerBytes);
            headerBytes += count;
            offset += count;
            if (headerBytes < 4) continue;
            // Reject bad lengths before allocating or waiting for body bytes.
            body = new Uint8Array(payloadLength(header, maximumBytes));
          }
          const count = Math.min(body!.byteLength - bodyBytes, bytes.byteLength - offset);
          body!.set(bytes.subarray(offset, offset + count), bodyBytes);
          bodyBytes += count;
          offset += count;
          if (bodyBytes === body!.byteLength) {
            const value = parsePayload(body!);
            body = null;
            bodyBytes = 0;
            headerBytes = 0;
            listener(value);
          }
        }
      } catch (error) {
        dispose();
        throw error;
      } finally { delivering = false; }
    },
    finish() {
      const incomplete = headerBytes !== 0;
      dispose();
      if (incomplete) throw new Error('Truncated frame at end of stream');
    },
    dispose,
  };
}

import { posix } from 'node:path';
import type { WireMessage } from './interfaces/daemon.js';

// A bounded codec ceiling; negotiated response and outbound limits remain stricter.
const maximumMessageBytes = 128 * 1024 * 1024;
function shape(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}
function string(value: unknown): value is string { return typeof value === 'string'; }
function id(value: unknown): value is string { return string(value) && /^[\x20-\x7e]{1,128}$/.test(value); }
function integer(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function instance(value: unknown): boolean {
  return shape(value, ['instanceId', 'pid', 'version', 'engine', 'buildKey']) && id(value.instanceId)
    && integer(value.pid) && value.pid > 0 && string(value.version) && string(value.engine) && string(value.buildKey);
}
function error(value: unknown): boolean {
  return shape(value, ['code', 'message', 'details']) && [
    'invalid-request', 'unsupported-operation', 'unknown-context', 'expired-generation', 'resource-unavailable',
    'unknown-subscription', 'wrong-instance', 'stopping', 'cancelled', 'internal-error', 'incompatible',
  ].includes(value.code as string) && string(value.message) && value.details !== null
    && typeof value.details === 'object' && !Array.isArray(value.details)
    && Object.values(value.details).every(item => item === null || ['string', 'boolean'].includes(typeof item)
      || typeof item === 'number' && Number.isFinite(item));
}
function reason(input: unknown): boolean {
  const value = input as Record<string, unknown>;
  if (!value || typeof value !== 'object' || !('kind' in value)) return false;
  switch (value.kind) {
    case 'idle-exit': case 'slow-consumer': case 'closed': return shape(value, ['kind']);
    case 'explicit-stop': return shape(value, ['kind', 'requestId']) && (value.requestId === null || id(value.requestId));
    case 'failure': return shape(value, ['kind', 'message']) && string(value.message);
    case 'incompatible': return shape(value, ['kind', 'daemon', 'client']) && string(value.daemon) && string(value.client);
    case 'rejected': return shape(value, ['kind', 'code', 'message']) && error({ code: value.code, message: value.message, details: {} });
    default: return false;
  }
}
function token(value: unknown): boolean {
  return shape(value, ['context', 'generation']) && string(value.context) && /^ctx\/1:[0-9a-f]{64}$/.test(value.context)
    && string(value.generation) && /^gen\/1:[0-9a-f-]{36}$/.test(value.generation);
}
function strings(value: unknown): value is readonly string[] { return Array.isArray(value) && value.every(string); }
function selection(value: unknown): boolean {
  return shape(value, ['root', 'scope', 'configuration', 'setup']) && string(value.root) && value.scope === 'whole-project'
    && value.configuration === 'discover' && shape(value.setup, ['registry', 'capabilities']) && string(value.setup.registry) && strings(value.setup.capabilities);
}
// Owned-ignored and scratch exclusions carry their owner; every other kind is unowned.
const ownedExclusions = ['owned-ignored', 'scratch'];
const unownedExclusions = ['external', 'repository', 'packages', 'output', 'generated'];
function exclusion(value: unknown): value is { readonly kind: string; readonly directory: string; readonly owner: string | null } {
  return shape(value, ['kind', 'directory', 'owner']) && string(value.directory)
    && (ownedExclusions.includes(value.kind as string) ? string(value.owner) : unownedExclusions.includes(value.kind as string) && value.owner === null);
}
function ownership(value: unknown): boolean {
  return shape(value, ['modules', 'exclusions']) && Array.isArray(value.modules) && value.modules.every(module =>
    shape(module, ['id', 'parent', 'directory']) && string(module.id) && (module.parent === null || string(module.parent)) && string(module.directory))
    && Array.isArray(value.exclusions) && value.exclusions.every(exclusion);
}
function scope(value: unknown): boolean {
  return value === null || shape(value, ['root', 'selection', 'invokedFrom', 'configuration', 'walkedAreas', 'ownership'])
    && string(value.root) && ['given', 'found'].includes(value.selection as string) && string(value.invokedFrom) && string(value.configuration)
    && strings(value.walkedAreas) && ownership(value.ownership);
}
function outcome(value: unknown): boolean {
  return shape(value, ['execution', 'check', 'coverage']) && ['completed', 'invalid', 'incomplete', 'unavailable'].includes(value.execution as string)
    && ['passed', 'failed', 'not-run'].includes(value.check as string) && ['complete', 'partial', 'not-run'].includes(value.coverage as string);
}
function summary(value: unknown): boolean {
  return shape(value, ['complete', 'owners', 'sourceFiles', 'resources', 'originals', 'accesses', 'allowed', 'denied', 'errors', 'warnings', 'coverageNotes', 'external'])
    && typeof value.complete === 'boolean' && Object.entries(value).every(([key, count]) => key === 'complete' || integer(count));
}
function timings(value: unknown): boolean {
  return shape(value, ['classify', 'inventory', 'compiler', 'descriptions', 'accesses', 'link', 'decide', 'companions', 'publish', 'total'])
    && Object.values(value).every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0);
}
function capture(value: unknown): boolean {
  return shape(value, ['invocationCheck', 'promotion', 'workerStatus', 'workerRoundTrip', 'sweep', 'watch'])
    && [value.invocationCheck, value.promotion, value.workerStatus, value.workerRoundTrip, value.sweep].every(item => typeof item === 'number' && Number.isFinite(item) && item >= 0)
    && (value.watch === null || shape(value.watch, ['receivedAt', 'flushedAt']) && integer(value.watch.receivedAt) && integer(value.watch.flushedAt));
}
function revision(value: unknown): boolean {
  return shape(value, ['token', 'revision', 'sequence', 'publishedAt', 'cause', 'fingerprints', 'changed', 'checked', 'delta', 'timings', 'capture', 'outcome', 'summary'])
    && token(value.token) && string(value.revision) && /^rev\/1:[0-9a-f-]{36}:[1-9][0-9]*$/.test(value.revision) && integer(value.sequence) && value.sequence > 0
    && integer(value.publishedAt) && ['open', 'watch', 'request', 'sweep', 'verify', 'conservative'].includes(value.cause as string)
    && shape(value.fingerprints, ['inputId', 'declarations', 'source', 'configuration', 'registry', 'engine'])
    && Object.values(value.fingerprints).every(string) && strings(value.changed)
    && shape(value.checked, ['path', 'files', 'accesses', 'modelRebuilt'])
    && ['cold', 'unchanged-surface', 'source', 'description', 'metadata', 'membership', 'broad'].includes(value.checked.path as string)
    && strings(value.checked.files) && integer(value.checked.accesses) && typeof value.checked.modelRebuilt === 'boolean'
    && shape(value.delta, ['added', 'removed', 'positionOnly']) && Object.values(value.delta).every(integer)
    && timings(value.timings) && capture(value.capture) && outcome(value.outcome) && summary(value.summary);
}
function sessionStatus(value: unknown): boolean {
  return value === null || shape(value, ['level', 'sequence', 'observedInputs', 'factBytes', 'worker', 'compiler', 'lastSweepAt'])
    && ['hot', 'warm'].includes(value.level as string) && integer(value.sequence) && integer(value.observedInputs) && integer(value.factBytes)
    && shape(value.worker, ['heapUsed', 'rss']) && Object.values(value.worker).every(integer)
    && shape(value.compiler, ['pid', 'rss']) && (value.compiler.pid === null || integer(value.compiler.pid))
    && (value.compiler.rss === null || integer(value.compiler.rss)) && (value.lastSweepAt === null || integer(value.lastSweepAt));
}
/** The active watcher's registrations: at most 20 distinct byte-ordered pruned directories. */
function registrations(value: unknown): boolean {
  if (value === null) return true;
  if (!shape(value, ['sequence', 'directories', 'pruned', 'prunedCount']) || !(value.sequence === null || integer(value.sequence) && value.sequence > 0)
    || !integer(value.directories) || !integer(value.prunedCount) || !strings(value.pruned) || value.pruned.length > 20
    || value.pruned.length > value.prunedCount || (value.pruned.length < 20 && value.pruned.length !== value.prunedCount)) return false;
  const pruned = value.pruned as readonly string[];
  return pruned.every((path, index) => path.length > 0 && (index === 0 || Buffer.compare(Buffer.from(pruned[index - 1]!), Buffer.from(path)) < 0));
}
function status(value: unknown): boolean {
  return shape(value, ['token', 'selection', 'scope', 'state', 'synchronization', 'published', 'lastValid', 'pending', 'history',
    'retainedBytes', 'leases', 'watcher', 'registrations', 'openedAt', 'lastActivityAt', 'level', 'session', 'demoting', 'unresponsiveSince'])
    && token(value.token) && selection(value.selection) && scope(value.scope)
    && ['opening', 'warm', 'cold', 'evicted'].includes(value.state as string)
    && ['hot', 'warm', 'cold'].includes(value.level as string) && sessionStatus(value.session)
    && ['initializing', 'synchronized', 'reconciling', 'conservative', 'watcher-unavailable'].includes(value.synchronization as string)
    && (value.published === null || revision(value.published)) && (value.lastValid === null || revision(value.lastValid))
    && integer(value.retainedBytes) && integer(value.openedAt) && integer(value.lastActivityAt)
    && shape(value.pending, ['requests', 'changedPaths', 'analysisRunning']) && integer(value.pending.requests)
    && integer(value.pending.changedPaths) && typeof value.pending.analysisRunning === 'boolean'
    && shape(value.leases, ['subscriptions', 'requests']) && Object.values(value.leases).every(integer)
    && shape(value.history, ['retained', 'bytes', 'oldest']) && integer(value.history.retained) && integer(value.history.bytes)
    && (value.history.oldest === null || string(value.history.oldest))
    && ['active', 'unavailable', 'disposed'].includes(value.watcher as string) && registrations(value.registrations)
    && (value.registrations === null) === (value.watcher !== 'active')
    && typeof value.demoting === 'boolean' && (value.unresponsiveSince === null || integer(value.unresponsiveSince));
}
function event(input: unknown): boolean {
  const value = input as Record<string, unknown>;
  if (!value || typeof value !== 'object' || !('type' in value)) return false;
  switch (value.type) {
    case 'revision-published': return shape(value, ['type', 'token', 'revision', 'coalesced']) && token(value.token)
      && revision(value.revision) && integer(value.coalesced);
    case 'status-changed': return shape(value, ['type', 'token', 'current', 'coalesced']) && token(value.token)
      && status(value.current) && integer(value.coalesced);
    case 'context-evicted': return shape(value, ['type', 'token', 'reason']) && token(value.token)
      && ['idle', 'pressure', 'disposed'].includes(value.reason as string);
    default: return false;
  }
}
function members(value: unknown, required: readonly string[], optional: readonly string[]): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key))
    && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
}
function duration(value: unknown): boolean { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function plain(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
const sha256 = /^[0-9a-f]{64}$/;
const revisionId = /^rev\/1:[0-9a-f-]{36}:[1-9][0-9]*$/;
/** A named path of a changed check: project-relative, `/`-separated, normalized, inside the root. */
function requestPath(value: unknown): value is string {
  return string(value) && value.length > 0 && !value.includes('\\') && !value.includes('\0') && !posix.isAbsolute(value)
    && posix.normalize(value) === value && value !== '.' && value !== '..' && !value.startsWith('../');
}
const notAnalyzedReasons: Readonly<Record<string, readonly string[]>> = {
  'owned-ignored': ['owned-ignored'], external: ['external'], scratch: ['scratch'], reserved: ['repository', 'packages', 'output', 'generated'],
};
/** One `PathCheckDisposition`: only a checked path carries an identity; a not-analyzed path's
 * reason agrees with its exclusion, whose owned kinds name a module and unowned kinds none. */
function disposition(input: unknown, classification: boolean): boolean {
  if (!plain(input)) return false;
  const value = input;
  if (!requestPath(value.path)) return false;
  switch (value.disposition) {
    case 'checked': return !classification && shape(value, ['path', 'disposition', 'module', 'exclusion', 'reason', 'sha256'])
      && string(value.module) && value.exclusion === null
      && (value.reason === 'content' ? string(value.sha256) && sha256.test(value.sha256) : value.reason === 'deleted' && value.sha256 === null);
    case 'not-analyzed': {
      if (!shape(value, ['path', 'disposition', 'module', 'exclusion', 'reason'])) return false;
      if (value.reason === 'owned-non-source') return string(value.module) && value.exclusion === null;
      const kinds = notAnalyzedReasons[value.reason as string];
      return !!kinds && exclusion(value.exclusion) && kinds.includes(value.exclusion.kind)
        && (value.exclusion.owner === null ? value.module === null : string(value.module));
    }
    case 'not-checked': return shape(value, ['path', 'disposition', 'module', 'exclusion', 'reason'])
      && (value.module === null || string(value.module)) && (value.exclusion === null || exclusion(value.exclusion))
      && (classification ? ['classification-changed', 'unobserved-input'] : ['superseded', 'unobserved-input', 'classification-changed']).includes(value.reason as string);
    default: return false;
  }
}
function dispositions(value: unknown, classification: boolean): boolean {
  if (!Array.isArray(value) || !value.every(item => disposition(item, classification))) return false;
  return new Set(value.map(item => (item as { path: string }).path)).size === value.length;
}
function freshnessRecord(value: unknown): boolean {
  return shape(value, ['mode', 'acknowledged', 'captureStarted', 'verified', 'reusedRevision'])
    && ['published', 'synchronized'].includes(value.mode as string) && integer(value.acknowledged)
    && (value.captureStarted === null || integer(value.captureStarted)) && typeof value.verified === 'boolean' && typeof value.reusedRevision === 'boolean';
}
function replyTimings(value: unknown): boolean {
  return members(value, ['invocationCheck', 'promotion', 'workerStatus', 'workerRoundTrip', 'sweep', 'publication'], ['service', 'clientTransport'])
    && Object.values(value).every(duration);
}
function delta(value: unknown): boolean {
  return shape(value, ['since', 'findings', 'removed', 'warnings', 'coverage']) && (value.since === null || string(value.since) && revisionId.test(value.since))
    && Array.isArray(value.findings) && value.findings.every(item => plain(item) && typeof item.new === 'boolean')
    && strings(value.removed) && Array.isArray(value.warnings) && value.warnings.every(plain) && Array.isArray(value.coverage) && value.coverage.every(plain);
}
/** An embedded analysis report carries its own schema identifier, which must be this build's. */
function report(value: unknown): boolean { return plain(value) && value.schemaVersion === 'ramify.analysis/2'; }
const unavailableReasons = ['unknown-context', 'expired-generation', 'evicted-revision', 'unobserved-input', 'resource-unavailable',
  'analysis-failed', 'unsupported-setup', 'disposed', 'configuration-changed'];
/** One `CheckOutcome`: a closed status with exactly its variant's members. */
function checkOutcome(input: unknown): boolean {
  if (!plain(input) || !id(input.requestId)) return false;
  const value = input;
  const timed = !Object.hasOwn(value, 'timings') || replyTimings(value.timings);
  switch (value.status) {
    case 'reported':
      if (value.published === true) return members(value, ['status', 'requestId', 'published', 'revision', 'freshness', 'delta', 'report', 'paths'], ['timings'])
        && timed && revision(value.revision) && freshnessRecord(value.freshness) && delta(value.delta)
        && (value.report === null || report(value.report)) && dispositions(value.paths, false);
      return value.published === false && members(value, ['status', 'requestId', 'published', 'revision', 'freshness', 'delta', 'report'], ['timings'])
        && timed && value.revision === null && value.delta === null && freshnessRecord(value.freshness) && report(value.report);
    case 'pending': return shape(value, ['status', 'requestId', 'current']) && status(value.current);
    case 'superseded': return shape(value, ['status', 'requestId', 'revision', 'mismatches']) && (value.revision === null || revision(value.revision))
      && Array.isArray(value.mismatches) && value.mismatches.every(item => shape(item, ['path', 'expected', 'observed']) && string(item.path)
        && [item.expected, item.observed].every(hash => hash === null || string(hash) && sha256.test(hash)));
    case 'cold': return shape(value, ['status', 'requestId', 'elapsedMs', 'current']) && duration(value.elapsedMs) && status(value.current);
    case 'deadline-exceeded': return shape(value, ['status', 'requestId', 'elapsedMs', 'revision']) && duration(value.elapsedMs)
      && (value.revision === null || revision(value.revision));
    case 'classification-changed': return shape(value, ['status', 'requestId', 'revision', 'paths']) && revision(value.revision)
      && dispositions(value.paths, true) && (value.paths as readonly unknown[]).length > 0;
    case 'cancelled': return shape(value, ['status', 'requestId']);
    case 'unavailable': return shape(value, ['status', 'requestId', 'reason', 'message']) && unavailableReasons.includes(value.reason as string)
      && string(value.message);
    default: return false;
  }
}
/** The strict reply decoder: a successful `check` reply must be one well-formed `CheckOutcome`,
 * its path dispositions and `classification-changed` variant included; other operations'
 * values keep their unknown shape. A malformed reply throws, failing the connection. */
export function validateServiceReply(operation: string, result: unknown): void {
  if (operation !== 'check' || !plain(result) || result.ok !== true) return;
  if (!checkOutcome(result.value)) throw new Error('Invalid check reply schema');
}

/** The message boundary validates envelopes; service parameters retain their
 * unknown shape until the shared in-process service validates the operation. */
export function validateWireMessage(input: unknown): WireMessage {
  const value = input as Record<string, unknown>;
  let valid = false;
  if (value && typeof value === 'object' && 'type' in value) switch (value.type) {
    case 'hello': valid = shape(value, ['type', 'handshake']) && shape(value.handshake, ['protocol', 'client', 'buildKey', 'engine'])
      && string(value.handshake.protocol) && string(value.handshake.buildKey) && string(value.handshake.engine)
      && shape(value.handshake.client, ['name', 'version']) && string(value.handshake.client.name) && string(value.handshake.client.version); break;
    case 'welcome': valid = shape(value, ['type', 'welcome']) && shape(value.welcome, ['protocol', 'instance', 'capabilities', 'limits'])
      && value.welcome.protocol === 'ramify.ipc/2' && instance(value.welcome.instance)
      && Array.isArray(value.welcome.capabilities) && value.welcome.capabilities.every(item => ['contexts', 'check', 'subscribe', 'daemon-control', 'materialize', 'measure', 'explorerDetails', 'dependencyDiagram', 'materialize-views', 'affected'].includes(item))
      && shape(value.welcome.limits, ['maxRequestBytes', 'maxResponseBytes', 'leaseMs', 'pingMs'])
      && Object.values(value.welcome.limits).every(item => integer(item) && item > 0); break;
    case 'reject': valid = shape(value, ['type', 'error', 'daemon']) && error(value.error) && instance(value.daemon); break;
    case 'request': valid = shape(value, ['type', 'id', 'op', 'params']) && id(value.id) && string(value.op) && value.op.length > 0; break;
    case 'cancel': valid = shape(value, ['type', 'id']) && id(value.id); break;
    case 'response': valid = shape(value, ['type', 'id', 'result']) && id(value.id)
      && (shape(value.result, ['ok', 'value']) && value.result.ok === true || shape(value.result, ['ok', 'error']) && value.result.ok === false && error(value.result.error)); break;
    case 'event': valid = shape(value, ['type', 'seq', 'subscription', 'event']) && integer(value.seq) && value.seq > 0
      && id(value.subscription) && event(value.event); break;
    case 'ping': case 'pong': valid = shape(value, ['type']); break;
    case 'goodbye': valid = shape(value, ['type', 'reason']) && reason(value.reason); break;
  }
  if (!valid) throw new Error('Invalid IPC message schema');
  return value as unknown as WireMessage;
}

export function encodeMessage(message: WireMessage): Uint8Array {
  validateWireMessage(message);
  return encodeJsonFrame(message, maximumMessageBytes);
}
export function decodeMessage(frame: Uint8Array): WireMessage {
  return validateWireMessage(decodeJsonFrame(frame, maximumMessageBytes));
}
