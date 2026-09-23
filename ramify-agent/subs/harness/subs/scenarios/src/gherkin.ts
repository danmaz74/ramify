import { AstBuilder, GherkinClassicTokenMatcher, Parser } from '@cucumber/gherkin';
import { IdGenerator, type Background, type GherkinDocument, type Scenario, type Step } from '@cucumber/messages';

/*
 * The Gherkin parser, without a runner, and what this module reads of its
 * tree. Everything here is internal: the exported functions of the module
 * speak in lines, names and steps, never in the parser's own types.
 */

/** A parse that failed, with every error the parser reported, each at its 1-based line of the text parsed. */
export interface GherkinParseFailure {
  readonly ok: false;
  readonly errors: readonly { readonly line: number | null; readonly message: string }[];
}

export type GherkinParse = { readonly ok: true; readonly document: GherkinDocument } | GherkinParseFailure;

/** Parses one Gherkin document. A syntax error is a result, never an exception. */
export function parseGherkin(text: string): GherkinParse {
  const parser = new Parser(new AstBuilder(IdGenerator.incrementing()), new GherkinClassicTokenMatcher());
  try {
    return { ok: true, document: parser.parse(text) };
  } catch (error) {
    const reported = (error as { errors?: unknown }).errors;
    const errors = Array.isArray(reported) && reported.length > 0 ? reported : [error];
    return { ok: false, errors: errors.map(parserError) };
  }
}

function parserError(error: unknown): { line: number | null; message: string } {
  const raw = error instanceof Error ? error.message : String(error);
  const located = /^\((\d+):\d+\): (.*)$/s.exec(raw);
  if (located) return { line: Number(located[1]), message: located[2]! };
  const line = (error as { location?: { line?: unknown } }).location?.line;
  return { line: typeof line === 'number' ? line : null, message: raw };
}

/** A step as the form rules compare it: its kind after `And` and `But` take the previous step's, its text and its argument. */
export interface ComparableStep {
  /** `Given ` and the like, as written. */
  readonly keyword: string;
  /** `Context`, `Action` or `Outcome`; `Unknown` for a leading conjunction. */
  readonly kind: string;
  readonly text: string;
  /** A doc string's content or a table's cells, or `null`. */
  readonly argument: string | null;
}

/** The steps of a background and a scenario, in the order Cucumber's pickles run them. */
export function comparableSteps(steps: readonly Step[]): ComparableStep[] {
  let previous = 'Unknown';
  return steps.map((step) => {
    const kind = step.keywordType === 'Conjunction' || step.keywordType === undefined ? previous : step.keywordType;
    previous = kind;
    return { keyword: step.keyword, kind, text: step.text, argument: argumentOf(step) };
  });
}

/** The identity of a step for the verbatim rule and the duplicate warning, with whitespace normalized as rule 3 normalizes it. */
export function stepKey(step: ComparableStep): string {
  const argument = step.argument === null ? null : normalizedText(step.argument.split('\n'));
  return JSON.stringify([step.kind, step.text.trim().replace(/\s+/g, ' '), argument]);
}

/** The steps of recorded scenario lines, which always parse: they are a parsed scenario's own. */
export function stepsOfSource(source: readonly string[]): ComparableStep[] {
  const parsed = parseGherkin(['Feature: recorded', ...source].join('\n'));
  if (!parsed.ok) throw new Error(`Recorded scenario lines do not parse: ${parsed.errors[0]!.message}`);
  const scenario = parsed.document.feature!.children[0]!.scenario!;
  return comparableSteps(scenario.steps);
}

function argumentOf(step: Step): string | null {
  if (step.docString) return `"""${step.docString.mediaType ?? ''}\n${step.docString.content}`;
  if (step.dataTable) return step.dataTable.rows.map((row) => row.cells.map((cell) => cell.value).join('|')).join('\n');
  return null;
}

/** The children of a feature and its rules, flattened, with the backgrounds that apply to each scenario. */
export interface ScenarioInContext {
  readonly scenario: Scenario;
  readonly backgrounds: readonly Background[];
  /** The first line of the next child in the document (its tags included), or `null` at the end. */
  readonly nextStart: number | null;
}

