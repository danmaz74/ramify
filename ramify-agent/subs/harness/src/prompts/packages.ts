import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Role } from '../interfaces/protocol/runs.js';
import { initialAnalysisJsonSchema, initialAnalysisToolName } from '../analysis/submission.js';
import { localArchitectJsonSchema, localArchitectSubmissionKinds, localArchitectToolName } from '../work/submission.js';
import { engineerJsonSchema, engineerSubmissionKinds, engineerToolName } from '../work/engineer.js';
import { forkJsonSchema, forkSubmissionKinds, forkToolName } from '../architecture/submission.js';
import { contractJsonSchema, contractSubmissionKinds, contractToolName } from '../contracts/submission.js';
import { orientationJsonSchema, orientationToolName, reviewJsonSchema, reviewToolName } from '../reviews/submission.js';
import { reconciliationJsonSchema, reconciliationToolName } from '../reviews/reconciliation.js';
import { failureAnalysisJsonSchema, failureAnalysisToolName } from '../work/failure.js';
import { promptPackageManifestSchema, type PromptPackageManifest, type ReviewKind } from '../run/records.js';
import { shellMaxTimeoutMs } from '../tools/shell.js';

/*
 * One prompt package per role, versioned and hashed into the run's
 * `prompts/manifest.json` at `start-run`. `RunRecord.prompts` carries each
 * package's hash and every `Invocation` records the package, the hash and
 * the hash of its inputs. The rendered prompt is not stored: it may hold
 * file contents.
 *
 * `submissionKinds` names the union members a package offers its role. A
 * member a package does not offer is not merely unused: the role never sees
 * it, so no run can produce it.
 */

/** The package root, which every recorded path is relative to. */
const packageRoot = fileURLToPath(new URL('../../../../', import.meta.url));

const initialSystemFile = fileURLToPath(new URL('./initial-architect.system.md', import.meta.url));
const initialProcedureFile = fileURLToPath(new URL('./initial-analysis.procedure.md', import.meta.url));
const forkSystemFile = fileURLToPath(new URL('./global-fork.system.md', import.meta.url));
const forkProcedureFile = fileURLToPath(new URL('./global-fork.procedure.md', import.meta.url));
const localSystemFile = fileURLToPath(new URL('./local-architect.system.md', import.meta.url));
const localProcedureFile = fileURLToPath(new URL('./local-architect.procedure.md', import.meta.url));
const reconciliationProcedureFile = fileURLToPath(new URL('./reconciliation.procedure.md', import.meta.url));
const engineerSystemFile = fileURLToPath(new URL('./engineer.system.md', import.meta.url));
const engineerProcedureFile = fileURLToPath(new URL('./engineer.procedure.md', import.meta.url));
const contractSystemFile = fileURLToPath(new URL('./contract-engineer.system.md', import.meta.url));
const contractProcedureFile = fileURLToPath(new URL('./contract.procedure.md', import.meta.url));
const reviewerSystemFile = fileURLToPath(new URL('./reviewer.system.md', import.meta.url));
const codeReviewProcedureFile = fileURLToPath(new URL('./code-review.procedure.md', import.meta.url));
const scopeReviewProcedureFile = fileURLToPath(new URL('./scope-review.procedure.md', import.meta.url));
const designReviewProcedureFile = fileURLToPath(new URL('./design-review.procedure.md', import.meta.url));
const orientationSystemFile = fileURLToPath(new URL('./reviewer-orientation.system.md', import.meta.url));
const failureAnalystSystemFile = fileURLToPath(new URL('./failure-analyst.system.md', import.meta.url));
const failureAnalysisProcedureFile = fileURLToPath(new URL('./failure-analysis.procedure.md', import.meta.url));

/** The contract skill the harness supplies with a contract iteration. */
const contractSkillFile = fileURLToPath(new URL('./contract.skill.md', import.meta.url));

/** The module-architect skill this package carries, used unchanged. */
export const defaultSkillDirectory = fileURLToPath(new URL('../../../../skills/module-architect', import.meta.url));

