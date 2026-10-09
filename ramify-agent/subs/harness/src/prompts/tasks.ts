import type { LoadedPackage, ExtractionTurn, PackageFile } from './packages.js';
import type { ReviewKind } from '../run/records.js';
import { z } from 'zod';
import { qualificationActionSchema } from '../capability/submission.js';
import { initialAnalysisToolName } from '../analysis/submission.js';
import { intakeToolName, principleToolName, checkToolName } from '../analysis/extraction.js';
import { localArchitectToolName } from '../work/submission.js';
import { engineerToolName } from '../work/engineer.js';
import { forkToolName } from '../architecture/submission.js';
import { contractToolName } from '../contracts/submission.js';
import { reviewToolName, orientationToolName } from '../../subs/reviews/src/submission.js';
import { reconciliationToolName } from '../reviews/reconciliation.js';
import { failureAnalysisToolName } from '../work/failure.js';
import { workOrientationToolName, contextSelectorToolName } from '../context-selection/submissions.js';
import { coordinatorActionJsonSchema, coordinatorActionToolName, coordinatorAssessmentToolName,
  coordinatorInvestigationJsonSchema, coordinatorInvestigationToolName, nonfunctionalRepairToolName } from '../nonfunctional/submissions.js';
import { buildDeliveredManifest, type DeliveredInput, type DeliveredManifest } from './delivered-manifest.js';
import { taskBriefingRevision, type BriefingDelivery } from './briefings.js';

export type TaskKind = 'initial-analysis' | ExtractionTurn | 'placement' | 'orientation' | 'assignment' | 'completion' | 'repair'
  | 'selection' | 'reselection' | 'capability' | 'engineering' | 'contract' | 'reconciliation' | ReviewKind | 'design-orientation'
  | 'failure-analysis' | 'assessment' | 'action' | 'investigation' | 'standalone-command' | 'capability-qualification' | 'consultation';

export interface TaskEnvironment {
  readonly projectRoot: string;
  readonly workingDirectory: string;
  readonly candidate: string | null;
  readonly snapshot: string | null;
  readonly limits: Readonly<Record<string, unknown>>;
  readonly availableTools: readonly string[];
  readonly views: readonly { readonly path: string; readonly revision: string | null; readonly modules: readonly string[]; readonly coverage: readonly string[] }[];
  readonly supportPaths: readonly string[];
  readonly cucumberConfiguration: string | null;
}

/**
 * A single-brace misspelling of a declared placeholder name would render
 * literally, so every declared name is refused in that form. Only declared
 * names are checked: literal JSON or code braces are not placeholders.
 */
export function rejectSingleBracePlaceholders(template: string, names: Iterable<string>): void {
  for (const name of new Set(names)) {
    if (new RegExp(`(?<!\\{)\\{${name}\\}(?!\\})`).test(template)) throw new Error(`Malformed required placeholder {${name}}`);
  }
}

/** Required slots are declared, not inferred from arbitrary JSON/code braces. */
export function renderRequiredSlots(template: string, values: Readonly<Record<string, string>>, required: readonly string[]): string {
  rejectSingleBracePlaceholders(template, ['procedure', 'submissionTool', ...Object.keys(values), ...required]);
  for (const name of required) {
    if (!(name in values) || !values[name]?.trim()) throw new Error(`Missing required prompt input ${name}`);
  }
  for (const match of template.matchAll(/\{\{(\w+)\}\}/g)) if (!(match[1]! in values)) throw new Error(`Unresolved required placeholder {{${match[1]}}}`);
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name]!);
}

export function stableRoleInstructions(loaded: LoadedPackage): string {
  return renderRequiredSlots(loaded.system, { skill: loaded.skill, skillDirectory: loaded.skillDirectory, contractSkill: loaded.extraSkill }, []);
}

/** The role's delivered sources: its system file and the skills its slots embed. Other package files are not delivered. */
function roleSources(loaded: LoadedPackage): PackageFile[] {
  const system = loaded.files.find(file => file.kind === 'system');
  return loaded.files.filter(file =>
    file.kind === 'system' && file.path === system?.path ||
    file.kind === 'skill' && (loaded.embeddedSkillPaths ?? []).includes(file.path));
}

