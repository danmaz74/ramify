import { join } from 'node:path';
import type { BuiltinTool, JsonSchema, WriteTool } from '../../subs/agent/src/interfaces/port.js';
import type { LoadedPackage } from '../prompts/packages.js';
import type { RunPolicy } from '../run/records.js';
import { runDirectory } from '../run/records.js';
import type { HarnessTaskBrief } from '../run/session-operations.js';
import type { KnownProjectFacts } from '../run/task-brief.js';
import type { StepEnvironment } from './engineer.js';
import { projectPath, type KnownFactsInputs, type ProjectPath, type RunPath, type StepInputs } from './inputs.js';

/*
 * What every constructed step has in common, which `step render` and the
 * run read without knowing the role: the packet's inputs, the declarations
 * and the start. Each role's constructor adds what only it needs.
 */

/** One harness tool as the session declares it; its execution is the run's. */
export interface StepToolDeclaration {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Readonly<Record<string, unknown>>;
  readonly mutating?: boolean | undefined;
}

/** The session start of a constructed step: fresh, or the recorded point it continues or forks. */
export type ConstructedStart =
  | { readonly mode: 'fresh'; readonly degraded?: { readonly requested: 'continued' | 'fork'; readonly reason: string } | undefined }
  | { readonly mode: 'continue'; readonly ref: string; readonly session?: string | undefined }
  | { readonly mode: 'fork'; readonly ref: string; readonly session: string; readonly invocation: string };

/** The members every constructed step has. */
export interface ConstructedStepCommon {
  readonly role: StepInputs['role'];
  readonly inputs: StepInputs;
  readonly work: { readonly workItem: string; readonly iteration?: string | undefined };
  readonly attempt: number;
  readonly loaded: LoadedPackage;
  readonly systemPrompt: string;
  readonly prompt: string;
  /** The task brief the packet is delivered as. */
  readonly brief: HarnessTaskBrief;
  readonly submission: {
    readonly toolName: string;
    readonly description: string;
    readonly inputSchema: JsonSchema;
    readonly submissionSchema: string;
  };
  readonly limits: RunPolicy['limits'];
  readonly context: RunPolicy['context']['engineer'];
  readonly start: ConstructedStart;
  readonly equipment: {
    readonly workingDirectory: string;
    readonly builtinTools: readonly (BuiltinTool | WriteTool)[];
    readonly tools: readonly StepToolDeclaration[];
  };
  /** The records the invocation writes before it starts, under its own directory. */
  readonly before: { readonly inputs: StepInputs };
}

/** The resolved location of a project-relative path field. */
export const projectLocation = (environment: StepEnvironment, field: ProjectPath): string => join(environment.projectRoot, field.project);

/** The resolved location of a run-relative path field. */
export function runLocation(environment: StepEnvironment, run: NonNullable<StepInputs['run']>, field: RunPath): string {
  return join(runDirectory(environment.projectRoot, run.planId, run.runId), field.run);
}

/** The project facts a brief carries, as the brief composes them. */
export function knownFacts(known: KnownFactsInputs): KnownProjectFacts {
  const relative = (field: ProjectPath): string => field.project;
  return {
    declaredChecks: { checks: known.declaredChecks.checks, paths: known.declaredChecks.paths.map(relative) },
    modules: known.modules.map(module => ({ module: module.module, directory: relative(module.directory), apiPaths: module.apiPaths.map(relative) })),
    testAreas: known.testAreas.map(area => ({ module: area.module, area: relative(area.area) })),
    scenarioFeatures: known.scenarioFeatures.map(relative),
    stepDirectories: known.stepDirectories.map(entry => ({ directory: relative(entry.directory), files: entry.files.map(relative) })),
  };
}

/** The captured form of a brief's project facts, every path project-relative. */
export function knownFactsInputs(known: KnownProjectFacts): KnownFactsInputs {
  return {
    declaredChecks: { checks: JSON.parse(JSON.stringify(known.declaredChecks.checks)) as KnownFactsInputs['declaredChecks']['checks'], paths: known.declaredChecks.paths.map(projectPath) },
    modules: known.modules.map(module => ({ module: module.module, directory: projectPath(module.directory), apiPaths: module.apiPaths.map(projectPath) })),
    testAreas: known.testAreas.map(area => ({ module: area.module, area: projectPath(area.area) })),
    scenarioFeatures: known.scenarioFeatures.map(projectPath),
    stepDirectories: known.stepDirectories.map(entry => ({ directory: projectPath(entry.directory), files: entry.files.map(projectPath) })),
  };
}

/** The architect view a task names, resolved against the project root. */
export function architectViews(environment: StepEnvironment, views: readonly { readonly path: ProjectPath; readonly revision: string | null; readonly modules: readonly string[]; readonly coverage: readonly string[] }[]): HarnessTaskBrief['environment']['views'] {
  return views.map(view => ({ path: projectLocation(environment, view.path), revision: view.revision, modules: [...view.modules], coverage: [...view.coverage] }));
}

/** The loaded prompt package of a role, which a step cannot be built without. */
export function loadedPackage(environment: StepEnvironment, role: string): LoadedPackage {
  const loaded = environment.packages.get(role);
  if (loaded === undefined) throw new Error(`No prompt package is loaded for the ${role}`);
  return loaded;
}
