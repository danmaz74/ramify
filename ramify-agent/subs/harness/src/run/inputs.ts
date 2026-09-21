import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { coverageLimitsOf, loadArchitectIndex, readArchitectMeta, type ArchitectIndex } from '../../subs/evidence/src/views.js';
import { ramifyVersion, type RamifyCli } from '../../subs/evidence/src/ramify-cli.js';
import type { InputManifest } from '../interfaces/protocol/evidence.js';
import { planPath } from '../plans/discover.js';
import type { LoadedPackage } from '../prompts/packages.js';

const exec = promisify(execFile);

/** Ramify's views could not be materialized or read. */
export class EvidenceUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EvidenceUnavailableError';
  }
}

function sha256(content: string | Uint8Array): string {
  return createHash('sha256').update(content).digest('hex');
}

/** Whether the plan still has the manifest's hash: an empty list, or why not. `since` ends the sentence that says so. */
export async function planChanges(projectRoot: string, planId: string, planHash: string, since = 'during the run'): Promise<string[]> {
  let current: string;
  try {
    current = sha256(await readFile(join(projectRoot, planPath(planId))));
  } catch (error) {
    return [`${planPath(planId)} cannot be read: ${error instanceof Error ? error.message : String(error)}`];
  }
  return current === planHash ? [] : [`${planPath(planId)} changed ${since}`];
}

/**
 * The checkout's commit and whether the project's files differ from it;
 * `null` outside git. Left out: `plans/`, which holds the plan with its own
 * hash and the harness's own records, and Ramify's generated views, which
 * are not source.
 */
export async function sourceState(projectRoot: string): Promise<InputManifest['source']> {
  try {
    const { stdout: commit } = await exec('git', ['-C', projectRoot, 'rev-parse', 'HEAD'], { timeout: 10_000 });
    const { stdout: status } = await exec('git', [
      '-C', projectRoot, 'status', '--porcelain', '--', '.',
      ':(exclude)plans', ':(exclude).ramify-architect', ':(exclude,glob)**/.ramify/**',
    ], { timeout: 30_000 });
    return { commit: commit.trim(), dirty: status.trim() !== '' };
  } catch {
    return null;
  }
}

/*
 * The evidence side of a run: the input manifest it captures before its
 * `job.json` is written, and the architect view its initial analysis is
 * validated against.
 *
 * It is a seam for the same reason the mapping job's is: a run's lifecycle,
 * its log and its recovery do not depend on how the evidence is obtained,
 * and a test of the lifecycle needs no views.
 */

export interface RunInputs {
  /**
   * A run's input manifest, complete before `job.json` is written. Throws
   * `EvidenceUnavailableError` when the evidence it names cannot be
   * materialized.
   */
  capture(projectRoot: string, capturedPlan: Uint8Array, packages: ReadonlyMap<string, LoadedPackage>): Promise<InputManifest>;
  /**
   * The architect view the analysis is validated against, or null where the
   * run has none. Without it the rules that need the view are not applied,
   * and the run records that as a coverage limit rather than accepting a
   * claim it did not check.
   */
  index(projectRoot: string, manifest: InputManifest): Promise<ArchitectIndex | null>;
  /** How the plan and the source now differ from the manifest; empty when neither changed. */
  changes(projectRoot: string, planId: string, manifest: InputManifest): Promise<string[]>;
  /**
   * The module inventory as the project stands now, refreshed before an
   * assignment is judged and before every gate resolves its tests. A
   * refresh that cannot be made answers null, and the caller records that
   * rather than reusing an earlier list.
   */
  refresh(projectRoot: string): Promise<ArchitectIndex | null>;
}

export interface ArchitectRunInputsOptions {
  readonly ramify: RamifyCli;
  /** Where a refresh that could not be made says why. The harness records the gap; this says what caused it. */
  readonly warn?: ((message: string) => void) | undefined;
}

/**
 * The run's inputs on real evidence: `ramify materialize --view architect`,
 * the view's revision, its input identity and its coverage limits, beside
 * the plan hash, the checkout and the versions of the prompt package and of
 * Ramify.
 */
export function architectRunInputs(options: ArchitectRunInputsOptions): RunInputs {
  const { ramify } = options;
  return {
    async capture(projectRoot, capturedPlan, packages) {
      const materialized = await ramify.materialize(projectRoot);
      if (!materialized.ok) throw new EvidenceUnavailableError(`The architect view could not be materialized: ${materialized.message}`);
      const meta = await readArchitectMeta(projectRoot).catch((error: unknown) => {
        throw new EvidenceUnavailableError(`The architect view cannot be read: ${error instanceof Error ? error.message : String(error)}`);
      });
      const initial = packages.get('initial-architect');
      return {
        planHash: sha256(capturedPlan),
        source: await sourceState(projectRoot),
        versions: {
          architectPrompt: initial?.files.find(file => file.kind === 'system')?.hash.slice(0, 16) ?? null,
          procedure: initial?.files.find(file => file.kind === 'procedure')?.hash.slice(0, 16) ?? null,
          skill: initial?.files.find(file => file.kind === 'skill')?.hash.slice(0, 16) ?? null,
          ramify: await ramifyVersion(),
        },
        architectView: { status: 'materialized', revision: meta.revision, input: meta.input, coverageLimits: coverageLimitsOf(meta) },
      };
    },

    async index(projectRoot, manifest) {
      if (manifest.architectView.status !== 'materialized') return null;
      return loadArchitectIndex(projectRoot);
    },

    async refresh(projectRoot) {
      const materialized = await ramify.materialize(projectRoot);
      if (!materialized.ok) {
        options.warn?.(`The architect view could not be refreshed: ${materialized.message}`);
        return null;
      }
      return loadArchitectIndex(projectRoot).catch((error: unknown) => {
        options.warn?.(`The refreshed architect view cannot be read: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      });
    },

    async changes(projectRoot, planId, manifest) {
      const changes = await planChanges(projectRoot, planId, manifest.planHash);
      if (manifest.architectView.status !== 'materialized') return changes;
      const meta = await readArchitectMeta(projectRoot).catch(() => null);
      if (meta === null) {
        changes.push('the architect view can no longer be read, so the source state it described cannot be compared');
      } else if (meta.input !== manifest.architectView.input) {
        changes.push(`The architect view's input identity is now ${meta.input}, not ${manifest.architectView.input}: the project's source or layout changed during the run`);
      }
      return changes;
    },
  };
}

/** The captured plan of a run, read from the project as it stands. */
export async function capturePlan(projectRoot: string, planId: string): Promise<Uint8Array> {
  return readFile(join(projectRoot, planPath(planId)));
}
