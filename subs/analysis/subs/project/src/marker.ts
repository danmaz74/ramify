import type { RootMarkerReader, TextSpan } from '../../descriptions/src/interfaces/syntax.js';

const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/**
 * The root marker of one description's bytes, decided by the supplied reader
 * of the Descriptions owner. When the bytes are not valid UTF-8, the reader
 * receives only the leading physical lines that decode: an encoding error
 * before the module line, or on it, leaves the description unmarked, and one
 * after it does not.
 */
export function descriptionMarker(file: string, bytes: Uint8Array, read: RootMarkerReader): TextSpan | null {
  let text: string;
  try { text = decoder.decode(bytes); }
  catch {
    const lines: string[] = [];
    for (let start = 0; start < bytes.length;) {
      const newline = bytes.indexOf(0x0a, start);
      const end = newline < 0 ? bytes.length : newline;
      try { lines.push(decoder.decode(bytes.subarray(start, end))); } catch { break; }
      start = end + 1;
    }
    text = lines.join('\n');
  }
  return read(file, text);
}
