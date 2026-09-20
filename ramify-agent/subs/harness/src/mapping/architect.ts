import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateMapSubmission, type InputManifest } from '../interfaces/map.js';
import type { ApiViewEvidence } from '../interfaces/protocol/jobs.js';
import type { ToolDefinition, ToolResult } from '../../subs/agent/src/interfaces/port.js';
import { Mutex } from '../jobs/mutex.js';
import { planPath } from '../plans/discover.js';
import {
  EvidenceUnavailableError,
  InputsChangedError,
  mapSubmissionJsonSchema,
  planChanges,
  sha256,
  sourceState,
  submissionToolName,
  type MappingContext,
  type MappingJob,
  type MappingJobHooks,
  type MappingProcedure,
} from './procedure.js';
import { ramifyVersion, type RamifyCli } from './ramify-cli.js';
import { validateAgainstViews, viewKey } from './validate.js';
import {
  architectViewDirectory,
  coverageLimitsOf,
  findModule,
  loadArchitectIndex,
  readApiView,
  readArchitectMeta,
  type ApiViewSnapshot,
  type ArchitectIndex,
  type SourceArea,
} from './views.js';

/** The module-architect skill this package carries, used unchanged. */
export const defaultSkillDirectory = fileURLToPath(new URL('../../../../skills/module-architect', import.meta.url));
const architectPromptFile = fileURLToPath(new URL('./architect-prompt.md', import.meta.url));
const featureMappingFile = fileURLToPath(new URL('./feature-mapping.md', import.meta.url));

export const materializeToolName = 'materialize_api_view';

export interface ArchitectProcedureOptions {
  /** How the harness runs Ramify. */
  readonly ramify: RamifyCli;
  readonly skillDirectory?: string | undefined;
  /**
   * Stop the harness's own Ramify daemon before each job's first
   * materialization, so that every job's evidence comes from a fresh
   * analysis context. Ignored for a shared daemon.
   */
  readonly freshContextPerJob?: boolean | undefined;
}

/**
 * The mapping procedure on real evidence: the job's manifest names the
 * architect view it materialized; the architect works from that view and
 * the API views it asks for; its submission is validated against both; and
 * a change of the view's input identity at any materialization, or of the
 * plan before publication, fails the job as inputs changed.
 */
