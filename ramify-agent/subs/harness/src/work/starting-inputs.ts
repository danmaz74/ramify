import { join, resolve } from 'node:path';
import type { TestArea } from '../run/project-config.js';
import { resolveSnapshotPath, type CandidateSnapshot } from '../../subs/reviews/src/snapshot.js';
import type { StartingPoint } from './starting-points.js';

/** Producer identity is supplied by the harness's existing records, never by a hint. */
export interface StartingPointGroup {
  readonly origin: {
    readonly producer: string;
    readonly workItem: string;
    readonly iteration?: string;
    readonly invocation?: string;
    readonly boundary?: string;
    readonly capabilityTask?: string;
  };
  readonly points: readonly StartingPoint[] | undefined;
}

/** One caller-owned section; exact pairs share all origins in stable declaration order. */
export function startingPointsSection(groups: readonly StartingPointGroup[], input: {
  readonly projectRoot: string;
  readonly snapshot?: CandidateSnapshot;
  readonly allows?: (path: string) => boolean;
}): { readonly key: 'support:starting-points'; readonly text: string } | undefined {
  const pairs = new Map<string, { point: StartingPoint; origins: StartingPointGroup['origin'][] }>();
  for (const group of groups) for (const point of group.points ?? []) {
    if (input.allows && !input.allows(point.path)) continue;
    if (input.snapshot && !resolveSnapshotPath(input.snapshot, point.path).ok) continue;
    const key = JSON.stringify([point.path, point.note]);
    const entry = pairs.get(key) ?? { point, origins: [] };
    if (!entry.origins.some(origin => JSON.stringify(origin) === JSON.stringify(group.origin))) entry.origins.push(group.origin);
    pairs.set(key, entry);
  }
  if (pairs.size === 0) return undefined;
  return { key: 'support:starting-points', text: [
    '## Recorded starting points', '',
    'Optional navigation help. Notes are producer judgments, not verified current facts, completion evidence or read/write authority. Inspect the current source and explore further when a hint is stale or unhelpful. Origin boundaries describe where pointers were recorded; they do not establish unchanged files.',
    input.snapshot ? `Paths are relative to the pinned candidate ${input.snapshot.commit} (tree ${input.snapshot.tree}); use snapshot tools.`
      : 'Paths below resolve from the project root; structured submissions keep project-relative paths.', '',
    ...[...pairs.values()].map(({ point, origins }) => `- ${JSON.stringify({ path: input.snapshot ? point.path : resolve(input.projectRoot, point.path), note: point.note, origins })}`),
  ].join('\n') };
}

/** Known command declarations rendered as facts, without acquiring effective configuration. */
export function declaredCheckInputs(input: {
  readonly projectRoot: string;
  readonly checks: readonly unknown[];
  readonly paths?: readonly string[];
  readonly snapshot?: boolean;
}): string {
  const path = (value: string) => input.snapshot ? value : resolve(input.projectRoot, value);
  const lines: string[] = [];
  for (const check of input.checks) {
    const declared = check as { id?: string; executor?: { kind?: string; commands?: readonly { cmd: string; args?: readonly string[]; cwd?: string; env?: Record<string, string>; parser?: string }[] } };
    if (declared.executor?.kind !== 'command') continue;
    for (const command of declared.executor.commands ?? []) {
      lines.push(`- ${declared.id ?? 'Declared check'}${command.parser ? ` (${command.parser})` : ''}: argv ${JSON.stringify([command.cmd, ...command.args ?? []])}; cwd \`${path(command.cwd ?? '.')}\`${command.env ? `; environment names: ${Object.keys(command.env).sort().join(', ')}` : ''}.`);
    }
  }
  for (const value of input.paths ?? []) lines.push(`- Configuration/support pointer: \`${path(value)}\`.`);
  if (lines.length === 0) return '';
  return ['## Declared project checks', '', ...lines, '', input.snapshot
    ? 'Read these project-relative references with snapshot_read/snapshot_list in the audited candidate. Commands describe the declared setup; this reader does not execute them.'
    : 'These are declared checks, not a focused command. Inspect their configuration for how to run particular tests. The gate runs the audit; shell refuses whole suites and watch mode.', ''].join('\n');
}

/** Module paths already known to the caller; API references describe observed directories only. */
export function moduleInputPointers(input: {
  readonly projectRoot: string;
  readonly modules: readonly { readonly module: string; readonly directory: string; readonly apiPaths: readonly string[] }[];
  readonly testAreas: readonly TestArea[];
}): string {
  const lines: string[] = [];
  for (const module of input.modules) {
    lines.push(`- \`${module.module}\`: README \`${join(input.projectRoot, module.directory, 'README.md')}\`; declaration \`${join(input.projectRoot, module.directory, 'module.ramify')}\`; source \`${join(input.projectRoot, module.directory, 'src')}/\`.`);
    for (const area of input.testAreas.filter(area => area.module === module.module)) lines.push(`  - Test area: \`${join(input.projectRoot, area.area)}/\`.`);
    for (const path of module.apiPaths) lines.push(`  - Observed API view: \`${join(input.projectRoot, path)}/\`. Read its metadata for revision and coverage limits; absence under coverage limits is not proof.`);
  }
  return lines.length === 0 ? '' : ['## Module and test pointers', '', ...lines, ''].join('\n');
}
