import { z } from 'zod';
import { dedent, indentOf, parseGherkin, scenariosOf, shift, sourceLines } from './gherkin.js';

/*
 * Plan capture: every fenced block of a Markdown plan whose info string is
 * `gherkin`, parsed without a runner. Each `Scenario` or `Scenario Outline`
 * becomes a plan scenario in document order; a `Background` is folded into
 * each scenario of its block, as Cucumber's pickles fold it, and an outline
 * stays one scenario with its examples. A block that does not parse is a
 * captured limitation, never an exception: the plan is the person's.
 */

const lineRangeSchema = z.tuple([z.int().positive(), z.int().positive()]);

/** One scenario of the plan, as the harness extracted it. Its authority is the plan's. */
export const planScenarioSchema = z.object({
  /** `ps-01`, `ps-02`, … in document order. */
  id: z.string().regex(/^ps-\d{2,}$/),
  /** Absent on an old single-plan run; its source is doc-001. */
  document: z.string().regex(/^doc-\d{3,}$/).optional(),
  name: z.string(),
  /** Whether it is a `Scenario Outline` with examples. */
  outline: z.boolean(),
  /** The 1-based lines of the plan from its keyword line to its last line. */
  lines: lineRangeSchema,
  /** The anchors of the headings it sits under, outermost first, as a plan reference names them. */
  anchors: z.array(z.string()),
  /**
   * The scenario as its entry scenario must restate it: the `Scenario` line,
   * its description, its background's steps and its own, and its examples,
   * without tags or comments, dedented.
   */
  source: z.array(z.string()),
}).strict();
export type PlanScenario = z.infer<typeof planScenarioSchema>;

/** A `gherkin` block that did not parse, with the parser's message and the block's lines. */
export const planScenarioLimitationSchema = z.object({
  kind: z.literal('unparsable-gherkin'),
  document: z.string().regex(/^doc-\d{3,}$/).optional(),
  /** The 1-based lines of the plan from the opening fence to the closing one. */
  lines: lineRangeSchema,
  message: z.string().min(1),
}).strict();
export type PlanScenarioLimitation = z.infer<typeof planScenarioLimitationSchema>;

/** What plan capture records. */
export const planScenarioExtractionSchema = z.object({
  scenarios: z.array(planScenarioSchema),
  limitations: z.array(planScenarioLimitationSchema),
}).strict();
export type PlanScenarioExtraction = z.infer<typeof planScenarioExtractionSchema>;

/** A fenced block of the plan: its info string's first word, the fence lines and the content. */
interface FencedBlock {
  readonly language: string;
  /** 1-based line of the opening fence. */
  readonly open: number;
  /** 1-based line of the closing fence, or the plan's last line when the block is never closed. */
  readonly close: number;
  readonly content: readonly string[];
  readonly anchors: readonly string[];
}

/** Every plan scenario and every unparsable `gherkin` block of a Markdown plan. */
export function extractPlanScenarios(plan: string, document?: string): PlanScenarioExtraction {
  const scenarios: PlanScenario[] = [];
  const limitations: PlanScenarioLimitation[] = [];
  for (const block of fencedBlocks(plan.split('\n'))) {
    if (block.language !== 'gherkin') continue;
    const extracted = extractBlock(block);
    if (!extracted.ok) {
      limitations.push({ kind: 'unparsable-gherkin', ...(document === undefined ? {} : { document }), lines: [block.open, block.close], message: extracted.message });
      continue;
    }
    for (const scenario of extracted.scenarios) {
      scenarios.push({ ...scenario, ...(document === undefined ? {} : { document }), id: `ps-${String(scenarios.length + 1).padStart(2, '0')}` });
    }
  }
  return { scenarios, limitations };
}

/** Extract only the documents selected by incorporation, with one run-wide ID sequence. */
export function extractDocumentScenarios(documents: readonly { readonly id: string; readonly text: string }[]): PlanScenarioExtraction {
  const scenarios: PlanScenario[] = [];
  const limitations: PlanScenarioLimitation[] = [];
  for (const document of documents) {
    const extracted = extractPlanScenarios(document.text, document.id);
    for (const scenario of extracted.scenarios) scenarios.push({ ...scenario, id: `ps-${String(scenarios.length + 1).padStart(2, '0')}` });
    limitations.push(...extracted.limitations);
  }
  return { scenarios, limitations };
}