export function architectProcedure(options: ArchitectProcedureOptions): MappingProcedure {
  const skillDirectory = options.skillDirectory ?? defaultSkillDirectory;
  const ramify = options.ramify;

  return {
    async capture(projectRoot, capturedPlan) {
      const source = await sourceState(projectRoot);
      if (options.freshContextPerJob && ramify.ownsDaemon) await ramify.stopDaemon();
      const materialized = await ramify.materialize(projectRoot);
      if (!materialized.ok) throw new EvidenceUnavailableError(`The architect view could not be materialized: ${materialized.message}`);
      const meta = await readArchitectMeta(projectRoot).catch(error => {
        throw new EvidenceUnavailableError(`The architect view cannot be read: ${message(error)}`);
      });
      const [prompt, procedure, skill, ramifyRelease] = await Promise.all([
        readVersionedFile(architectPromptFile), readVersionedFile(featureMappingFile), skillVersion(skillDirectory), ramifyVersion(),
      ]);
      return {
        planHash: sha256(capturedPlan),
        source,
        versions: { architectPrompt: prompt.version, procedure: procedure.version, skill, ramify: ramifyRelease },
        architectView: { status: 'materialized', revision: meta.revision, input: meta.input, coverageLimits: coverageLimitsOf(meta) },
      };
    },

    async forJob(context, hooks) {
      const view = context.manifest.architectView;
      if (view.status !== 'materialized') throw new EvidenceUnavailableError('The job\'s manifest names no materialized architect view');
      const index = await loadArchitectIndex(context.projectRoot).catch(error => {
        throw new EvidenceUnavailableError(`The architect view cannot be read: ${message(error)}`);
      });
      const expectedInput = view.input;
      if (index.input !== expectedInput) throw new InputsChangedError([inputChange(expectedInput, index.input)]);
      const views = new Map<string, ApiViewSnapshot>();
      const materializations = new Mutex();

      const materializeTool: ToolDefinition = {
        name: materializeToolName,
        description: 'Refreshes the API views of one requesting module, from the same revision as the architect view, and answers with their paths and coverage. A module\'s API view is the definitive evidence of what that module may import: `<module dir>/src/.ramify/` for its ordinary source, `<module dir>/src/tests/.ramify/` for its tests. Replaces `ramify materialize --view architect --view api --from <requester-path>`.',
        inputSchema: {
          type: 'object',
          properties: {
            module: { type: 'string', description: 'The requesting module by its declared-name path, as the architect view names it (such as "shop/orders"); its project-relative directory is also accepted.' },
          },
          required: ['module'],
          additionalProperties: false,
        },
        execute: (input, signal) => materializations.run(() => materializeApiView(input, signal)),
      };

      async function materializeApiView(input: unknown, signal: AbortSignal): Promise<ToolResult> {
        const requested = typeof input === 'object' && input !== null ? (input as { module?: unknown }).module : undefined;
        if (typeof requested !== 'string' || requested.trim() === '') return error('Give the requesting module as {"module": "<declared-name path>"}.');
        const entry = findModule(index, requested.trim());
        if (!entry) {
          const names = [...index.modules.keys()];
          return error(`"${requested}" is not a module of the architect view. Modules: ${names.slice(0, 60).join(', ')}${names.length > 60 ? `, and ${names.length - 60} more` : ''}.`);
        }
        const result = await ramify.materialize(context.projectRoot, entry.dir, signal);
        if (signal.aborted) return error('The job was stopped.');
        if (!result.ok) return error(`The API view could not be materialized. ${result.message}`);
        const meta = await readArchitectMeta(context.projectRoot);
        if (meta.input !== expectedInput) {
          hooks.inputsChanged([inputChange(expectedInput, meta.input)]);
          return error('The project changed during this job, so the evidence no longer describes one source state. The job has failed; stop working.');
        }
        const snapshots: ApiViewSnapshot[] = [];
        for (const area of ['src', 'src/tests'] as const satisfies readonly SourceArea[]) {
          if (!await isDirectory(join(context.projectRoot, entry.dir, area))) continue;
          const snapshot = await readApiView(context.projectRoot, entry, area);
          if (!snapshot) continue;
          views.set(viewKey(entry.module, area), snapshot);
          snapshots.push(snapshot);
        }
        const evidence: ApiViewEvidence = {
          module: entry.module,
          views: snapshots.map(snapshot => ({ area: snapshot.area, path: snapshot.path, revision: snapshot.revision, coverage: snapshot.coverage })),
        };
        await hooks.recordApiView(evidence);
        return { text: describeViews(entry.module, entry.dir, snapshots, meta.revision) };
      }

      const [prompt, procedure, skill] = await Promise.all([
        readVersionedFile(architectPromptFile), readVersionedFile(featureMappingFile), readFile(join(skillDirectory, 'SKILL.md'), 'utf8'),
      ]);
      const systemPrompt = fill(prompt.body, {
        projectRoot: context.projectRoot,
        skillDirectory,
        skill: skill.trim(),
        procedure: procedure.body.trim(),
        mapSchema: JSON.stringify(mapSubmissionJsonSchema, null, 2),
      });

      const job: MappingJob = {
        session: {
          role: 'architect',
          systemPrompt,
          prompt: planMessage(context, index),
          builtinTools: ['read', 'grep', 'ls'],
          tools: [materializeTool],
          submission: {
            name: submissionToolName,
            description: 'Submit the implementation map. The harness validates it against the architect view and the API views materialized in this session; a valid map ends the session, and an invalid one is returned with every error.',
            inputSchema: mapSubmissionJsonSchema,
          },
        },
        async validate(submission) {
          const shape = validateMapSubmission(submission);
          if (!shape.ok) return shape;
          const errors = validateAgainstViews(shape.value, index, views);
          return errors.length ? { ok: false, errors } : shape;
        },
        async changes() {
          const changes = await planChanges(context.projectRoot, context.planId, context.manifest.planHash);
          const result = await materializations.run(() => ramify.materialize(context.projectRoot));
          if (!result.ok) throw new EvidenceUnavailableError(`The architect view could not be materialized before publication: ${result.message}`);
          const meta = await readArchitectMeta(context.projectRoot);
          if (meta.input !== expectedInput) changes.push(inputChange(expectedInput, meta.input));
          return changes;
        },
      };
      return job;
    },

    // The daemon's context is not restarted: the harness's own writes are
    // invisible to it, and a source change is what the comparison is for.
    async approvalChanges(projectRoot, planId, manifest) {
      const view = manifest.architectView;
      if (view.status !== 'materialized') {
        throw new EvidenceUnavailableError('The map\'s manifest names no materialized architect view, so its source state cannot be compared');
      }
      const changes = await planChanges(projectRoot, planId, manifest.planHash, 'since the map was made');
      const result = await ramify.materialize(projectRoot);
      if (!result.ok) throw new EvidenceUnavailableError(`The architect view could not be materialized: ${result.message}`);
      const meta = await readArchitectMeta(projectRoot).catch(error => {
        throw new EvidenceUnavailableError(`The architect view cannot be read: ${message(error)}`);
      });
      if (meta.input !== view.input) {
        changes.push(`The architect view's input identity is now ${meta.input}, not ${view.input}: the project's source or layout changed since the map was made`);
      }
      return changes;
    },
  };
}

