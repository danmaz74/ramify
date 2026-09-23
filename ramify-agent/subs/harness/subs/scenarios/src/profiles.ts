import { posix } from 'node:path';
import { z } from 'zod';
import type { ScenarioModule } from './records.js';
import { identityTagOf, pendingTag } from './rendering.js';

/*
 * The Cucumber profile of one module's run in the scenario check. A run
 * imports the configured support files and this module's step files, and
 * runs this module's feature files, so a scenario binds only to definitions
 * its owner wrote or imported. The profile is passed with `--config`, so the
 * project's own profile never reaches a gate. Writing it, and rebasing its
 * paths into an audit worktree, is the caller's.
 */

export const scenarioModeSchema = z.enum(['quick', 'full']);
export type ScenarioMode = z.infer<typeof scenarioModeSchema>;

/** Which scenarios of a module's feature files one run selects. */
export const scenarioSelectionSchema = z.discriminatedUnion('kind', [
  /** The named tracked scenarios, by identity tag, pending ones included. */
  z.object({ kind: z.literal('identity'), scenarios: z.array(z.string().regex(/^sc-\d{3,}$/)).min(1) }).strict(),
  /** Every scenario without the pending tag. */
  z.object({ kind: z.literal('all-untagged') }).strict(),
  /** Every scenario. */
  z.object({ kind: z.literal('all') }).strict(),
]);
export type ScenarioSelection = z.infer<typeof scenarioSelectionSchema>;

/** What a profile reads of the project's `acceptance` configuration. */
export interface ScenarioRunConfig {
  /** Imported before any step file, in order. Project-relative, globs allowed. */
  readonly support: readonly string[];
  readonly modes: Readonly<Record<ScenarioMode, { readonly command: readonly string[] }>>;
}

export interface ScenarioProfile {
  /** `<attemptDir>/scenarios/<module>.profile.mjs`. */
  readonly profilePath: string;
  /** The profile module's text. */
  readonly profileText: string;
  /** `<attemptDir>/scenarios/<module>.ndjson`, where the run writes its message stream. */
  readonly messagesPath: string;
  /** The mode's command, `--config` with the profile relative to the project root, and `--dry-run` when asked. */
  readonly argv: readonly string[];
  /** The tag expression, or `null` for the `all` selection. */
  readonly tags: string | null;
}

/** The tag expression of a selection. */
export function scenarioTagExpression(selection: ScenarioSelection): string | null {
  switch (selection.kind) {
    case 'identity': return selection.scenarios.map(identityTagOf).join(' or ');
    case 'all-untagged': return `not ${pendingTag}`;
    case 'all': return null;
  }
}

/** The file name a module's profile and stream share: its directory with `/` as `-`, `root` for the root module. */
export function scenarioRunName(module: ScenarioModule): string {
  return module.dir === '' ? 'root' : module.dir.replaceAll('/', '-');
}

/** Options of one profile. */
export interface ScenarioProfileOptions {
  /** Adds `--dry-run`: the runner loads every step file and runs no step and no hook. */
  readonly dryRun?: boolean;
  /**
   * The absolute project root the runner starts in, required when
   * `attemptDir` is absolute. `cucumber-js` 13 joins its working directory
   * with the `--config` path even when that path is absolute, so the argv
   * names the profile relative to this root.
   */
  readonly projectRoot?: string;
}

/**
 * One module's profile and the argv that runs it. `attemptDir` is where the
 * attempt keeps its files, outside the worktree; step and feature paths are
 * project-relative, since the runner starts at the project root. A testing
 * module's steps and features are its `src/steps/` and `src/features/`.
 */
export function buildScenarioProfile(
  module: ScenarioModule,
  mode: ScenarioMode,
  selection: ScenarioSelection,
  config: ScenarioRunConfig,
  attemptDir: string,
  options: ScenarioProfileOptions = {},
): ScenarioProfile {
  if (posix.isAbsolute(attemptDir) && options.projectRoot === undefined) {
    throw new Error('An absolute attempt directory needs the project root, since the runner reads --config relative to it');
  }
  const base = module.dir === '' ? '' : `${module.dir}/`;
  const area = module.testing ? `${base}src` : `${base}src/tests`;
  const name = scenarioRunName(module);
  const directory = `${attemptDir.replace(/\/+$/, '')}/scenarios`;
  const profilePath = `${directory}/${name}.profile.mjs`;
  const messagesPath = `${directory}/${name}.ndjson`;
  const tags = scenarioTagExpression(selection);

  const profile = [
    `// Written by ramify-agent: the ${mode} scenario run of module ${module.module}.`,
    'export default {',
    '  import: [',
    ...[...config.support, `${area}/steps/**/*.{ts,js}`].map((path) => `    ${JSON.stringify(path)},`),
    '  ],',
    `  paths: [${JSON.stringify(`${area}/features`)}],`,
    ...(tags === null ? [] : [`  tags: ${JSON.stringify(tags)},`]),
    '  strict: true,',
    `  format: [${JSON.stringify(`message:${messagesPath}`)}],`,
    '};',
  ];
  return {
    profilePath,
    profileText: `${profile.join('\n')}\n`,
    messagesPath,
    argv: [
      ...config.modes[mode].command,
      '--config',
      options.projectRoot === undefined ? profilePath : posix.relative(options.projectRoot, posix.resolve(options.projectRoot, profilePath)),
      ...(options.dryRun ? ['--dry-run'] : []),
    ],
    tags,
  };
}