/** The one generated file of a package: the schema the agent's tool is given. */
const submissionSchemaNames = {
  'initial-architect': 'initial-analysis.schema.json',
  'global-fork': 'global-fork.schema.json',
  'local-architect': 'local-architect.schema.json',
  engineer: 'engineer.schema.json',
  'contract-engineer': 'contract-engineer.schema.json',
  reviewer: 'review.schema.json',
  'failure-analyst': 'failure-analysis.schema.json',
} as const;

export function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** One file of a package, as the manifest records it. */
export interface PackageFile {
  readonly path: string;
  readonly hash: string;
  readonly kind: 'system' | 'procedure' | 'skill' | 'submission-schema';
  /** The bytes the run measures as a support document. */
  readonly bytes: number;
}

/** One package, loaded: what it is made of, and the text each part contributes. */
export interface LoadedPackage {
  readonly role: Role;
  readonly package: string;
  readonly hash: string;
  readonly files: readonly PackageFile[];
  readonly submissionKinds: readonly string[];
  readonly system: string;
  readonly procedure: string;
  readonly skill: string;
  readonly skillDirectory: string;
  /** A further skill this package carries, such as the contract skill; empty where it has none. */
  readonly extraSkill: string;
  readonly submissionSchema: string;
  /**
   * The reviewer's texts beyond its system prompt: one procedure per review
   * question, and the design orientation's own system prompt and
   * submission. Only the reviewer's package has them.
   */
  readonly reviewer?: {
    readonly procedures: Readonly<Record<ReviewKind, string>>;
    readonly orientation: { readonly system: string; readonly submissionSchema: string };
  } | undefined;
  /**
   * The local architect's reconciliation fork: its procedure and its
   * submission. Only the local architect's package has them.
   */
  readonly reconciliation?: { readonly procedure: string; readonly submissionSchema: string } | undefined;
}

export interface PromptPackageOptions {
  readonly skillDirectory?: string | undefined;
}

/** The versions of the packages this iteration ships. */
export const initialArchitectPackage = 'initial-architect/2';
export const globalForkPackage = 'global-fork/2';
export const localArchitectPackage = 'local-architect/5';
export const engineerPackage = 'engineer/3';
export const contractEngineerPackage = 'contract-engineer/2';
export const reviewerPackage = 'reviewer/3';
export const failureAnalystPackage = 'failure-analyst/1';

/**
 * Loads every package a run offers. A role with no package yet has no entry:
 * its prompt is written by the iteration that invokes it.
 */
export async function loadPromptPackages(options: PromptPackageOptions = {}): Promise<{
  readonly manifest: PromptPackageManifest;
  readonly packages: ReadonlyMap<Role, LoadedPackage>;
}> {
  const packages = new Map<Role, LoadedPackage>([
    ['initial-architect', await loadInitialArchitect(options)],
    ['global-fork', await loadGlobalFork(options)],
    ['local-architect', await loadLocalArchitect(options)],
    ['engineer', await loadEngineer(options)],
    ['contract-engineer', await loadContractEngineer(options)],
    ['reviewer', await loadReviewer(options)],
    ['failure-analyst', await loadFailureAnalyst(options)],
  ]);
  const manifest = promptPackageManifestSchema.parse({
    schema: 'ramify-agent.prompt-manifest/1',
    packages: Object.fromEntries([...packages].map(([role, loaded]) => [role, {
      package: loaded.package,
      hash: loaded.hash,
      files: loaded.files.map(file => ({ path: file.path, hash: file.hash, kind: file.kind })),
      submissionKinds: [...loaded.submissionKinds],
    }])),
  });
  return { manifest, packages };
}

function loadInitialArchitect(options: PromptPackageOptions): Promise<LoadedPackage> {
  return loadPackage({
    role: 'initial-architect',
    name: initialArchitectPackage,
    systemFile: initialSystemFile,
    procedureFile: initialProcedureFile,
    schema: initialAnalysisJsonSchema,
    /** The one submission this package offers; the analysis is a single member. */
    submissionKinds: ['initial-analysis'],
    options,
  });
}

