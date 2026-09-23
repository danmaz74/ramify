import type { ScenarioRecord } from './records.js';
import { carriesPendingTag, type ScenarioStates } from './states.js';

/*
 * The tracked feature files, architecture §5: one pure function of the
 * records and the states, so the same input yields the same bytes and any
 * drift in the tree is a guarded change. One file per entry in its owner's
 * test area, and one per common ancestor for integration scenarios. Scenario
 * lines are the record's, verbatim; the identity tag names the scenario, and
 * the pending tag is present exactly while it is `pending` or `bound`.
 */

/** What rendering reads of the run beyond the records and states. */
export interface FeatureRenderingRun {
  readonly planId: string;
  readonly runId: string;
  /** Each entry's capability slug and recorded description, which name and describe its feature. */
  readonly entries: readonly { readonly capability: string; readonly description: string }[];
}

export interface RenderedFeatureFile {
  /** Project-relative, as the records name it. */
  readonly path: string;
  readonly content: string;
}

export const pendingTag: string = '@ramify-pending';

/** `@ramify-sc-001` for `sc-001`. */
export function identityTagOf(id: string): string {
  return `@ramify-${id}`;
}

/** The identity tag's scenario ID, or `null` for any other tag. */
export function scenarioIdOfTag(tag: string): string | null {
  const match = /^@ramify-(sc-\d{3,})$/.exec(tag);
  return match ? match[1]! : null;
}

const width = 78;

/**
 * Every tracked file with its content, ordered by path. A record without a
 * state, an entry without a description, or a file that would mix entries
 * or kinds is a caller's error and throws.
 */
export function renderFeatureFiles(records: readonly ScenarioRecord[], states: ScenarioStates, run: FeatureRenderingRun): RenderedFeatureFile[] {
  const files = new Map<string, ScenarioRecord[]>();
  for (const record of records) files.set(record.file, [...(files.get(record.file) ?? []), record]);
  const descriptions = new Map(run.entries.map((entry) => [entry.capability, entry.description]));

  return [...files.keys()].sort().map((path) => {
    const scenarios = [...files.get(path)!].sort((a, b) => a.id.localeCompare(b.id, 'en', { numeric: true }));
    const kinds = new Set(scenarios.map((record) => `${record.kind}:${record.entry ?? ''}`));
    if (kinds.size > 1) throw new Error(`The feature file ${path} would carry scenarios of ${[...kinds].join(' and ')}; a file carries one entry's scenarios or integration scenarios only`);
    const first = scenarios[0]!;
    const heading = first.kind === 'integration'
      ? { name: 'integration', description: `Plan ${run.planId}: the scenarios that combine several entries, each bound here where its sub-scenarios' owners meet.` }
      : { name: first.entry!, description: descriptions.get(first.entry!) };
    if (heading.description === undefined) throw new Error(`No description of the entry "${first.entry}" was given for ${path}`);

    const lines = [
      ...headerComment(run, stepsDirectoryOf(path)),
      '',
      `Feature: ${heading.name}`,
      ...describe(heading.description),
    ];
    for (const record of scenarios) {
      const state = states.get(record.id);
      if (state === undefined) throw new Error(`No state was given for ${record.id}`);
      lines.push('', `  ${[identityTagOf(record.id), ...(carriesPendingTag(state) ? [pendingTag] : [])].join(' ')}`);
      lines.push(...record.source.map((line) => (line === '' ? '' : `  ${line}`)));
    }
    return { path, content: `${lines.join('\n')}\n` };
  });
}

function headerComment(run: FeatureRenderingRun, steps: string): string[] {
  return [
    `# Written by ramify-agent for plan ${run.planId}, run ${run.runId}.`,
    '# The scenarios are the plan\'s requirements. Agents never edit this file;',
    `# step definitions bind it from ${steps}. @ramify-pending marks a`,
    '# scenario the harness has not yet declared due.',
  ];
}

/** A testing module's steps sit in its `src/steps/`; every other module's in `src/tests/steps/`. */
function stepsDirectoryOf(path: string): string {
  return path.includes('/src/tests/features/') || path.startsWith('src/tests/features/') ? 'src/tests/steps/' : 'src/steps/';
}

/**
 * The feature's description, collapsed to one paragraph and wrapped at 78
 * columns under a two-space indent. A line never starts with a word the
 * parser would read as a tag, a comment or a keyword, so the description
 * always parses as one.
 */
function describe(description: string): string[] {
  const words = description.trim().split(/\s+/).filter((word) => word !== '');
  if (words.length === 0) return [];
  if (startsHazardously(words[0]!)) words.unshift('Description:');
  const lines: string[][] = [];
  for (const word of words) {
    const current = lines.at(-1);
    const fits = current !== undefined && `  ${[...current, word].join(' ')}`.length <= width;
    if (current !== undefined && (fits || startsHazardously(word))) current.push(word);
    else lines.push([word]);
  }
  return lines.map((line) => `  ${line.join(' ')}`);
}

function startsHazardously(word: string): boolean {
  return /^[#@|]/.test(word) || word.startsWith('"""') || word.startsWith('```')
    || /^(Feature|Rule|Background|Scenario|Example|Examples|Scenarios|Ability|Business)\b/.test(word);
}
