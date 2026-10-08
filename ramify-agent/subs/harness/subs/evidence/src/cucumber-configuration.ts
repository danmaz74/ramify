import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';
import { runCommand, type CommandRunner, type CommandRun } from './run-command.js';

export interface CucumberConfigurationSelection {
  readonly cwd: string;
  readonly file: string | false;
  readonly profiles: readonly string[];
  readonly provided: Readonly<Record<string, unknown>>;
  readonly environment: Readonly<Record<string, string>>;
  readonly configurationIdentity: string;
  readonly nodeExecutable: string;
}
export interface EffectiveCucumberConfiguration {
  readonly kind: 'available';
  readonly selection: CucumberConfigurationSelection;
  readonly identity: string;
  readonly apiPath: string;
  readonly configuration: Readonly<Record<string, unknown>>;
  readonly command: CommandRun;
}
export type CucumberConfigurationResult = EffectiveCucumberConfiguration | { readonly kind: 'unavailable'; readonly reason: string; readonly command: CommandRun | null };

// Run with the TARGET's resolver and environment. Loading authored config is external execution.
const loader = `import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
let text = ''; for await (const chunk of process.stdin) text += chunk;
const input = JSON.parse(text);
const require = createRequire(join(input.cwd, 'package.json'));
const apiPath = require.resolve('@cucumber/cucumber/api');
const api = await import(pathToFileURL(apiPath).href);
const result = await api.loadConfiguration({ file: input.file, profiles: input.profiles, provided: input.provided }, { cwd: input.cwd, env: process.env });
const payload = JSON.stringify({ schema: 'ramify-agent.cucumber-configuration/1', apiPath, configuration: result.useConfiguration }, (key, value) => {
  if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined' || typeof value === 'bigint' || typeof value === 'number' && !Number.isFinite(value)) throw new Error('Effective configuration is not serializable: ' + key);
  return value;
});
process.stdout.write('\\nRAMIFY_CUCUMBER_CONFIGURATION=' + payload + '\\n');`;

/** Exact declared source selection only. Discovery/guessed dynamic choices are caller limitations. */
export async function loadCucumberConfiguration(selection: CucumberConfigurationSelection, runner: CommandRunner = runCommand): Promise<CucumberConfigurationResult> {
  if (!isAbsolute(selection.cwd) || !selection.configurationIdentity || !selection.nodeExecutable || selection.file !== false && !selection.file) return { kind: 'unavailable', reason: 'Explicit cwd, declared configuration identity/file and target Node executable are required', command: null };
  let serialized: string;
  try { serialized = JSON.stringify(selection, (key, value: unknown) => {
    if (typeof value === 'function' || typeof value === 'symbol' || typeof value === 'undefined' || typeof value === 'bigint' || typeof value === 'number' && !Number.isFinite(value)) throw new Error(`Dynamic configuration selection ${key}`);
    return value;
  }); } catch { return { kind: 'unavailable', reason: 'Configuration selection is dynamic or not serializable', command: null }; }
  const command = await runner({ argv: [selection.nodeExecutable, '--input-type=module', '--eval', loader], cwd: selection.cwd,
    env: selection.environment, stdin: serialized, timeoutMs: 30_000 });
  if (command.outcome.kind !== 'completed' || command.outcome.exitCode !== 0 || command.output.truncated) return { kind: 'unavailable', reason: `Declared Cucumber configuration could not be loaded (${command.outcome.kind})`, command };
  try {
    const line = command.stdout.split('\n').filter(line => line.startsWith('RAMIFY_CUCUMBER_CONFIGURATION=')).at(-1);
    if (!line) throw new Error('Missing configuration response');
    const response = JSON.parse(line.slice('RAMIFY_CUCUMBER_CONFIGURATION='.length)) as { schema?: unknown; apiPath?: unknown; configuration?: unknown };
    if (response.schema !== 'ramify-agent.cucumber-configuration/1' || typeof response.apiPath !== 'string' || !isAbsolute(response.apiPath) || !response.configuration || typeof response.configuration !== 'object' || Array.isArray(response.configuration)) throw new Error('Malformed configuration response');
    const configuration = response.configuration as Readonly<Record<string, unknown>>;
    for (const key of ['paths', 'import', 'require', 'loader', 'requireModule', 'name']) if (!Array.isArray(configuration[key]) || !(configuration[key] as unknown[]).every(item => typeof item === 'string')) throw new Error(`Missing effective ${key}`);
    if (typeof configuration['tags'] !== 'string' || typeof configuration['dryRun'] !== 'boolean' || !configuration['worldParameters'] || typeof configuration['worldParameters'] !== 'object') throw new Error('Missing effective filters/world parameters');
    return { kind: 'available', selection: JSON.parse(serialized) as CucumberConfigurationSelection, apiPath: response.apiPath, configuration,
      identity: createHash('sha256').update(JSON.stringify({ selection, apiPath: response.apiPath, configuration })).digest('hex'), command };
  } catch (error) { return { kind: 'unavailable', reason: `Invalid Cucumber configuration evidence: ${String(error)}`, command }; }
}