/**
 * One fork of the architect context. It offers the two members of the fork
 * union: the decision that commits, and the partial return that commits
 * nothing and is never appended to the parent.
 */
function loadGlobalFork(options: PromptPackageOptions): Promise<LoadedPackage> {
  return loadPackage({
    role: 'global-fork',
    name: globalForkPackage,
    systemFile: forkSystemFile,
    procedureFile: forkProcedureFile,
    schema: forkJsonSchema,
    submissionKinds: [...forkSubmissionKinds],
    options,
  });
}

/**
 * The local architect's package. It offers the members of the union this
 * iteration produces; a member a package does not offer is one the role
 * never sees, so no run can produce it. Its reconciliation fork has a
 * procedure and a submission of its own, both part of the hash.
 */
async function loadLocalArchitect(options: PromptPackageOptions): Promise<LoadedPackage> {
  const reconciliation = await readFile(reconciliationProcedureFile, 'utf8');
  const reconciliationSchema = `${JSON.stringify(reconciliationJsonSchema, null, 2)}\n`;
  const loaded = await loadPackage({
    role: 'local-architect',
    name: localArchitectPackage,
    systemFile: localSystemFile,
    procedureFile: localProcedureFile,
    schema: localArchitectJsonSchema,
    submissionKinds: [...localArchitectSubmissionKinds, 'reconciliation'],
    extraFiles: [
      describe(reconciliationProcedureFile, reconciliation, 'procedure'),
      { path: 'reconciliation.schema.json', hash: sha256(reconciliationSchema), kind: 'submission-schema', bytes: Buffer.byteLength(reconciliationSchema) },
    ],
    options,
  });
  return { ...loaded, reconciliation: { procedure: withoutVersionComment(reconciliation).trim(), submissionSchema: reconciliationSchema } };
}

/**
 * The engineer's package. It offers the four members of the union this
 * iteration produces. Its system prompt does not include the module
 * architect's skill: what a Ramify project is, where the API view is and how
 * an unexposed symbol is reported are stated in the prompt itself.
 */
function loadEngineer(options: PromptPackageOptions): Promise<LoadedPackage> {
  return loadPackage({
    role: 'engineer',
    name: engineerPackage,
    systemFile: engineerSystemFile,
    procedureFile: engineerProcedureFile,
    schema: engineerJsonSchema,
    submissionKinds: [...engineerSubmissionKinds],
    options,
  });
}

/**
 * The contract sub-session's package. It offers the two members of the
 * contract union and carries the contract skill beside the module
 * architect's: the role is an engineer's, and the skill is what makes it a
 * contract iteration.
 */
function loadContractEngineer(options: PromptPackageOptions): Promise<LoadedPackage> {
  return loadPackage({
    role: 'contract-engineer',
    name: contractEngineerPackage,
    systemFile: contractSystemFile,
    procedureFile: contractProcedureFile,
    schema: contractJsonSchema,
    submissionKinds: [...contractSubmissionKinds],
    extraSkillFile: contractSkillFile,
    options,
  });
}

/**
 * The reviewer's package: code, scope and design review of one frozen
 * candidate, and the design orientation that reads the guidance once. Its
 * review submission is one; the orientation's is the other. Every file is
 * part of its hash, so a changed procedure is another package.
 */
async function loadReviewer(options: PromptPackageOptions): Promise<LoadedPackage> {
  const [scope, design, orientation] = await Promise.all([
    readFile(scopeReviewProcedureFile, 'utf8'),
    readFile(designReviewProcedureFile, 'utf8'),
    readFile(orientationSystemFile, 'utf8'),
  ]);
  const orientationSchema = `${JSON.stringify(orientationJsonSchema, null, 2)}\n`;
  const loaded = await loadPackage({
    role: 'reviewer',
    name: reviewerPackage,
    systemFile: reviewerSystemFile,
    procedureFile: codeReviewProcedureFile,
    schema: reviewJsonSchema,
    submissionKinds: ['review', 'orientation'],
    extraFiles: [
      describe(scopeReviewProcedureFile, scope, 'procedure'),
      describe(designReviewProcedureFile, design, 'procedure'),
      describe(orientationSystemFile, orientation, 'system'),
      { path: 'orientation.schema.json', hash: sha256(orientationSchema), kind: 'submission-schema', bytes: Buffer.byteLength(orientationSchema) },
    ],
    options,
  });
  return {
    ...loaded,
    reviewer: {
      procedures: { code: loaded.procedure, scope: withoutVersionComment(scope).trim(), design: withoutVersionComment(design).trim() },
      orientation: { system: withoutVersionComment(orientation), submissionSchema: orientationSchema },
    },
  };
}