/** The current procedure's delivered sources: its own file and the section files it embeds. */
function procedureSources(loaded: LoadedPackage, task: { readonly source: string | null; readonly embedded: readonly string[] }): PackageFile[] {
  return loaded.files.filter(file => file.path === task.source || task.embedded.includes(file.path));
}

/**
 * The package paths a task actually delivers to the model: the role's
 * sources and the current procedure's, including embedded sections. The
 * package's synthetic schema files and the procedures other tasks use are
 * not delivered and are not named.
 */
export function deliveredSupportPaths(loaded: LoadedPackage, kind: TaskKind, consultationSubmissionSchema?: string): string[] {
  const task = taskDefinition(loaded, kind, consultationSubmissionSchema);
  return [...new Set([...roleSources(loaded), ...procedureSources(loaded, task)].map(file => file.path))];
}

export interface TaskPacket {
  readonly roleInstructions: string;
  readonly message: string;
  readonly submissionTool: string;
  /** Schema appears once, in this declaration's description, matching the compact tool mechanism. */
  readonly declaration: { readonly name: string; readonly description: string; readonly inputSchema: { readonly type: 'object' }; readonly mutating: false };
  /** Manifest components. Role/tool entries are separate provider inputs; remaining entries occur once within message. */
  readonly additions: readonly DeliveredInput[];
  readonly manifest: DeliveredManifest;
}

export function buildTaskPacket(input: {
  readonly loaded: LoadedPackage;
  readonly kind: TaskKind;
  readonly objective: string;
  readonly goal: string;
  readonly requirements: readonly string[];
  readonly environment: TaskEnvironment;
  readonly briefing: BriefingDelivery;
  readonly inheritedPoint: string | null;
  readonly inherited: readonly DeliveredInput[];
  /** Supplied once for a fresh session or a role change, false for ordinary continuation. */
  readonly supplyRoleInstructions: boolean;
  readonly changedPaths?: readonly { readonly path: string; readonly annotation?: string }[];
  /** Consultation's actual caller-owned schema, serialized from its runtime validator. */
  readonly consultationSubmissionSchema?: string;
}): TaskPacket {
  const { loaded, environment } = input;
  if (!input.objective.trim() || !input.goal.trim() || input.requirements.length === 0 || input.requirements.some(requirement => !requirement.trim())) throw new Error('Task requires objective, goal and complete requirement text');
  if (!environment.projectRoot.trim() || !environment.workingDirectory.trim()) throw new Error('Task environment requires project root and current working directory');
  for (const key of ['candidate', 'snapshot', 'limits', 'availableTools', 'views', 'supportPaths', 'cucumberConfiguration'] as const) {
    if (environment[key] === undefined) throw new Error(`Missing required environment input ${key}`);
  }
  if (!input.supplyRoleInstructions && !input.inherited.some(item => item.key === `role:${loaded.role}` && item.kind === 'role-instructions')) throw new Error(`Current role ${loaded.role} is not inherited; append its instructions explicitly`);
  if (input.changedPaths && new Set(input.changedPaths.map(item => item.path)).size !== input.changedPaths.length) throw new Error('Canonical changed paths must be unique');
  if (input.briefing.kind === 'unavailable') throw new Error(input.briefing.reason);
  if (input.briefing.mode === 'full' && input.inherited.length > 0) throw new Error('Full fresh briefing cannot be appended to an inherited session; use its named delta or post-fork updates');
  const canonical = taskBriefingRevision({ revision: input.briefing.revision, goal: input.goal, requirements: input.requirements, sections: [] });
  for (const section of canonical.sections) {
    if (!input.briefing.currentSections.some(current => current.key === section.key && current.text === section.text)) throw new Error(`Current task briefing requires canonical ${section.key} section matching its explicit inputs`);
  }
  const task = taskDefinition(loaded, input.kind, input.consultationSubmissionSchema);
  if (!environment.availableTools.includes(task.tool)) throw new Error(`Current submission tool ${task.tool} is unavailable`);
  if (['code', 'scope', 'design'].includes(input.kind) && (!environment.candidate || !environment.snapshot)) throw new Error('Review requires current candidate and snapshot identities');
  const procedure = renderRequiredSlots(task.procedure, { submissionTool: task.tool }, ['submissionTool']);
  const roleInstructions = stableRoleInstructions(loaded);
  const declaration = { name: task.tool, description: `Submit this task using exactly this JSON schema: ${JSON.stringify(JSON.parse(task.schema))}`,
    inputSchema: { type: 'object' as const }, mutating: false as const };
  const previousDeclaration = input.inherited.find(item => item.kind === 'tool-declaration' && item.key === `tool:${task.tool}`);
  if (previousDeclaration && previousDeclaration.text !== JSON.stringify(declaration)) throw new Error(`Immutable tool declaration changed for ${task.tool}; use a new tool name`);
  const envText = `# Current environment\n${JSON.stringify(environment, null, 2)}`;
  const procedureText = `# Current procedure\n${procedure}`;
  const revisionText = `Briefing revision: ${input.briefing.revision}; based on: ${input.briefing.basedOnRevision ?? 'none'} (${input.briefing.mode})`;
  const taskText = [`# Current task: ${input.kind}`, input.objective,
    ...(input.changedPaths === undefined ? [] : ['', '# Canonical changed paths', ...input.changedPaths.map(item => `- ${item.path}${item.annotation ? ` (${item.annotation})` : ''}`)]),
    '', `Submit only through \`${task.tool}\`. Only an accepted submission completes this task.`].join('\n');
  const additions: DeliveredInput[] = [
    ...(input.supplyRoleInstructions ? [{ key: `role:${loaded.role}`, kind: 'role-instructions' as const, text: roleInstructions,
      source: loaded.files.find(file => file.kind === 'system')?.path ?? null, revision: loaded.package,
      sources: roleSources(loaded) }] : []),
    ...(!input.inherited.some(item => item.kind === 'tool-declaration' && item.key === `tool:${task.tool}` && item.text === JSON.stringify(declaration)) ? [{ key: `tool:${task.tool}`, kind: 'tool-declaration' as const, text: JSON.stringify(declaration), source: null, revision: null }] : []),
    { key: 'briefing-state', kind: 'task', text: revisionText, source: null, revision: input.briefing.revision },
    ...input.briefing.additions,
    { key: `procedure:${input.kind}`, kind: 'procedure', text: procedureText, source: task.source, revision: loaded.package,
      sources: procedureSources(loaded, task) },
    { key: 'environment', kind: 'environment', text: envText, source: null, revision: null },
    { key: 'task', kind: 'task', text: taskText, source: null, revision: input.briefing.revision },
  ];
  const message = additions.filter(item => item.kind !== 'role-instructions' && item.kind !== 'tool-declaration').map(item => item.text).join('\n\n');
  return { roleInstructions, message, submissionTool: task.tool, declaration, additions,
    manifest: buildDeliveredManifest({ inheritedPoint: input.inheritedPoint, inherited: input.inherited, appended: additions, currentMessage: message }) };
}

