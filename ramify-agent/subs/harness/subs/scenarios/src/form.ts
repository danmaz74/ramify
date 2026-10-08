import { z } from 'zod';
import type { PlanScenario } from './extraction.js';
import { comparableSteps, dedent, normalizedText, parseGherkin, scenariosOf, sourceLines, stepKey, stepsOfSource, type ComparableStep } from './gherkin.js';

/*
 * The form rules of the initial architect's scenarios, architecture §2: six
 * rules in order, the first one broken rejecting the submission with a
 * message naming it, and three warnings that never reject. The rules see the
 * submitted scenarios, the extracted plan scenarios and the submitted
 * entries; the warning about names the architect view records takes those
 * names as an argument, since this module never reads the view.
 */

/**
 * An element citation: a key of the citing submission, or an element ID
 * once the harness accepted it. The rules compare citations as they are
 * given, so an entry and its scenarios cite in the same terms.
 */
export const scenarioElementRefSchema = z.string().min(1);
export type ScenarioElementRef = z.infer<typeof scenarioElementRefSchema>;

const planScenarioIdSchema = z.string().regex(/^ps-\d{2,}$/, 'A plan scenario ID, such as "ps-01"');

/** Where a submitted scenario comes from. */
export const scenarioOriginSubmissionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('plan'), planScenario: planScenarioIdSchema }).strict(),
  z.object({ kind: z.literal('architect') }).strict(),
]);

/** One entry scenario of the initial architect's submission. */
export const scenarioSubmissionSchema = z.object({
  /** Unique within the submission. */
  key: z.string().min(1),
  /** The capability slug of an entry of the same submission. */
  entry: z.string().min(1),
  origin: scenarioOriginSubmissionSchema,
  /** The plan scenario this one was derived from, for a sub-scenario the architect wrote. */
  partOf: planScenarioIdSchema.optional(),
  /** The acceptance elements this scenario verifies. */
  refs: z.array(scenarioElementRefSchema).optional(),
  /** Architect scenarios supply text; plan scenarios may name their registry identity alone. */
  gherkin: z.string().min(1).optional(),
}).strict().superRefine((scenario, ctx) => {
  if (scenario.origin.kind === 'architect' && scenario.gherkin === undefined)
    ctx.addIssue({ code: 'custom', path: ['gherkin'], message: 'an architect scenario requires its Gherkin; a plan scenario may reference its identity' });
});
export type ScenarioSubmission = z.infer<typeof scenarioSubmissionSchema>;

/** A plan scenario that combines several entries, and the entry scenarios it decomposes into. */
export const integrationScenarioSubmissionSchema = z.object({
  planScenario: planScenarioIdSchema,
  /** Keys of scenarios of the same submission. */
  subScenarios: z.array(z.string().min(1)),
}).strict();
export type IntegrationScenarioSubmission = z.infer<typeof integrationScenarioSubmissionSchema>;

/** The scenario part of `initial-architect/2`. */
export const scenarioFormSubmissionSchema = z.object({
  scenarios: z.array(scenarioSubmissionSchema),
  integrationScenarios: z.array(integrationScenarioSubmissionSchema),
}).strict();
export type ScenarioFormSubmission = z.infer<typeof scenarioFormSubmissionSchema>;

/** What the rules read of a submitted entry. */
export interface ScenarioFormEntry {
  readonly capability: string;
  readonly acceptanceRefs: readonly ScenarioElementRef[];
  readonly nonBehavioralAcceptance?: readonly NonBehavioralAcceptance[];
}

/** Classification is the agent's declaration; only references and registration are validated. */
export const nonBehavioralAcceptanceSchema = z.object({
  ref: scenarioElementRefSchema,
  kind: z.literal('non-behavioral'),
  test: z.string().min(1),
}).strict();
export type NonBehavioralAcceptance = z.infer<typeof nonBehavioralAcceptanceSchema>;

export interface ScenarioFormEvidence {
  /** Only actually registered test identities, excluding scenarios and arbitrary paths/names. */
  readonly registeredTests: ReadonlySet<string>;
}

/** The exported symbols and file paths the architect view records, for the first warning. */
export interface ScenarioViewNames {
  readonly symbols: readonly string[];
  readonly files: readonly string[];
}

/** The six rules of architecture §2, by number. */
export type ScenarioFormRule = 1 | 2 | 3 | 4 | 5 | 6;

