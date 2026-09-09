import type {
  DescriptionDocument, DescriptionIssue, DescriptionSelection, DescriptionStatement,
  DescriptionToken, NamedSelection, ParsedDescription, TextSpan,
} from './interfaces/syntax.js';
import { tokenize } from './tokenize.js';
import type { TokenLine } from './tokenize.js';

const moduleName = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const exportName = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const specialTags = new Set(['testing', 'browser', 'ui']);
const through = (first: TextSpan, last: TextSpan): TextSpan => ({ ...first, end: last.end });

// Recovery is at a physical line boundary, where every version 1 statement ends.
class LineFailure extends Error {}

class LineParser {
  private cursor = 0;

  constructor(
    private readonly file: string,
    private readonly text: string,
    private readonly line: TokenLine,
    private readonly issues: DescriptionIssue[],
  ) {}

  private get token(): DescriptionToken | undefined { return this.line.tokens[this.cursor]; }
  private get previous(): DescriptionToken { return this.line.tokens[this.cursor - 1]; }

  private report(code: DescriptionIssue['code'], message: string, span = this.token?.span ?? this.line.end): void {
    this.issues.push({ code, message, file: this.file, span });
  }

  private fail(code: DescriptionIssue['code'], message: string): never {
    this.report(code, message);
    throw new LineFailure();
  }

  private is(raw: string): boolean { return this.token?.raw === raw; }
  private take(): DescriptionToken { return this.line.tokens[this.cursor++]; }

  private horizontal(): void {
    // Let the missing construct report its own reason at end of line.
    if (!this.token) return;
    const start = this.previous.span.end;
    const end = this.token?.span.start ?? this.line.end.start;
    if (!/^[ \t]+$/.test(this.text.slice(start, end))) {
      this.fail('invalid-whitespace', 'Expected at least one space or tab between these tokens.');
    }
  }

  private keyword(raw: string, code: DescriptionIssue['code']): DescriptionToken {
    if (!this.is(raw)) this.fail(code, `Expected the bare ${raw} clause.`);
    return this.take();
  }

  private name(module = false, path = false): DescriptionToken {
    const token = this.token;
    if (!token) this.fail('invalid-name', `Expected ${path ? 'a quoted path' : 'a name'}.`);
    if (path && token.kind !== 'string') this.fail('missing-from', 'A source reference requires a quoted path.');
    if (token.kind === 'keyword') this.fail('reserved-name', `Quote the reserved name ${token.raw}.`);
    if (token.kind !== 'name' && token.kind !== 'string') this.fail('invalid-name', 'Expected a name.');
    if (!token.decoded.length) this.fail('empty-name', 'Decoded names and paths must not be empty.');
    if (/[\u0000-\u001f\u007f]/u.test(token.decoded)) this.fail('invalid-name', 'Decoded names and paths cannot contain control characters.');
    if (module && !moduleName.test(token.decoded)) this.fail('invalid-name', 'Module names must be lowercase words separated by single hyphens.');
    if (!module && token.kind === 'name' && !exportName.test(token.decoded)) this.fail('invalid-name', 'This export name requires double quotes.');
    return this.take();
  }

  private tags(): NonNullable<DescriptionStatement['tags']> {
    const first = this.take(); // tagged
    this.horizontal();
    if (!this.is('[')) this.fail('invalid-tag-syntax', 'Expected a bracketed tag list.');
    this.take();
    const values: string[] = [];
    const seen = new Set<string>();
    if (!this.is(']')) {
      while (true) {
        const token = this.token;
        if (!token || !moduleName.test(token.raw)
            || (token.kind !== 'name' && !specialTags.has(token.raw))) {
          this.fail('invalid-tag-syntax', 'Tags must be bare lowercase names.');
        }
        if (seen.has(token.raw)) this.report('duplicate-tag', `Repeated tag ${token.raw}.`);
        seen.add(token.raw);
        values.push(this.take().raw);
        if (!this.is(',')) break;
        this.take();
        if (!this.token || this.is(']') || this.is(',')) this.fail('invalid-list', 'A tag comma must be followed by a tag.');
      }
    }
    if (!this.is(']')) this.fail('invalid-list', 'Expected a comma or the end of the tag list.');
    const last = this.take();
    return { values, span: through(first.span, last.span) };
  }

  private selection(kind: DescriptionStatement['kind']): DescriptionSelection {
    if (this.is('*')) {
      if (kind === 'expose-test') this.fail('invalid-selection', 'expose-test accepts only named selections.');
      const token = this.take();
      if (this.is(',') || this.is('as')) this.fail('invalid-selection', 'A wildcard must be the whole selection and cannot have an alias.');
      return { kind: 'wildcard', span: token.span };
    }
    const names: NamedSelection[] = [];
    while (true) {
      if (this.is('*')) this.fail('invalid-selection', 'A wildcard cannot be mixed with names.');
      const name = this.name();
      let alias = name;
      if (this.is('as')) {
        this.horizontal();
        this.take();
        this.horizontal();
        alias = this.name();
      }
      names.push({ name: name.decoded, alias: alias.decoded, span: through(name.span, alias.span) });
      if (!this.is(',')) break;
      this.take();
      if (!this.token || this.is('from') || this.is(',')) this.fail('invalid-list', 'A selection comma must be followed by a name.');
    }
    return { kind: 'named', names };
  }

