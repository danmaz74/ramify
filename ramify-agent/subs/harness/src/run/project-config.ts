import { readdir, readFile, stat } from 'node:fs/promises';
import { delimiter, isAbsolute, join, matchesGlob, relative, sep } from 'node:path';
import { readProjectConfiguration } from '../../subs/evidence/src/project-configuration.js';
import { isTestingModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import {
  capturedProjectConfigSchema, projectConfigSchema,
  type AcceptanceMode, type CapturedProjectConfig, type ProjectConfig,
} from './records.js';

/*
 * The project's configuration, `ramify-agent.json`: read at `start-run`,
 * validated against `ramify-agent.project/1` and captured into `job.json`
 * beside the run policy. A missing or invalid file is captured with its
 * reason and never refuses a start; readiness reports it.
 *
 * What readiness asks of a valid file is here too: that its support code
 * lies in a module's test area, and that each mode's commands resolve.
 */

/** Reads, validates and captures the project's configuration. */
export async function captureProjectConfig(projectRoot: string): Promise<CapturedProjectConfig> {
  const read = await readProjectConfiguration(projectRoot);
  if (read.status === 'missing') {
    return capturedProjectConfigSchema.parse({ path: read.path, hash: null, invalid: `${read.path} is missing at the project root` });
  }
  if (read.status === 'unreadable') {
    return capturedProjectConfigSchema.parse({ path: read.path, hash: null, invalid: `${read.path} cannot be read: ${read.message}` });
  }
  const parsed = parseProjectConfig(read.text);
  return capturedProjectConfigSchema.parse('config' in parsed
    ? { path: read.path, hash: read.hash, config: parsed.config }
    : { path: read.path, hash: read.hash, invalid: `${read.path} ${parsed.invalid}` });
}

/** The file's text against the schema: the configuration with its defaults, or the schema's message. */
export function parseProjectConfig(text: string): { readonly config: ProjectConfig } | { readonly invalid: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { invalid: `is not JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  const result = projectConfigSchema.safeParse(json);
  if (result.success) return { config: result.data };
  const issues = result.error.issues.map(issue => `${issue.path.map(String).join('.') || '<root>'}: ${issue.message}`);
  return { invalid: `does not validate against ramify-agent.project/1: ${issues.join('; ')}` };
}

// The test areas support code must lie in.

/** A module's test area: its `src/tests/`, or a testing module's `src/`, project-relative. */
export interface TestArea {
  readonly module: string;
  readonly area: string;
}

/**
 * Every module's test area. The architect view names the modules and their
 * tags where the run has one; without it the declarations on disk do, found
 * where Ramify's layout allows them: the root and beneath each `subs/`.
 */
export async function moduleTestAreas(projectRoot: string, index: ArchitectIndex | null): Promise<TestArea[]> {
  const areas: TestArea[] = [];
  if (index !== null) {
    for (const entry of index.modules.values()) {
      areas.push({ module: entry.module, area: areaOf(entry.dir, isTestingModule(entry)) });
    }
  } else {
    await walk('', 0);
  }
  return areas.sort((a, b) => (a.area < b.area ? -1 : a.area > b.area ? 1 : 0));

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > moduleDepth) return;
    const header = await moduleHeader(join(projectRoot, directory, 'module.ramify'));
    if (header !== null) areas.push({ module: header.name, area: areaOf(directory, header.tags.includes('testing')) });
    let children;
    try {
      children = await readdir(join(projectRoot, directory, 'subs'), { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      if (child.isDirectory()) await walk(directory === '' ? `subs/${child.name}` : `${directory}/subs/${child.name}`, depth + 1);
    }
  }
}

/** How deep the walk looks for a nested module declaration. */
const moduleDepth = 12;

function areaOf(directory: string, testing: boolean): string {
  const source = directory === '' ? 'src' : `${directory}/src`;
  return testing ? source : `${source}/tests`;
}

/** A declaration's name and tags, read from its header line. */
async function moduleHeader(path: string): Promise<{ name: string; tags: string[] } | null> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    return null;
  }
  const match = /^module\s+("[^"]*"|\S+)(?:\s+tagged\s+\[([^\]]*)\])?/mu.exec(text);
  if (match === null) return null;
  return {
    name: match[1]!.replace(/^"|"$/gu, ''),
    tags: (match[2] ?? '').split(',').map(tag => tag.trim()).filter(Boolean),
  };
}

/** What one `support` entry matched: the files inside a test area and those outside every one. */
export interface SupportMatch {
  readonly entry: string;
  readonly inside: readonly string[];
  readonly outside: readonly string[];
}

/**
 * Each `support` entry against the project's files. An entry is a path or a
 * glob relative to the project root; a file matches when the entry names it
 * or its glob matches it.
 */
export async function matchSupport(projectRoot: string, support: readonly string[], areas: readonly TestArea[]): Promise<SupportMatch[]> {
  const files = await projectFiles(projectRoot);
  const within = (file: string) => areas.some(area => file.startsWith(`${area.area}/`));
  return support.map(entry => {
    const pattern = entry.replace(/^\.\//u, '');
    const matched = isAbsolute(pattern) ? [] : files.filter(file => file === pattern || matchesGlob(file, pattern));
    return { entry, inside: matched.filter(within), outside: matched.filter(file => !within(file)) };
  });
}

/** Every file beneath the root, project-relative, skipping `node_modules` and dot-directories. */
async function projectFiles(projectRoot: string): Promise<string[]> {
  const found: string[] = [];
  await walk(projectRoot, 0);
  return found.sort();

  async function walk(directory: string, depth: number): Promise<void> {
    if (depth > moduleDepth * 2) return;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await walk(path, depth + 1);
      else if (entry.isFile()) found.push(relative(projectRoot, path).split(sep).join('/'));
    }
  }
}

// The acceptance modes' commands.

/** One command of a mode that does not resolve, with the reason. */
export interface UnresolvedCommand {
  readonly mode: 'quick' | 'full';
  readonly role: 'command' | 'setup' | 'teardown';
  readonly argv: readonly string[];
  readonly reason: string;
}

/**
 * Every command of both modes that does not resolve. `npm run <script>`
 * resolves when `package.json` declares the script; any other argv resolves
 * when its executable is a file, by path from the project root or by name in
 * `node_modules/.bin` or on the `PATH`.
 */
export async function unresolvedCommands(projectRoot: string, config: ProjectConfig): Promise<UnresolvedCommand[]> {
  const scripts = await packageScripts(projectRoot);
  const unresolved: UnresolvedCommand[] = [];
  const modes: Array<['quick' | 'full', AcceptanceMode]> = [['quick', config.acceptance.modes.quick], ['full', config.acceptance.modes.full]];
  for (const [mode, declared] of modes) {
    for (const role of ['command', 'setup', 'teardown'] as const) {
      const argv = declared[role];
      if (argv === undefined) continue;
      const reason = await unresolvedReason(projectRoot, argv, scripts);
      if (reason !== null) unresolved.push({ mode, role, argv, reason });
    }
  }
  return unresolved;
}

async function unresolvedReason(projectRoot: string, argv: readonly string[], scripts: Record<string, unknown> | null): Promise<string | null> {
  const [executable, subcommand, script] = argv;
  if (executable === 'npm' && (subcommand === 'run' || subcommand === 'run-script')) {
    if (script === undefined) return '`npm run` names no script';
    if (scripts === null) return 'package.json cannot be read';
    const body = scripts[script];
    return typeof body === 'string' && body !== '' ? null : `package.json declares no \`${script}\` script`;
  }
  if (executable === undefined) return 'the argv is empty';
  if (executable.includes('/')) {
    return await isFile(isAbsolute(executable) ? executable : join(projectRoot, executable)) ? null : `${executable} is not a file`;
  }
  const directories = [join(projectRoot, 'node_modules', '.bin'), ...(process.env['PATH'] ?? '').split(delimiter).filter(Boolean)];
  for (const directory of directories) {
    if (await isFile(join(directory, executable))) return null;
  }
  return `\`${executable}\` is neither in node_modules/.bin nor on the PATH`;
}

async function packageScripts(projectRoot: string): Promise<Record<string, unknown> | null> {
  try {
    const parsed = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')) as { scripts?: Record<string, unknown> };
    return parsed.scripts ?? {};
  } catch {
    return null;
  }
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}