/** The short name a rejection gives each rule. */
export const scenarioFormRules: Readonly<Record<ScenarioFormRule, string>> = {
  1: 'one scenario per gherkin value',
  2: 'one entry per scenario',
  3: 'every plan scenario exactly once',
  4: 'every entry has a scenario',
  5: 'integration steps verbatim',
  6: 'every acceptance element cited by a scenario or declared registered test',
};

export type ScenarioWarningKind =
  | 'names-view-symbol'
  | 'names-view-file'
  | 'sub-scenario-shares-no-step'
  | 'duplicate-architect-steps';

/** A warning, recorded on the accepted analysis and shown in the review. */
export interface ScenarioWarning {
  readonly kind: ScenarioWarningKind;
  /** The keys of the scenarios it concerns. */
  readonly scenarios: readonly string[];
  readonly message: string;
}

/** A scenario of the accepted form, ready for its ID. */
export interface FormScenario {
  readonly key: string;
  readonly entry: string;
  readonly origin: { readonly kind: 'plan'; readonly planScenario: string; readonly lines: readonly [number, number]; readonly document?: string }
    | { readonly kind: 'architect'; readonly refs: readonly ScenarioElementRef[] };
  /** The plan scenario of the integration scenario this one is a sub-scenario of, or `null`. */
  readonly partOf: string | null;
  readonly name: string;
  /** The plan's lines for a plan scenario; the submitted lines, dedented, for an architect scenario. */
  readonly source: readonly string[];
}

/** An integration scenario of the accepted form. Its text is the plan's. */
export interface FormIntegration {
  readonly planScenario: string;
  readonly document?: string;
  readonly lines: readonly [number, number];
  /** Keys, in the submitted order. */
  readonly subScenarios: readonly string[];
  readonly name: string;
  readonly source: readonly string[];
}

/** The scenarios of a submission that passed every rule. */
export interface AcceptedScenarioForm {
  /** Entry scenarios in submission order. */
  readonly scenarios: readonly FormScenario[];
  /** Integration scenarios in submission order. */
  readonly integrations: readonly FormIntegration[];
}

export type ScenarioFormResult =
  | { readonly ok: true; readonly form: AcceptedScenarioForm; readonly warnings: readonly ScenarioWarning[] }
  | { readonly ok: false; readonly rule: ScenarioFormRule; readonly path: string; readonly message: string };

/** One submitted `gherkin` value, parsed inside a synthetic feature. */
interface ParsedScenario {
  readonly name: string;
  readonly source: string[];
  readonly steps: ComparableStep[];
}

/**
 * Applies rules 1–6 of architecture §2 in order. The first rule broken is the
 * answer, with a message naming it; otherwise the accepted form and its
 * warnings.
 */
