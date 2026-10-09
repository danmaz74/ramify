import { join, resolve } from 'node:path';
import type { TestArea } from '../run/project-config.js';

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
