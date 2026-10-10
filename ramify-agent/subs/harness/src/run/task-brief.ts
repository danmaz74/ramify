import { join } from 'node:path';
import type { TaskEnvironment, TaskKind } from '../prompts/tasks.js';
import type { TestArea } from './project-config.js';
import type { HarnessTaskBrief } from './session-operations.js';
import { taskSupportSections } from '../work/task-support.js';
import { declaredCheckInputs, moduleInputPointers, startingPointsSection, type StartingPointGroup } from '../work/starting-inputs.js';

/*
 * The task brief of one invocation, composed from facts the caller already
 * holds. The run collects the facts from its records and the project; a step
 * reads them from its recorded inputs. Both compose the brief here, so the
 * brief a run delivers and the brief a step renders are the same function of
 * the same facts.
 */

/** The project facts a role that works in the source is told of, every path project-relative. */
export interface KnownProjectFacts {
  /** The configured audit checks and the configuration pointers that exist. */
  readonly declaredChecks: { readonly checks: readonly unknown[]; readonly paths: readonly string[] };
  readonly modules: readonly { readonly module: string; readonly directory: string; readonly apiPaths: readonly string[] }[];
  readonly testAreas: readonly TestArea[];
  /** The feature files of the tracked scenarios these modules own, once each. */
  readonly scenarioFeatures: readonly string[];
  /** Their step directories, with the step files observed in each. */
  readonly stepDirectories: readonly { readonly directory: string; readonly files: readonly string[] }[];
}

export interface TaskBriefFacts {
  readonly kind: TaskKind;
  /** The work the objective names, as the invocation records it. */
  readonly work: unknown;
  readonly goal: string;
  readonly requirements: readonly string[];
  /** The task message the support sections are taken from. */
  readonly prompt: string;
  /** Text delivered separately, which the support sections leave out. */
  readonly omit: readonly string[];
  readonly literalSections: HarnessTaskBrief['sections'];
  /** The starting points, in the order they are delivered. */
  readonly startingPointGroups: readonly StartingPointGroup[];
  /** Present for a role that is told of the project's checks, modules and scenario files. */
  readonly known?: KnownProjectFacts | undefined;
  readonly retainInheritedSections?: boolean | undefined;
  readonly consultationSubmissionSchema?: string | undefined;
  readonly environment: TaskEnvironment;
}

/** The section of scenario file pointers, or nothing where the modules own no tracked scenario. */
export function scenarioFilePointers(projectRoot: string, known: Pick<KnownProjectFacts, 'scenarioFeatures' | 'stepDirectories'>): HarnessTaskBrief['sections'][number] | undefined {
  if (known.scenarioFeatures.length === 0) return undefined;
  return { key: 'support:scenario-files', text: ['## Scenario file pointers', '',
    ...known.scenarioFeatures.map(path => `- Feature: \`${join(projectRoot, path)}\`.`),
    ...known.stepDirectories.map(entry => `- Step directory: \`${join(projectRoot, entry.directory)}\`; observed files: ${entry.files.map(path => `\`${join(projectRoot, path)}\``).join(', ') || '(none)'}.`),
    'Observed files do not establish what the runner loads. Inspect its declared configuration.', ''].join('\n') };
}

/** The brief one invocation's task is delivered as. */
export function composeTaskBrief(projectRoot: string, facts: TaskBriefFacts): HarnessTaskBrief {
  const { kind, goal, requirements } = facts;
  const sections = [...taskSupportSections(facts.prompt, [goal, ...requirements, ...facts.omit]), ...facts.literalSections];
  const discoveries = startingPointsSection(facts.startingPointGroups, { projectRoot });
  if (discoveries !== undefined) sections.push(discoveries);
  // Role/task rules deliver known facts; the agent decides what to inspect.
  if (facts.known !== undefined) {
    const setup = declaredCheckInputs({ projectRoot, checks: facts.known.declaredChecks.checks, paths: facts.known.declaredChecks.paths, snapshot: false });
    if (setup && !facts.prompt.includes(setup)) sections.push({ key: 'support:declared-checks', text: setup });
    const pointers = moduleInputPointers({ projectRoot, modules: facts.known.modules, testAreas: facts.known.testAreas });
    if (pointers) sections.push({ key: 'support:module-pointers', text: pointers });
    const scenarios = scenarioFilePointers(projectRoot, facts.known);
    if (scenarios !== undefined) sections.push(scenarios);
  }
  return { kind, objective: `Perform ${kind} for ${JSON.stringify(facts.work)}; use the current evidence and designated submission.`, goal, requirements, sections,
    ...(facts.retainInheritedSections === true ? { retainInheritedSections: true } : {}),
    ...(facts.consultationSubmissionSchema === undefined ? {} : { consultationSubmissionSchema: facts.consultationSubmissionSchema }),
    environment: facts.environment };
}