export function validateScenarioForm(
  submission: ScenarioFormSubmission,
  planScenarios: readonly PlanScenario[],
  entries: readonly ScenarioFormEntry[],
  viewNames: ScenarioViewNames = { symbols: [], files: [] },
  evidence: ScenarioFormEvidence = { registeredTests: new Set() },
): ScenarioFormResult {
  const reject = (rule: ScenarioFormRule, path: string, detail: string): ScenarioFormResult => ({
    ok: false,
    rule,
    path,
    message: `Scenario form rule ${rule} (${scenarioFormRules[rule]}): ${detail}`,
  });

  // Rule 1: every value is one scenario with a step and no tag.
  const parsed: ParsedScenario[] = [];
  for (const [position, scenario] of submission.scenarios.entries()) {
    const origin = scenario.origin;
    const registered = origin.kind === 'plan' ? planScenarios.find(item => item.id === origin.planScenario) : undefined;
    if (scenario.gherkin === undefined && registered === undefined) {
      if (scenario.origin.kind === 'plan') return reject(3, `scenarios.${position}.origin.planScenario`, `the scenario "${scenario.key}" names unknown plan scenario "${scenario.origin.planScenario}"`);
      return reject(1, `scenarios.${position}.gherkin`, `the architect scenario "${scenario.key}" requires its Gherkin`);
    }
    const one = parseOneScenario(scenario.gherkin ?? registered!.source.join('\n'));
    if (!one.ok) return reject(1, `scenarios.${position}.gherkin`, `the scenario "${scenario.key}" ${one.problem}`);
    parsed.push(one.scenario);
  }

  // Rule 2: unique keys, and each scenario names one entry of the submission.
  const capabilities = new Set(entries.map((entry) => entry.capability));
  const keys = new Map<string, number>();
  for (const [position, scenario] of submission.scenarios.entries()) {
    if (keys.has(scenario.key)) {
      return reject(2, `scenarios.${position}.key`, `the key "${scenario.key}" is used by an earlier scenario; a key is unique in the submission`);
    }
    keys.set(scenario.key, position);
    if (!capabilities.has(scenario.entry)) {
      return reject(2, `scenarios.${position}.entry`, `the scenario "${scenario.key}" names "${scenario.entry}", which is no entry of this submission`);
    }
  }

  // Rule 3: every plan scenario exactly once, as an origin or an integration
  // scenario, and a plan scenario's text restated as the plan states it.
  const plan = new Map(planScenarios.map((scenario) => [scenario.id, scenario]));
  const appearances = new Map<string, string>();
  const appear = (id: string, as: string, path: string): ScenarioFormResult | null => {
    if (!plan.has(id)) return reject(3, path, `${as} names the plan scenario "${id}", which the plan does not have`);
    const earlier = appearances.get(id);
    if (earlier !== undefined) return reject(3, path, `the plan scenario ${id} appears twice, ${earlier} and ${as}; each appears exactly once`);
    appearances.set(id, as);
    return null;
  };
  for (const [position, scenario] of submission.scenarios.entries()) {
    if (scenario.origin.kind !== 'plan') continue;
    const failure = appear(scenario.origin.planScenario, `as the origin of "${scenario.key}"`, `scenarios.${position}.origin.planScenario`);
    if (failure) return failure;
    const extracted = plan.get(scenario.origin.planScenario)!;
    if (normalizedText(parsed[position]!.source) !== normalizedText(extracted.source)) {
      return reject(3, `scenarios.${position}.gherkin`, `the scenario "${scenario.key}" does not restate ${extracted.id} as the plan states it; after whitespace normalization its text must be:\n${extracted.source.join('\n')}`);
    }
  }
  const subOf = new Map<string, string>();
  for (const [position, integration] of submission.integrationScenarios.entries()) {
    const path = `integrationScenarios.${position}`;
    const failure = appear(integration.planScenario, 'as an integration scenario', `${path}.planScenario`);
    if (failure) return failure;
    if (integration.subScenarios.length === 0) {
      return reject(3, `${path}.subScenarios`, `the integration scenario ${integration.planScenario} has no sub-scenario; it needs at least one`);
    }
    for (const [index, key] of integration.subScenarios.entries()) {
      if (!keys.has(key)) return reject(3, `${path}.subScenarios.${index}`, `the integration scenario ${integration.planScenario} names "${key}", which is no scenario of this submission`);
      const other = subOf.get(key);
      if (other !== undefined) {
        return reject(3, `${path}.subScenarios.${index}`, `"${key}" is already a sub-scenario of ${other}; a scenario is a sub-scenario of at most one integration scenario`);
      }
      subOf.set(key, integration.planScenario);
    }
  }
  for (const [position, scenario] of submission.scenarios.entries()) {
    if (scenario.partOf === undefined) continue;
    if (subOf.get(scenario.key) !== scenario.partOf) {
      return reject(3, `scenarios.${position}.partOf`, `the scenario "${scenario.key}" is part of ${scenario.partOf}, but that plan scenario is no integration scenario listing it among its sub-scenarios`);
    }
  }
  for (const scenario of planScenarios) {
    if (!appearances.has(scenario.id)) {
      return reject(3, 'scenarios', `the plan scenario ${scenario.id} ("${scenario.name}") appears nowhere; make it the origin of one entry scenario or an integration scenario with sub-scenarios`);
    }
  }

  // Rule 4: every entry has a scenario.
  const byEntry = new Map<string, number[]>();
  submission.scenarios.forEach((scenario, position) => byEntry.set(scenario.entry, [...(byEntry.get(scenario.entry) ?? []), position]));
  for (const [position, entry] of entries.entries()) {
    if (!byEntry.has(entry.capability)) {
      return reject(4, `entries.${position}`, `the entry "${entry.capability}" has no scenario; every entry has at least one`);
    }
  }

  // Rule 5: every step of an integration scenario appears in one of its sub-scenarios.
  const integrationSteps = new Map<string, ComparableStep[]>();
  for (const [position, integration] of submission.integrationScenarios.entries()) {
    const steps = stepsOfSource(plan.get(integration.planScenario)!.source);
    integrationSteps.set(integration.planScenario, steps);
    const offered = new Set(integration.subScenarios.flatMap((key) => parsed[keys.get(key)!]!.steps.map(stepKey)));
    const missing = steps.find((step) => !offered.has(stepKey(step)));
    if (missing) {
      return reject(5, `integrationScenarios.${position}.subScenarios`, `the step "${missing.keyword.trim()} ${missing.text}" of ${integration.planScenario} appears in none of its sub-scenarios; pick every step verbatim into one`);
    }
  }

  // Rule 6: scenario citation or the agent's non-behavioral registered-test declaration.
  for (const [position, entry] of entries.entries()) {
    const citing = new Set((byEntry.get(entry.capability) ?? []).flatMap((index) => submission.scenarios[index]!.refs ?? []));
    const declared = new Set<string>();
    for (const [index, candidate] of (entry.nonBehavioralAcceptance ?? []).entries()) {
      const path = `entries.${position}.nonBehavioralAcceptance.${index}`;
      const parsed = nonBehavioralAcceptanceSchema.safeParse(candidate);
      if (!parsed.success) return reject(6, path, `the declaration of "${entry.capability}" is invalid: ${parsed.error.issues.map(issue => issue.message).join('; ')}`);
      const declaration = parsed.data;
      if (!entry.acceptanceRefs.includes(declaration.ref)) return reject(6, `${path}.ref`, `"${declaration.ref}" is no acceptance element of "${entry.capability}"`);
      if (declared.has(declaration.ref)) return reject(6, `${path}.ref`, `"${declaration.ref}" is declared twice by "${entry.capability}"`);
      if (!evidence.registeredTests.has(declaration.test)) return reject(6, `${path}.test`, `"${declaration.test}" is not a registered test for the declared non-behavioral acceptance "${declaration.ref}"`);
      declared.add(declaration.ref);
    }
    for (const [refIndex, ref] of entry.acceptanceRefs.entries()) {
      if (!citing.has(ref) && !declared.has(ref)) {
        return reject(6, `entries.${position}.acceptanceRefs.${refIndex}`, `the acceptance element ${ref} of "${entry.capability}" is cited by none of its scenarios; cite it in the refs of one of them, or declare non-behavioral acceptance with a registered test`);
      }
    }
  }

  const form: AcceptedScenarioForm = {
    scenarios: submission.scenarios.map((scenario, position): FormScenario => {
      const origin = scenario.origin;
      const extracted = origin.kind === 'plan' ? plan.get(origin.planScenario)! : null;
      return {
        key: scenario.key,
        entry: scenario.entry,
        origin: origin.kind === 'plan'
          ? { kind: 'plan', planScenario: origin.planScenario, lines: extracted!.lines, ...(extracted!.document === undefined ? {} : { document: extracted!.document }) }
          : { kind: 'architect', refs: scenario.refs ?? [] },
        partOf: subOf.get(scenario.key) ?? null,
        name: extracted?.name ?? parsed[position]!.name,
        source: extracted ? [...extracted.source] : parsed[position]!.source,
      };
    }),
    integrations: submission.integrationScenarios.map((integration): FormIntegration => {
      const extracted = plan.get(integration.planScenario)!;
      return {
        planScenario: integration.planScenario,
        ...(extracted.document === undefined ? {} : { document: extracted.document }),
        lines: extracted.lines,
        subScenarios: [...integration.subScenarios],
        name: extracted.name,
        source: [...extracted.source],
      };
    }),
  };
  return { ok: true, form, warnings: warningsOf(submission, parsed, integrationSteps, viewNames) };
}