  private destinations(): DescriptionStatement['destinations'] {
    const values: ('parent' | 'descendants')[] = [];
    while (true) {
      if (!this.is('parent') && !this.is('descendants')) this.fail('invalid-destination', 'Expected the bare destination parent or descendants.');
      const value = this.token!.raw as 'parent' | 'descendants';
      if (values.includes(value)) this.report('duplicate-destination', `Repeated destination ${value}.`);
      this.take();
      values.push(value);
      if (!this.is(',')) break;
      this.take();
      if (!this.token || this.is(',')) this.fail('invalid-list', 'A destination comma must be followed by a destination.');
    }
    return values;
  }

  private finish(): void {
    if (this.token) this.fail(this.token.kind === 'punctuation' ? 'trailing-token' : 'unknown-clause', 'Unexpected token after the completed statement.');
  }

  version(): void {
    this.take();
    this.horizontal();
    if (!this.is('1')) this.fail('unsupported-version', 'Only ramify version 1 is supported.');
    this.take();
    this.finish();
  }

  module(): DescriptionDocument['module'] {
    const first = this.take();
    this.horizontal();
    const name = this.name(true);
    let tags: readonly string[] = [];
    if (this.is('tagged')) { this.horizontal(); tags = this.tags().values; }
    this.finish();
    return { name: name.decoded, tags, span: through(first.span, this.previous.span) };
  }

  exposure(index: number): DescriptionStatement {
    const first = this.take();
    const kind = first.raw as DescriptionStatement['kind'];
    this.horizontal();
    const selection = this.selection(kind);
    this.horizontal();
    this.keyword('from', 'missing-from');
    this.horizontal();
    const from = this.name(kind === 'expose-sub', kind !== 'expose-sub');
    let tags: DescriptionStatement['tags'] = null;
    if (this.is('tagged')) {
      if (kind === 'expose-sub') this.fail('unknown-clause', 'expose-sub cannot assign tags.');
      this.horizontal();
      tags = this.tags();
    }
    this.horizontal();
    this.keyword('to', 'missing-to');
    this.horizontal();
    const destinations = this.destinations();
    this.finish();
    return { index, kind, span: through(first.span, this.previous.span), selection,
      from: { value: from.decoded, span: from.span }, tags, destinations };
  }
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Parse syntax only: registry, file paths, originals and exposure linking are later stages. */
export function parseDescription(file: string, text: string): ParsedDescription {
  const { tokens, lines, issues } = tokenize(file, text);
  let versionSeen = false;
  let moduleSeen = false;
  let module: DescriptionDocument['module'] | undefined;
  const statements: DescriptionStatement[] = [];
  let significantLines = 0;
  for (const line of lines) {
    const first = line.tokens[0];
    if (!first) continue;
    const report = (code: DescriptionIssue['code'], message: string) => {
      issues.push({ code, message, file, span: first.span });
    };
    const parser = new LineParser(file, text, line, issues);
    try {
      if (first.raw === 'ramify') {
        if (versionSeen) report('duplicate-header', 'The version header must occur exactly once.');
        if (significantLines !== 0) report('invalid-order', 'The version header must be the first statement.');
        versionSeen = true;
        if (!line.invalid) parser.version();
      } else if (first.raw === 'module') {
        if (moduleSeen) report('duplicate-header', 'The module header must occur exactly once.');
        if (!versionSeen || significantLines !== 1) report('invalid-order', 'The module header must follow the version header.');
        moduleSeen = true;
        if (!line.invalid) module = parser.module();
      } else if (['expose-src', 'expose-test', 'expose-sub'].includes(first.raw)) {
        if (!versionSeen || !moduleSeen) report('invalid-order', 'Exposure statements must follow both headers.');
        if (!line.invalid) statements.push(parser.exposure(statements.length));
      } else if (first.raw === 'tests' && line.tokens[1]?.raw === 'tagged') {
        report('test-profile-declaration', 'The testing profile has no declaration syntax.');
      } else report('unknown-statement', `Unknown statement ${first.raw}.`);
    } catch (error) {
      if (!(error instanceof LineFailure)) throw error;
    }
    significantLines++;
  }
  const missingSpan = tokens[0]?.span ?? lines[0].end;
  if (!versionSeen) issues.push({ code: 'missing-version', message: 'A ramify 1 version header is required.', file, span: missingSpan });
  if (!moduleSeen) issues.push({ code: 'missing-header', message: 'One module header is required.', file, span: missingSpan });
  if (issues.length) {
    issues.sort((a, b) => a.span.start - b.span.start || a.span.end - b.span.end || a.code.localeCompare(b.code));
    return freeze({ status: 'invalid', file, tokens, issues });
  }
  return freeze({ status: 'valid', document: { file, version: 1, module: module!, tokens, statements } });
}