function planMessage(context: MappingContext, index: ArchitectIndex): string {
  const view = context.manifest.architectView as Extract<InputManifest['architectView'], { status: 'materialized' }>;
  const root = [...index.modules.values()].find(entry => entry.parent === null);
  const source = context.manifest.source;
  return [
    `# Plan "${context.planId}"`,
    '',
    `The plan, as \`${planPath(context.planId)}\` read when this job started:`,
    '',
    '<plan>',
    context.plan.trim(),
    '</plan>',
    '',
    '# This job\'s evidence',
    '',
    `- Architect view: \`${architectViewDirectory}/\`, revision \`${view.revision}\`, input \`${view.input}\`.`,
    `- Coverage limits the view reports: ${view.coverageLimits.length ? view.coverageLimits.join('; ') : 'none'}.`,
    `- Modules: ${index.modules.size}; the root module is \`${root?.module ?? '?'}\`.`,
    `- Source: ${source === null ? 'not a git checkout' : `commit ${source.commit}${source.dirty ? ', with uncommitted changes, which the views include' : ''}`}.`,
    '',
    'Map the plan with the feature-mapping procedure and submit the map with `submit_implementation_map`.',
  ].join('\n');
}

function describeViews(module: string, dir: string, snapshots: readonly ApiViewSnapshot[], revision: string): string {
  if (snapshots.length === 0) {
    return `${module} has no source area (no ${dir ? `${dir}/` : ''}src/), so it has no API view. Any availability for it as a requester is "unknown".`;
  }
  const lines = [`API views of ${module}, materialized at revision ${revision}:`];
  for (const snapshot of snapshots) {
    const count = [...snapshot.files.values()].reduce((sum, file) => sum + file.names.size, 0);
    lines.push(`- ${snapshot.area}: ${snapshot.path}/ lists ${count} available originals in ${snapshot.files.size} files; ${snapshot.coverage === null
      ? 'coverage complete, so absence means unavailable'
      : `coverage limits: ${snapshot.coverage}, so absence is not proof of unavailability`}.`);
    lines.push(`  Search it with: rg -n -i -C 6 '<terms>' ${snapshot.path}/external ${snapshot.path}/children`);
  }
  lines.push('A generated file\'s path after external/ or children/ is the defining file, with .md appended. Cite that generated file as the availability record.');
  return lines.join('\n');
}

function inputChange(expected: string, found: string): string {
  return `The architect view's input identity is now ${found}, not ${expected}: the project's source or layout changed during the job`;
}

/** A file with a version comment on its first line: its body without the comment, and `<version>+sha256:<hash>`. */
async function readVersionedFile(path: string): Promise<{ body: string; version: string }> {
  const text = await readFile(path, 'utf8');
  const first = text.split('\n', 1)[0] ?? '';
  const declared = /version (\d+)/.exec(first)?.[1] ?? '0';
  const body = first.startsWith('<!--') ? text.slice(first.length + 1) : text;
  return { body, version: `${declared}+sha256:${sha256(text).slice(0, 16)}` };
}

/** The skill's version: a hash over every file of the skill, by path. */
async function skillVersion(directory: string): Promise<string> {
  const files = (await listFiles(directory)).sort();
  const parts: string[] = [];
  for (const file of files) parts.push(`${relative(directory, file).split(sep).join('/')}\n${await readFile(file, 'utf8')}`);
  return `sha256:${sha256(parts.join('\n\0\n')).slice(0, 16)}`;
}

async function listFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(path));
    else if (entry.isFile()) files.push(path);
  }
  return files;
}

function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => values[key] ?? match);
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function error(text: string): ToolResult {
  return { text, isError: true };
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
