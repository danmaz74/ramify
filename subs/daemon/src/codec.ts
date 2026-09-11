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

import type { WireMessage } from './interfaces/daemon.js';

const maximumMessageBytes = 64 * 1024 * 1024;
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
function scope(value: unknown): boolean {
  return value === null || shape(value, ['root', 'selection', 'invokedFrom', 'configuration', 'walkedAreas', 'independentScopes'])
    && string(value.root) && ['given', 'found'].includes(value.selection as string) && string(value.invokedFrom) && string(value.configuration)
    && strings(value.walkedAreas) && strings(value.independentScopes);
}
function outcome(value: unknown): boolean {
  return shape(value, ['execution', 'check', 'coverage']) && ['completed', 'invalid', 'incomplete', 'unavailable'].includes(value.execution as string)
    && ['passed', 'failed', 'not-run'].includes(value.check as string) && ['complete', 'partial', 'not-run'].includes(value.coverage as string);
}
function summary(value: unknown): boolean {
  return shape(value, ['complete', 'owners', 'sourceFiles', 'resources', 'originals', 'accesses', 'allowed', 'denied', 'errors', 'warnings', 'coverageNotes', 'external'])
    && typeof value.complete === 'boolean' && Object.entries(value).every(([key, count]) => key === 'complete' || integer(count));
}
function revision(value: unknown): boolean {
  return shape(value, ['token', 'revision', 'sequence', 'publishedAt', 'cause', 'fingerprints', 'changed', 'reused', 'outcome', 'summary'])
    && token(value.token) && string(value.revision) && /^rev\/1:[0-9a-f-]{36}:[1-9][0-9]*$/.test(value.revision) && integer(value.sequence) && value.sequence > 0
    && integer(value.publishedAt) && ['open', 'watch', 'request', 'verify', 'conservative'].includes(value.cause as string)
    && shape(value.fingerprints, ['inputId', 'declarations', 'source', 'configuration', 'registry', 'engine'])
    && Object.values(value.fingerprints).every(string)
    && (value.changed === null || Array.isArray(value.changed) && value.changed.every(string))
    && Array.isArray(value.reused) && value.reused.every(item => ['configuration', 'parse', 'metadata', 'catalog', 'access', 'link', 'decide'].includes(item))
    && outcome(value.outcome) && summary(value.summary);
}
function status(value: unknown): boolean {
  return shape(value, ['token', 'selection', 'scope', 'state', 'synchronization', 'published', 'lastValid', 'pending', 'history',
    'retainedBytes', 'leases', 'watcher', 'openedAt', 'lastActivityAt']) && token(value.token) && selection(value.selection) && scope(value.scope)
    && ['opening', 'warm', 'cold', 'evicted'].includes(value.state as string)
    && ['initializing', 'synchronized', 'reconciling', 'conservative', 'watcher-unavailable'].includes(value.synchronization as string)
    && (value.published === null || revision(value.published)) && (value.lastValid === null || revision(value.lastValid))
    && integer(value.retainedBytes) && integer(value.openedAt) && integer(value.lastActivityAt)
    && shape(value.pending, ['requests', 'changedPaths', 'analysisRunning']) && integer(value.pending.requests)
    && integer(value.pending.changedPaths) && typeof value.pending.analysisRunning === 'boolean'
    && shape(value.leases, ['subscriptions', 'requests']) && Object.values(value.leases).every(integer)
    && shape(value.history, ['retained', 'bytes', 'oldest']) && integer(value.history.retained) && integer(value.history.bytes)
    && (value.history.oldest === null || string(value.history.oldest))
    && ['active', 'unavailable', 'disposed'].includes(value.watcher as string);
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
      && value.welcome.protocol === 'ramify.ipc/1' && instance(value.welcome.instance)
      && Array.isArray(value.welcome.capabilities) && value.welcome.capabilities.every(item => ['contexts', 'check', 'subscribe', 'daemon-control'].includes(item))
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