function parseOneScenario(gherkin: string): { ok: true; scenario: ParsedScenario } | { ok: false; problem: string } {
  const lines = ['Feature: submitted', ...gherkin.split('\n')];
  const parsed = parseGherkin(lines.join('\n'));
  if (!parsed.ok) {
    const first = parsed.errors[0]!;
    return { ok: false, problem: `does not parse: ${first.line === null ? '' : `(line ${Math.max(first.line - 1, 1)}) `}${first.message}` };
  }
  const children = parsed.document.feature?.children ?? [];
  const scenario = children.length === 1 ? children[0]!.scenario : undefined;
  if (!scenario) return { ok: false, problem: 'is not exactly one Scenario or Scenario Outline, with no Background, Rule or second scenario' };
  if (scenario.steps.length === 0) return { ok: false, problem: 'has no step' };
  if (scenario.tags.length > 0 || scenario.examples.some((examples) => examples.tags.length > 0)) {
    return { ok: false, problem: 'carries tags; tags are the harness\'s, so the value has none' };
  }
  const { scenarios } = scenariosOf(parsed.document);
  const source = sourceLines(lines, scenario.location.line, scenarios[0]!.nextStart, parsed.document).lines;
  return { ok: true, scenario: { name: scenario.name, source: dedent(source), steps: comparableSteps(scenario.steps) } };
}

