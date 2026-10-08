import { createHash } from 'node:crypto';
import { isAbsolute, relative, resolve } from 'node:path';
import type { CucumberConfigurationResult } from '../../subs/evidence/src/cucumber-configuration.js';
import type { FocusedCucumberSelection } from '../tools/shell-tests.js';

export type FocusedScenarioCommand = { readonly kind: 'available'; readonly cwd: string; readonly environment: Readonly<Record<string, string>>;
  readonly argv: readonly string[]; readonly shellCommand: string; readonly configPath: string; readonly configText: string;
  readonly configurationIdentity: string; readonly sourceIdentity: string; readonly selection: FocusedCucumberSelection;
  readonly support: Readonly<Record<string, unknown>>;
} | { readonly kind: 'unavailable'; readonly reason: string };

/** Pure preparation: consumer owns permitted scratch creation, exact write and cleanup. */
export function buildFocusedScenarioCommand(input: { readonly effective: CucumberConfigurationResult; readonly featurePaths: readonly string[];
  readonly scratchDirectory: string; readonly cucumberExecutable: string }): FocusedScenarioCommand {
  if (input.effective.kind === 'unavailable') return { kind: 'unavailable', reason: input.effective.reason };
  const { selection, configuration } = input.effective;
  if (!isAbsolute(input.scratchDirectory) || !isAbsolute(input.cucumberExecutable)) return { kind: 'unavailable', reason: 'Explicit absolute permitted scratch and target Cucumber executable are required' };
  if (input.featurePaths.length === 0 || input.featurePaths.some(path => !path || !path.endsWith('.feature') || /[*?\[\]{}\n\r]/.test(path))) return { kind: 'unavailable', reason: 'Exact assigned feature files are required; globs/dynamic selection are unavailable' };
  const paths = [...new Set(input.featurePaths.map(path => resolve(selection.cwd, path)))];
  if (paths.some(path => relative(selection.cwd, path).startsWith('..'))) return { kind: 'unavailable', reason: 'Assigned feature is outside the declared project cwd' };
  // Flatten the already selected source profiles. Loading this dedicated profile merges no source defaults.
  const focused = { ...configuration, paths, tags: '', name: [], shard: '', dryRun: false };
  const profile = 'ramify-focused';
  const configText = `${JSON.stringify({ [profile]: focused }, null, 2)}\n`;
  const configurationIdentity = createHash('sha256').update(configText).digest('hex');
  const configPath = resolve(input.scratchDirectory, `cucumber-focused-${configurationIdentity.slice(0, 16)}.json`);
  // Installed Cucumber joins its cwd to --config, including absolute arguments.
  const argv = [input.cucumberExecutable, '--config', relative(selection.cwd, configPath), '--profile', profile];
  const support = Object.fromEntries(['import', 'require', 'requireModule', 'loader', 'worldParameters'].map(key => [key, configuration[key]]));
  return { kind: 'available', cwd: selection.cwd, environment: selection.environment, argv,
    shellCommand: `cd ${quote(selection.cwd)} && ${argv.map(quote).join(' ')}`, configPath, configText, configurationIdentity,
    sourceIdentity: input.effective.identity, support,
    selection: { cwd: selection.cwd, config: configPath, profile, paths, configurationIdentity } };
}
function quote(value: string): string { return `'${value.replace(/'/g, `'"'"'`)}'`; }
