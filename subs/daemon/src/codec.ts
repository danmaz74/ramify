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