function warningsOf(
  submission: ScenarioFormSubmission,
  parsed: readonly ParsedScenario[],
  integrationSteps: ReadonlyMap<string, ComparableStep[]>,
  viewNames: ScenarioViewNames,
): ScenarioWarning[] {
  const warnings: ScenarioWarning[] = [];

  // A step that names an exported symbol or a file path of the architect view.
  const symbols = viewNames.symbols.filter(isDistinctiveSymbol);
  submission.scenarios.forEach((scenario, position) => {
    for (const step of parsed[position]!.steps) {
      const said = `${step.keyword.trim()} ${step.text}`;
      for (const symbol of symbols) {
        if (namesIdentifier(step.text, symbol)) {
          warnings.push({ kind: 'names-view-symbol', scenarios: [scenario.key], message: `The step "${said}" of "${scenario.key}" names the exported symbol ${symbol}; a scenario states behavior at the outside, not the module that implements it` });
        }
      }
      for (const file of viewNames.files) {
        if (namesFile(step.text, file)) {
          warnings.push({ kind: 'names-view-file', scenarios: [scenario.key], message: `The step "${said}" of "${scenario.key}" names the file ${file}; a scenario states behavior at the outside, not the file that implements it` });
        }
      }
    }
  });

  // A sub-scenario none of whose steps came from its integration scenario.
  for (const integration of submission.integrationScenarios) {
    const steps = new Set((integrationSteps.get(integration.planScenario) ?? []).map(stepKey));
    for (const key of integration.subScenarios) {
      const position = submission.scenarios.findIndex((scenario) => scenario.key === key);
      if (!parsed[position]!.steps.some((step) => steps.has(stepKey(step)))) {
        warnings.push({ kind: 'sub-scenario-shares-no-step', scenarios: [key], message: `The sub-scenario "${key}" takes none of its steps from its integration scenario ${integration.planScenario}` });
      }
    }
  }

  // More than one architect scenario of an entry with identical steps.
  const groups = new Map<string, string[]>();
  submission.scenarios.forEach((scenario, position) => {
    if (scenario.origin.kind !== 'architect') return;
    const identity = JSON.stringify([scenario.entry, parsed[position]!.steps.map(stepKey)]);
    groups.set(identity, [...(groups.get(identity) ?? []), scenario.key]);
  });
  for (const [identity, keys] of groups) {
    if (keys.length < 2) continue;
    const entry = (JSON.parse(identity) as [string, unknown])[0];
    warnings.push({ kind: 'duplicate-architect-steps', scenarios: keys, message: `The architect scenarios ${keys.map((key) => `"${key}"`).join(', ')} of "${entry}" have identical steps` });
  }
  return warnings;
}

/**
 * Whether a symbol is distinctive enough to be recognized in prose. An
 * all-lowercase word such as `order` is also an ordinary word, so only
 * symbols with a capital, a digit, `_` or `$` are matched.
 */
function isDistinctiveSymbol(symbol: string): boolean {
  return /^[A-Za-z_$][\w$]*$/.test(symbol) && /[A-Z0-9_$]/.test(symbol) && !/^[A-Z][a-z]+$/.test(symbol);
}

function namesIdentifier(text: string, symbol: string): boolean {
  const escaped = symbol.replace(/[$]/g, '\\$');
  return new RegExp(`(^|[^\\w$])${escaped}($|[^\\w$])`).test(text);
}

/** A step names a file by its path, or by a base name with an extension. */
function namesFile(text: string, file: string): boolean {
  if (text.includes(file)) return true;
  const base = file.split('/').at(-1)!;
  return /\.[A-Za-z0-9]+$/.test(base) && new RegExp(`(^|[^\\w./-])${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^\\w/-])`).test(text);
}