function taskDefinition(loaded: LoadedPackage, kind: TaskKind, consultationSubmissionSchema?: string): { tool: string; schema: string; procedure: string; source: string | null; embedded: readonly string[] } {
  let tool: string | undefined;
  let schema = loaded.submissionSchema;
  let procedure = loaded.procedure;
  let source = loaded.files.find(file => file.kind === 'procedure')?.path ?? null;
  const role = loaded.role;
  if (role === 'initial-architect' && kind === 'initial-analysis') tool = initialAnalysisToolName;
  if (role === 'catalog-extractor' && ['intake', 'principles', 'check'].includes(kind)) {
    const turn = kind as ExtractionTurn;
    const extraction = loaded.extraction?.[turn];
    if (!extraction) throw new Error(`Missing ${turn} procedure`);
    tool = { intake: intakeToolName, principles: principleToolName, check: checkToolName }[turn];
    schema = extraction.submissionSchema; procedure = extraction.procedure;
    source = `subs/harness/src/analysis/${turn}.procedure.md`;
  }
  if (role === 'global-fork' && kind === 'placement') tool = forkToolName;
  if (role === 'local-architect' && ['assignment', 'completion', 'repair'].includes(kind)) tool = localArchitectToolName;
  if (role === 'local-architect' && kind === 'orientation') {
    if (!loaded.workOrientation) throw new Error('Missing work orientation procedure');
    tool = workOrientationToolName; schema = loaded.workOrientation.submissionSchema; procedure = loaded.workOrientation.procedure;
    source = 'subs/harness/src/context-selection/orientation.procedure.md';
  }
  if (role === 'context-selector' && ['selection', 'reselection'].includes(kind)) tool = contextSelectorToolName;
  if (role === 'engineer' && ['engineering', 'repair', 'standalone-command'].includes(kind)) tool = engineerToolName;
  if (role === 'engineer' && kind === 'consultation') {
    if (!consultationSubmissionSchema?.trim()) throw new Error('Consultation requires the actual caller-owned submission schema');
    const supplied: unknown = JSON.parse(consultationSubmissionSchema);
    if (supplied === null || typeof supplied !== 'object' || Array.isArray(supplied) || (supplied as { type?: unknown }).type !== 'object') throw new Error('Consultation requires the actual object submission schema');
    tool = 'answer_capability_consultation'; schema = consultationSubmissionSchema;
    procedure = 'Answer only the named read-only consumer consultation using the supplied question, current plan, source and references. Use the supplied views and available read-only tools to state evidence, objections and uncertainty. Submit the answer through {{submissionTool}}; an answer authorizes no source changes.';
    source = null;
  }
  if (['local-architect', 'capability-architect'].includes(role) && kind === 'capability-qualification') {
    tool = 'submit_capability_qualification'; schema = JSON.stringify(z.toJSONSchema(qualificationActionSchema));
    procedure = 'Qualify only the named capability request using its current request and invocation identities, captured source, current plan and supplied API views. Inspect the actual exposed API and use sites; a matching name does not establish sufficient behavior and a missing name does not establish absence. Use available read-only tools. Submit satisfy-with-existing with concrete API evidence, delegate-capability with placement reasoning, request-placement, or unresolved through {{submissionTool}}.';
    source = null;
  }
  if (role === 'capability-architect' && kind === 'capability') tool = 'submit_capability_action';
  if (role === 'contract-engineer' && kind === 'contract') tool = contractToolName;
  if (['local-architect', 'capability-architect'].includes(role) && kind === 'reconciliation') {
    if (!loaded.reconciliation) throw new Error('Missing reconciliation procedure');
    tool = reconciliationToolName; schema = loaded.reconciliation.submissionSchema; procedure = loaded.reconciliation.procedure;
    source = 'subs/harness/src/prompts/reconciliation.procedure.md';
  }
  if (role === 'reviewer' && ['code', 'scope', 'design'].includes(kind)) {
    tool = reviewToolName; procedure = loaded.reviewer!.procedures[kind as ReviewKind];
    source = `subs/harness/src/prompts/${kind}-review.procedure.md`;
  }
  if (role === 'reviewer' && kind === 'design-orientation') {
    tool = orientationToolName; schema = loaded.reviewer!.orientation.submissionSchema;
    procedure = loaded.reviewer!.orientation.system;
    source = 'subs/harness/src/prompts/reviewer-orientation.system.md';
  }
  if (role === 'failure-analyst' && kind === 'failure-analysis') tool = failureAnalysisToolName;
  if (role === 'nonfunctional-coordinator' && kind === 'assessment') tool = coordinatorAssessmentToolName;
  if (role === 'nonfunctional-coordinator' && kind === 'action') {
    tool = coordinatorActionToolName; schema = JSON.stringify(coordinatorActionJsonSchema);
    procedure = 'Choose only the next action the current harness decision permits. Submit the action with {{submissionTool}}; do not edit source.';
    source = null;
  }
  if (role === 'nonfunctional-coordinator' && kind === 'investigation') {
    tool = coordinatorInvestigationToolName; schema = JSON.stringify(coordinatorInvestigationJsonSchema);
    procedure = 'Investigate only the named requirements against the supplied candidate. Report scope, evidence and uncertainty through {{submissionTool}}. Use read-only tools; make no repair or final satisfaction judgment.';
    source = null;
  }
  if (role === 'nonfunctional-repair-engineer' && kind === 'repair') tool = nonfunctionalRepairToolName;
  if (!tool) throw new Error(`Unsupported role/task pair ${role}/${kind}`);
  // Only the package's main procedure has its section files filled in; a replaced procedure embeds none.
  const embedded = procedure === loaded.procedure ? loaded.embeddedProcedurePaths ?? [] : [];
  return { tool, schema, procedure, source, embedded };
}