/**
 * The failure analyst's package: it reads what an engineer that ended
 * without a result left, and submits a short account before the local
 * architect is briefed. It offers one submission.
 */
function loadFailureAnalyst(options: PromptPackageOptions): Promise<LoadedPackage> {
  return loadPackage({
    role: 'failure-analyst',
    name: failureAnalystPackage,
    systemFile: failureAnalystSystemFile,
    procedureFile: failureAnalysisProcedureFile,
    schema: failureAnalysisJsonSchema,
    submissionKinds: ['failure-analysis'],
    options,
  });
}

async function loadPackage(request: {
  readonly role: Role;
  readonly name: string;
  readonly systemFile: string;
  readonly procedureFile: string;
  readonly schema: unknown;
  readonly submissionKinds: readonly string[];
  /** A further skill file this package carries beside the module architect's. */
  readonly extraSkillFile?: string | undefined;
  /** Further files of the package, already read, which its hash covers. */
  readonly extraFiles?: readonly PackageFile[] | undefined;
  readonly options: PromptPackageOptions;
}): Promise<LoadedPackage> {
  const skillDirectory = request.options.skillDirectory ?? defaultSkillDirectory;
  const [system, procedure] = await Promise.all([readFile(request.systemFile, 'utf8'), readFile(request.procedureFile, 'utf8')]);
  const skillFiles = (await listFiles(skillDirectory)).sort();
  const skill = await readFile(join(skillDirectory, 'SKILL.md'), 'utf8');
  const extraSkill = request.extraSkillFile === undefined ? '' : await readFile(request.extraSkillFile, 'utf8');
  const submissionSchema = `${JSON.stringify(request.schema, null, 2)}\n`;
  const schemaName = submissionSchemaNames[request.role as keyof typeof submissionSchemaNames] ?? `${request.role}.schema.json`;

  const files: PackageFile[] = [
    describe(request.systemFile, system, 'system'),
    describe(request.procedureFile, procedure, 'procedure'),
    ...(await Promise.all(skillFiles.map(async path => describe(path, await readFile(path, 'utf8'), 'skill')))),
    ...(request.extraSkillFile === undefined ? [] : [describe(request.extraSkillFile, extraSkill, 'skill')]),
    { path: schemaName, hash: sha256(submissionSchema), kind: 'submission-schema', bytes: Buffer.byteLength(submissionSchema) },
    ...(request.extraFiles ?? []),
  ];

  return {
    role: request.role,
    package: request.name,
    hash: packageHash(files),
    files,
    submissionKinds: request.submissionKinds,
    system: withoutVersionComment(system),
    procedure: withoutVersionComment(procedure).trim(),
    skill: skill.trim(),
    skillDirectory,
    extraSkill: withoutVersionComment(extraSkill).trim(),
    submissionSchema,
  };
}

function describe(path: string, content: string, kind: PackageFile['kind']): PackageFile {
  return {
    path: relative(packageRoot, path).split(sep).join('/'),
    hash: sha256(content),
    kind,
    bytes: Buffer.byteLength(content),
  };
}

/** The package's hash: over every file below it, by path, so a changed skill changes it. */
function packageHash(files: readonly PackageFile[]): string {
  const parts = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0)).map(file => `${file.path}\n${file.hash}`);
  return sha256(parts.join('\n'));
}