type BlockScenario = Omit<PlanScenario, 'id'>;

function extractBlock(block: FencedBlock): { ok: true; scenarios: BlockScenario[] } | { ok: false; message: string } {
  // A block without its own `Feature:` is wrapped in a synthetic one, so the
  // parser's lines are the block's lines shifted by one.
  const wrapped = !block.content.some((line) => /^\s*(Feature|Business Need|Ability):/.test(line) || /^\s*#\s*language\s*:/.test(line));
  const text = wrapped ? ['Feature: plan', ...block.content] : [...block.content];
  const offset = wrapped ? 1 : 0;
  const toPlan = (line: number): number => block.open + line - offset;

  const parsed = parseGherkin(text.join('\n'));
  if (!parsed.ok) {
    const message = parsed.errors
      .map((error) => (error.line === null ? error.message : `(plan line ${toPlan(Math.max(error.line, offset + 1))}): ${error.message}`))
      .join('\n');
    return { ok: false, message };
  }
  const { document } = parsed;
  const { scenarios, backgroundEnds } = scenariosOf(document);
  return {
    ok: true,
    scenarios: scenarios.map(({ scenario, backgrounds, nextStart }) => {
      const own = sourceLines(text, scenario.location.line, nextStart, document);
      const firstStep = scenario.steps[0]?.location.line;
      // The scenario's lines before its first step are its keyword line and
      // description; its background's steps go between those and its own.
      const head = firstStep === undefined ? own.lines : sourceLines(text, scenario.location.line, firstStep, document).lines;
      const tail = own.lines.slice(head.length);
      const stepIndent = firstStep === undefined ? indentOf(text[scenario.location.line - 1]!) + 2 : indentOf(text[firstStep - 1]!);
      const folded = backgrounds.flatMap((background) => {
        const first = background.steps[0]?.location.line;
        if (first === undefined) return [];
        const lines = sourceLines(text, first, backgroundEnds.get(background) ?? null, document).lines;
        return shift(lines, stepIndent - indentOf(text[first - 1]!));
      });
      return {
        name: scenario.name,
        outline: scenario.examples.length > 0,
        lines: [toPlan(scenario.location.line), toPlan(own.last)] as [number, number],
        anchors: [...block.anchors],
        source: dedent([...head, ...folded, ...tail]),
      };
    }),
  };
}

/**
 * The fenced code blocks of a Markdown document, CommonMark's way: an
 * opening fence of three or more backticks or tildes indented at most three
 * spaces, closed by a fence of the same character at least as long. Content
 * loses the opening fence's indentation. Headings outside blocks give each
 * block the anchors it sits under.
 */
function fencedBlocks(lines: readonly string[]): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  const headings: { level: number; anchor: string }[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index]!;
    const heading = /^ {0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = heading[1]!.length;
      while (headings.length > 0 && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, anchor: anchorOf(heading[2]!) });
      index += 1;
      continue;
    }
    const fence = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (!fence || (fence[2]![0] === '`' && fence[3]!.includes('`'))) {
      index += 1;
      continue;
    }
    const indent = fence[1]!.length;
    const marker = fence[2]!;
    const language = (fence[3]!.trim().split(/\s+/)[0] ?? '').toLowerCase();
    const content: string[] = [];
    let close = index + 1;
    let closed = false;
    while (close < lines.length) {
      const candidate = lines[close]!;
      const closing = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(candidate);
      if (closing && closing[1]![0] === marker[0] && closing[1]!.length >= marker.length) {
        closed = true;
        break;
      }
      content.push(candidate.slice(Math.min(indent, indentOf(candidate))));
      close += 1;
    }
    blocks.push({
      language,
      open: index + 1,
      close: closed ? close + 1 : lines.length,
      content,
      anchors: headings.map((entry) => entry.anchor),
    });
    index = close + 1;
  }
  return blocks;
}

/** A heading's anchor, as a Markdown reader forms one and a plan reference names it. */
export function anchorOf(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}
