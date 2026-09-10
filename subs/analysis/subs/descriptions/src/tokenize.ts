import type { DescriptionIssue, DescriptionToken, TextSpan } from './interfaces/syntax.js';

const keywords = new Set([
  'ramify', 'module', 'expose-src', 'expose-test', 'expose-sub', 'from', 'as',
  'tagged', 'to', 'parent', 'descendants', 'testing', 'browser', 'ui',
]);
const wordCharacter = /^[A-Za-z0-9_$-]$/;
const hexQuad = /^[0-9a-fA-F]{4}$/;
const escapes: Readonly<Record<string, string>> = {
  '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t',
};

export interface TokenLine {
  readonly tokens: readonly DescriptionToken[];
  readonly end: TextSpan;
  readonly invalid: boolean;
}

/** Scan physical lines without rewriting text, so every offset addresses the input. */
export function tokenize(file: string, text: string): {
  tokens: DescriptionToken[]; lines: TokenLine[]; issues: DescriptionIssue[];
} {
  const tokens: DescriptionToken[] = [];
  const lines: TokenLine[] = [];
  const issues: DescriptionIssue[] = [];
  let lineStart = 0;
  let lineNumber = 1;

  while (lineStart <= text.length) {
    const issueCount = issues.length;
    const newline = text.indexOf('\n', lineStart);
    const next = newline === -1 ? text.length : newline;
    const end = newline !== -1 && text[next - 1] === '\r' ? next - 1 : next;
    const span = (start: number, stop: number): TextSpan => ({
      start, end: stop, line: lineNumber, column: start - lineStart + 1,
    });
    const issue = (code: DescriptionIssue['code'], message: string, start: number, stop: number) => {
      issues.push({ code, message, file, span: span(start, stop) });
    };

    // Encoding and line-ending constraints also apply in comments.
    for (let offset = lineStart; offset < end; offset++) {
      const unit = text.charCodeAt(offset);
      if (unit === 13) issue('bare-cr', 'Use LF or CRLF; a bare CR is invalid.', offset, offset + 1);
      if (unit >= 0xd800 && unit <= 0xdbff) {
        const low = text.charCodeAt(offset + 1);
        if (low >= 0xdc00 && low <= 0xdfff) offset++;
        else issue('invalid-scalar', 'An isolated surrogate is not a Unicode scalar value.', offset, offset + 1);
      } else if (unit >= 0xdc00 && unit <= 0xdfff) {
        issue('invalid-scalar', 'An isolated surrogate is not a Unicode scalar value.', offset, offset + 1);
      }
    }

    const lineTokens: DescriptionToken[] = [];
    let cursor = lineStart === 0 && text[0] === '\uFEFF' ? 1 : lineStart;
    while (cursor < end) {
      const char = text[cursor];
      if (char === ' ' || char === '\t' || char === '\r') { cursor++; continue; }
      // The reviewed syntax stream excludes comments, but keeps their original offsets.
      if (char === '/' && text[cursor + 1] === '/') break;
      if (/\s/u.test(char)) {
        issue('invalid-whitespace', 'Only spaces and tabs separate tokens on a line.', cursor, cursor + 1);
        cursor++;
        continue;
      }
      const start = cursor;
      let kind: DescriptionToken['kind'];
      let decoded = '';
      if (char === '"') {
        kind = 'string';
        cursor++;
        let closed = false;
        while (cursor < end) {
          const current = text[cursor];
          if (current === '"') { cursor++; closed = true; break; }
          if (current !== '\\') {
            if (text.charCodeAt(cursor) <= 0x1f) {
              issue('invalid-scalar', 'A string cannot contain an unescaped control character.', cursor, cursor + 1);
            }
            decoded += current;
            cursor++;
            continue;
          }
          const escapeStart = cursor++;
          const escaped = text[cursor];
          if (cursor < end && Object.hasOwn(escapes, escaped)) {
            decoded += escapes[escaped];
            cursor++;
          } else if (escaped === 'u') {
            cursor++;
            const digits = text.slice(cursor, Math.min(cursor + 4, end));
            if (!hexQuad.test(digits)) {
              issue('invalid-escape', 'A Unicode escape requires exactly four hexadecimal digits.', escapeStart, cursor);
              continue;
            }
            cursor += 4;
            const unit = Number.parseInt(digits, 16);
            if (unit >= 0xd800 && unit <= 0xdbff) {
              const lowDigits = text.slice(cursor + 2, Math.min(cursor + 6, end));
              const low = Number.parseInt(lowDigits, 16);
              if (text.slice(cursor, cursor + 2) === '\\u' && hexQuad.test(lowDigits)
                  && low >= 0xdc00 && low <= 0xdfff) {
                decoded += String.fromCodePoint(0x10000 + (unit - 0xd800) * 0x400 + low - 0xdc00);
                cursor += 6;
              } else {
                issue('invalid-scalar', 'A high-surrogate escape requires an immediate low-surrogate escape.', escapeStart, cursor);
              }
            } else if (unit >= 0xdc00 && unit <= 0xdfff) {
              issue('invalid-scalar', 'A low-surrogate escape requires a preceding high-surrogate escape.', escapeStart, cursor);
            } else decoded += String.fromCharCode(unit);
          } else {
            if (cursor < end) cursor++;
            issue('invalid-escape', 'Unknown or incomplete string escape.', escapeStart, cursor);
          }
        }
        if (!closed) issue('unterminated-string', 'A quoted string must end on the same physical line.', start, cursor);
      } else if (wordCharacter.test(char)) {
        while (cursor < end && wordCharacter.test(text[cursor])) cursor++;
        decoded = text.slice(start, cursor);
        kind = keywords.has(decoded) ? 'keyword' : 'name';
      } else {
        // Keep unexpected punctuation for a located grammar error, never discard it.
        cursor++;
        decoded = char;
        kind = 'punctuation';
      }
      const token: DescriptionToken = { kind, raw: text.slice(start, cursor), decoded, span: span(start, cursor) };
      lineTokens.push(token);
      tokens.push(token);
    }
    lines.push({ tokens: lineTokens, end: span(end, end), invalid: issues.length !== issueCount });
    if (newline === -1) break;
    lineStart = newline + 1;
    lineNumber++;
  }
  return { tokens, lines, issues };
}