/** The body of a versioned file, without the comment that names its version. */
function withoutVersionComment(text: string): string {
  const first = text.split('\n', 1)[0] ?? '';
  return first.startsWith('<!--') ? text.slice(first.length + 1) : text;
}

/** The rendered system prompt of the initial architect. It is never stored: it holds file contents. */
export function renderInitialArchitectPrompt(loaded: LoadedPackage, projectRoot: string): string {
  return render(loaded, projectRoot, initialAnalysisToolName);
}

/** The rendered system prompt of one placement fork. It is never stored either. */
export function renderGlobalForkPrompt(loaded: LoadedPackage, projectRoot: string): string {
  return render(loaded, projectRoot, forkToolName);
}

/** The rendered system prompt of a local architect. It is never stored either. */
export function renderLocalArchitectPrompt(loaded: LoadedPackage, projectRoot: string): string {
  return render(loaded, projectRoot, localArchitectToolName);
}

/** The rendered system prompt of a local architect's reconciliation fork. It is never stored either. */
export function renderReconciliationPrompt(loaded: LoadedPackage, projectRoot: string): string {
  const reconciliation = loaded.reconciliation;
  if (reconciliation === undefined) throw new Error(`The ${loaded.package} package has no reconciliation procedure`);
  return render({ ...loaded, procedure: reconciliation.procedure, submissionSchema: reconciliation.submissionSchema }, projectRoot, reconciliationToolName);
}

/**
 * The rendered system prompt of an engineer, which states the longest one
 * of its shell commands may run: the policy's, or what its assignment raised
 * it to. It is never stored either.
 */
export function renderEngineerPrompt(loaded: LoadedPackage, projectRoot: string, commandTimeoutMs: number = shellMaxTimeoutMs): string {
  return render(loaded, projectRoot, engineerToolName, { commandTimeoutMs: String(commandTimeoutMs) });
}

/** The rendered system prompt of one contract sub-session, with its command maximum. It is never stored either. */
export function renderContractPrompt(loaded: LoadedPackage, projectRoot: string, commandTimeoutMs: number = shellMaxTimeoutMs): string {
  return render(loaded, projectRoot, contractToolName, { commandTimeoutMs: String(commandTimeoutMs) });
}

/** The rendered system prompt of a failure analyst, over the evidence in its working directory. It is never stored either. */
export function renderFailureAnalystPrompt(loaded: LoadedPackage, workingDirectory: string): string {
  return render(loaded, workingDirectory, failureAnalysisToolName, { workingDirectory });
}

function render(loaded: LoadedPackage, projectRoot: string, submissionTool: string, extra: Readonly<Record<string, string>> = {}): string {
  return fill(loaded.system, {
    ...extra,
    projectRoot,
    skillDirectory: loaded.skillDirectory,
    skill: loaded.skill,
    procedure: fill(loaded.procedure, { submissionTool }),
    contractSkill: loaded.extraSkill,
    submissionTool,
    submissionSchema: loaded.submissionSchema.trim(),
  });
}

/** The rendered system prompt of one reviewer of one question. It is never stored either. */
export function renderReviewerPrompt(loaded: LoadedPackage, projectRoot: string, kind: ReviewKind = 'code'): string {
  const procedure = loaded.reviewer?.procedures[kind];
  if (procedure === undefined) throw new Error(`The ${loaded.package} package has no ${kind} review procedure`);
  return render({ ...loaded, procedure }, projectRoot, reviewToolName);
}

/** The rendered system prompt of a design orientation. It is never stored either. */
export function renderOrientationPrompt(loaded: LoadedPackage): string {
  const orientation = loaded.reviewer?.orientation;
  if (orientation === undefined) throw new Error(`The ${loaded.package} package has no design orientation`);
  return fill(orientation.system, { submissionTool: orientationToolName, submissionSchema: orientation.submissionSchema.trim() });
}

/** The identity of what one invocation was given, beside the package's own hash. */
export function inputsHash(parts: readonly string[]): string {
  return sha256(parts.join('\n\u0000\n'));
}

function fill(template: string, values: Readonly<Record<string, string>>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match);
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}