/** Every scenario of a document with its backgrounds, and every background with where it ends. */
export function scenariosOf(document: GherkinDocument): { scenarios: ScenarioInContext[]; backgroundEnds: Map<Background, number | null> } {
  const scenarios: ScenarioInContext[] = [];
  const backgroundEnds = new Map<Background, number | null>();
  const feature = document.feature;
  if (!feature) return { scenarios, backgroundEnds };

  // Every child, rules and their children in document order, with its first line.
  type Child = { kind: 'background'; node: Background; start: number; rule: number | null }
    | { kind: 'scenario'; node: Scenario; start: number; rule: number | null }
    | { kind: 'rule'; start: number; rule: number };
  const children: Child[] = [];
  feature.children.forEach((child, ruleIndex) => {
    if (child.background) children.push({ kind: 'background', node: child.background, start: child.background.location.line, rule: null });
    if (child.scenario) children.push({ kind: 'scenario', node: child.scenario, start: startOf(child.scenario), rule: null });
    if (child.rule) {
      const rule = child.rule;
      children.push({ kind: 'rule', start: Math.min(rule.location.line, ...rule.tags.map((tag) => tag.location.line)), rule: ruleIndex });
      for (const inner of rule.children) {
        if (inner.background) children.push({ kind: 'background', node: inner.background, start: inner.background.location.line, rule: ruleIndex });
        if (inner.scenario) children.push({ kind: 'scenario', node: inner.scenario, start: startOf(inner.scenario), rule: ruleIndex });
      }
    }
  });

  let featureBackground: Background | null = null;
  let ruleBackground: { rule: number; node: Background } | null = null;
  children.forEach((child, index) => {
    const nextStart = children[index + 1]?.start ?? null;
    if (child.kind === 'background') {
      backgroundEnds.set(child.node, nextStart);
      if (child.rule === null) featureBackground = child.node;
      else ruleBackground = { rule: child.rule, node: child.node };
    } else if (child.kind === 'scenario') {
      const backgrounds: Background[] = [];
      if (featureBackground) backgrounds.push(featureBackground);
      if (ruleBackground && ruleBackground.rule === child.rule) backgrounds.push(ruleBackground.node);
      scenarios.push({ scenario: child.node, backgrounds, nextStart });
    }
  });
  return { scenarios, backgroundEnds };
}

function startOf(scenario: Scenario): number {
  return Math.min(scenario.location.line, ...scenario.tags.map((tag) => tag.location.line));
}

/**
 * The lines of one scenario or background as the harness records them, from
 * `first` to the line before `end` (1-based, of `lines`): comment lines, tag
 * lines and blank lines outside doc strings are left out, and trailing ones
 * with them. Doc string content is kept whole.
 */
export function sourceLines(lines: readonly string[], first: number, end: number | null, document: GherkinDocument): { lines: string[]; last: number } {
  const comments = new Set(document.comments.map((comment) => comment.location.line));
  const kept: { text: string; line: number }[] = [];
  let delimiter: string | null = null;
  const stop = Math.min(end === null ? lines.length + 1 : end, lines.length + 1);
  for (let line = first; line < stop; line += 1) {
    const text = lines[line - 1]!;
    const trimmed = text.trim();
    if (delimiter !== null) {
      kept.push({ text, line });
      if (trimmed === delimiter) delimiter = null;
      continue;
    }
    if (trimmed === '' || comments.has(line) || trimmed.startsWith('@')) continue;
    if (trimmed.startsWith('"""') || trimmed.startsWith('```')) delimiter = trimmed.slice(0, 3);
    kept.push({ text, line });
  }
  return { lines: kept.map((entry) => entry.text.replace(/\s+$/, '')), last: kept.at(-1)?.line ?? first };
}

/** Removes the indentation every non-empty line shares, keeping the lines' relative indentation. */
export function dedent(lines: readonly string[]): string[] {
  const indents = lines.filter((line) => line.trim() !== '').map((line) => /^\s*/.exec(line)![0].length);
  const common = indents.length === 0 ? 0 : Math.min(...indents);
  return lines.map((line) => line.slice(Math.min(common, /^\s*/.exec(line)![0].length)));
}

/** Shifts lines right by `columns`, or left by as much of `-columns` as each line's indentation allows. */
export function shift(lines: readonly string[], columns: number): string[] {
  if (columns >= 0) return lines.map((line) => (line === '' ? line : ' '.repeat(columns) + line));
  return lines.map((line) => line.slice(Math.min(-columns, /^\s*/.exec(line)![0].length)));
}

/** The indentation of a line, in columns. */
export function indentOf(line: string): number {
  return /^\s*/.exec(line)![0].length;
}

/**
 * The comparison form of scenario text: each line trimmed with runs of
 * whitespace collapsed, and nothing else. Recorded lines carry no blank line
 * outside a doc string, so a blank line that remains is doc string content
 * and counts like any other line.
 */
export function normalizedText(lines: readonly string[]): string {
  return lines.map((line) => line.trim().replace(/\s+/g, ' ')).join('\n');
}
