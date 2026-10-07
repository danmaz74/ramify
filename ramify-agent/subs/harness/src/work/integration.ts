import { readdir } from 'node:fs/promises';
import { join, posix } from 'node:path';
import type { ScenarioRecord } from '../../subs/scenarios/src/records.js';
import type { ScenarioStates } from '../../subs/scenarios/src/states.js';
import { workItemId, workItemSchema, type WorkItem } from './records.js';

/*
 * Integration work items, architecture §10.
 *
 * An integration scenario's work item is due when every sub-scenario is
 * `done`. The responsible architect's accepted `done` report that makes that
 * true commits one work item for it, exactly once, at the scenario's owner,
 * the lowest common ancestor of its sub-scenarios' owners, with the goal of
 * binding that one scenario. The done reports are the only trigger: no gate
 * result, local or fake-backed success or separate readiness decision is.
 * Its engineer's scope is the ancestor with the children on the paths to the
 * sub-scenarios' owners included: it writes a step file at the ancestor that
 * imports the sub-scenarios' step files by name, adds the `expose-test`
 * declarations along each path, and binds the scenario.
 */

/** The integration scenarios due a work item: every sub-scenario done, and no work item for it yet. */
export function dueIntegrations(
  records: readonly ScenarioRecord[],
  states: ScenarioStates,
  items: readonly WorkItem[],
): ScenarioRecord[] {
  const bound = new Set(items.flatMap(item => ('integration' in item.origin ? [item.origin.integration] : [])));
  return records.filter(record => record.kind === 'integration'
    && !bound.has(record.id)
    && record.subScenarios.length > 0
    && record.subScenarios.every(id => states.get(id) === 'done'));
}

/** The work item one due integration scenario gets, numbered after the `count` already committed. */
export function integrationWorkItem(record: ScenarioRecord, count: number): WorkItem {
  return workItemSchema.parse({
    schema: 'ramify-agent.work-item/1',
    id: workItemId(count + 1),
    module: record.owner,
    origin: { integration: record.id },
    goal: `Bind the integration scenario ${record.id}, "${record.name}": a step file here imports, by name, the step definitions its sub-scenarios' owners wrote, exposed with expose-test along each path, and the scenario passes.`,
    requirementRefs: [],
    acceptanceRefs: [],
    contextRefs: [],
    startedFor: null,
  } satisfies WorkItem);
}

/**
 * The direct children of the ancestor on the paths to the given owners, in
 * order and once each. An owner that is the ancestor itself has no child on
 * its path.
 */
export function childrenOnPaths(ancestor: string, owners: readonly string[]): string[] {
  const depth = ancestor.split('/').length;
  const children: string[] = [];
  for (const owner of owners) {
    if (owner === ancestor || !owner.startsWith(`${ancestor}/`)) continue;
    const child = owner.split('/').slice(0, depth + 1).join('/');
    if (!children.includes(child)) children.push(child);
  }
  return children;
}

/** The scope an integration work item's engineer works in: the ancestor, with the children on the paths to the sub-scenarios' owners. */
export interface IntegrationScope {
  readonly module: string;
  readonly includedChildren: readonly string[];
}

/** The scope of one integration scenario's engineer. */
export function integrationScopeOf(record: ScenarioRecord, records: readonly ScenarioRecord[]): IntegrationScope {
  const owners = record.subScenarios.flatMap(id => records.filter(candidate => candidate.id === id).map(candidate => candidate.owner));
  return { module: record.owner, includedChildren: childrenOnPaths(record.owner, owners) };
}

/**
 * The step directory of the module whose feature file this is: `src/tests/steps/`
 * beside `src/tests/features/`, or a testing module's `src/steps/` beside
 * its `src/features/`.
 */
export function stepDirectoryOf(featureFile: string): string {
  const tests = featureFile.indexOf('src/tests/features/');
  if (tests >= 0) return posix.join(featureFile.slice(0, tests), 'src/tests/steps');
  const testing = featureFile.indexOf('src/features/');
  if (testing >= 0) return posix.join(featureFile.slice(0, testing), 'src/steps');
  throw new Error(`The feature file ${featureFile} is not beneath a module's src/tests/features/ or src/features/`);
}

/** Every step file beneath one project-relative directory, project-relative and sorted; none where it does not exist. */
export async function stepFilesIn(projectRoot: string, directory: string): Promise<string[]> {
  const found: string[] = [];
  const walk = async (relative: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(join(projectRoot, relative), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = posix.join(relative, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') await walk(path);
      else if (entry.isFile() && /\.(?:ts|js|mts|mjs)$/u.test(entry.name)) found.push(path);
    }
  };
  await walk(directory);
  return found.sort();
}

/** What the local architect of an integration work item is told of its scenario. */
export interface IntegrationBriefing {
  readonly scenario: {
    readonly id: string;
    readonly name: string;
    readonly owner: string;
    readonly file: string;
    readonly source: readonly string[];
    /** Where the ancestor's own step file goes. */
    readonly steps: string;
  };
  readonly subScenarios: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly owner: string;
    readonly file: string;
    readonly source: readonly string[];
  }>;
  /** Each sub-scenario owner's step directory and the step files it holds now. */
  readonly owners: ReadonlyArray<{ readonly module: string; readonly directory: string; readonly files: readonly string[] }>;
  readonly scope: IntegrationScope;
}

/** The briefing of one integration scenario, with its owners' step files as the tree holds them. */
export async function integrationBriefing(
  projectRoot: string,
  record: ScenarioRecord,
  records: readonly ScenarioRecord[],
): Promise<IntegrationBriefing> {
  const subs = record.subScenarios.flatMap(id => records.filter(candidate => candidate.id === id));
  const owners: Array<{ module: string; directory: string; files: string[] }> = [];
  for (const sub of subs) {
    if (owners.some(owner => owner.module === sub.owner)) continue;
    const directory = stepDirectoryOf(sub.file);
    owners.push({ module: sub.owner, directory, files: await stepFilesIn(projectRoot, directory) });
  }
  return {
    scenario: { id: record.id, name: record.name, owner: record.owner, file: record.file, source: record.source, steps: stepDirectoryOf(record.file) },
    subScenarios: subs.map(sub => ({ id: sub.id, name: sub.name, owner: sub.owner, file: sub.file, source: sub.source })),
    owners,
    scope: integrationScopeOf(record, records),
  };
}
