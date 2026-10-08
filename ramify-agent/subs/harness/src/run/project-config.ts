import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { readProjectConfiguration } from '../../subs/evidence/src/project-configuration.js';
import { isTestingModule, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { parseModuleHeader } from './module-header.js';
import {
  capturedProjectConfigSchema, projectConfigSchema,
  type CapturedProjectConfig, type ProjectConfig,
} from './records.js';

/*
 * The project's configuration, `ramify-agent.json`: read at `start-run`,
 * validated against `ramify-agent.project/1` and captured into `job.json`
 * beside the run policy. A missing or invalid file is captured with its
 * reason and never refuses a start; readiness reports it.
 *
 * The modules' test areas are here too, which a briefing names as text.
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

// The modules' test areas.

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
  const modules = await declaredModules(projectRoot, index);
  return modules
    .map(module => ({ module: index === null ? module.name : module.module, area: areaOf(module.dir, module.testing) }))
    .sort((a, b) => (a.area < b.area ? -1 : a.area > b.area ? 1 : 0));
}

/** One declared module: its declared-name path, its header's own name, its directory and whether it is testing. */
interface DeclaredModule {
  readonly module: string;
  readonly name: string;
  readonly dir: string;
  readonly testing: boolean;
}

/** Current module directories from declarations on disk, including modules added since a view was made. */
export async function declaredModuleDirectories(projectRoot: string): Promise<string[]> {
  return [...new Set((await declaredModules(projectRoot, null)).map(module => module.dir))].sort();
}

async function declaredModules(projectRoot: string, index: ArchitectIndex | null): Promise<DeclaredModule[]> {
  const modules: DeclaredModule[] = [];
  if (index !== null) {
    for (const entry of index.modules.values()) {
      modules.push({ module: entry.module, name: entry.module.split('/').at(-1) ?? entry.module, dir: entry.dir, testing: isTestingModule(entry) });
    }
    return modules;
  }
  await walk('', null, 0);
  return modules;

  async function walk(directory: string, parent: string | null, depth: number): Promise<void> {
    if (depth > moduleDepth) return;
    const header = await moduleHeader(join(projectRoot, directory, 'module.ramify'));
    const path = header === null ? parent : parent === null ? header.name : `${parent}/${header.name}`;
    if (header !== null) modules.push({ module: path!, name: header.name, dir: directory, testing: header.tags.includes('testing') });
    let children;
    try {
      children = await readdir(join(projectRoot, directory, 'subs'), { withFileTypes: true });
    } catch {
      return;
    }
    for (const child of children) {
      if (child.isDirectory()) await walk(directory === '' ? `subs/${child.name}` : `${directory}/subs/${child.name}`, path, depth + 1);
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
  return parseModuleHeader(text);
}
