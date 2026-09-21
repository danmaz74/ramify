import { isAbsolute, relative, resolve, sep } from 'node:path';
import { isContained } from '../guard/resolve-contained-path.js';
import type { GuardedScope } from '../guard/write-guard.js';
import type { ArchitectIndex } from '../../subs/evidence/src/views.js';
import { ownerOf } from '../kpi/lines.js';

/*
 * Read excursions.
 *
 * Write boundaries are hard and read boundaries are soft. The default is the
 * assignment's own scope, the views Ramify generates and the module's
 * onboarding; reading beyond it is permitted, and what the harness owes is
 * the record. The first read into another module is one `excursion`
 * observation and one concise reminder; every later read into the same
 * module is neither, because a warning repeated at every line is noise
 * rather than a boundary.
 *
 * A generated view is not an excursion: it is what the role is given to read.
 * Neither is a read of a path no module owns, such as the project's
 * manifest — there is no other module to have entered.
 */

/** Directories Ramify generates, which every role may read. */
const generatedViews = ['.ramify-architect', '.ramify'];

/** One read that left the assignment's scope. */
export interface Excursion {
  readonly module: string;
  readonly firstEntry: boolean;
}

export interface ExcursionOptions {
  readonly projectRoot: string;
  readonly index: ArchitectIndex | null;
  /** The scope the invocation may write, which is also where it reads without leaving anything. */
  readonly scope: GuardedScope | undefined;
}

/**
 * Watches one invocation's reads. It holds the modules already entered, so
 * that the record and the reminder happen once each.
 */
export class ExcursionWatcher {
  private readonly entered = new Set<string>();
  private readonly pending: string[] = [];

  constructor(private readonly options: ExcursionOptions) {}

  /**
   * The excursion this read is, or null. The path is as the agent wrote it,
   * absolute or relative to the working directory.
   */
  observe(path: string): Excursion | null {
    if (this.options.scope === undefined || path === '') return null;
    const absolute = resolve(this.options.projectRoot, path);
    const inside = relative(this.options.projectRoot, absolute).split(sep).join('/');
    if (inside === '' || inside.startsWith('../') || isAbsolute(inside)) return null;
    if (generatedViews.some(directory => inside === directory || inside.startsWith(`${directory}/`) || inside.includes(`/${directory}/`))) return null;
    if (this.options.scope.files.includes(absolute)) return null;
    if (this.options.scope.roots.some(root => isContained(root, absolute))) return null;

    const module = ownerOf(this.options.index, inside);
    if (module === null) return null;
    const firstEntry = !this.entered.has(module);
    if (!firstEntry) return null;
    this.entered.add(module);
    this.pending.push(reminderFor(module));
    return { module, firstEntry: true };
  }

  /** The modules this invocation has entered, in the order it entered them. */
  get modules(): readonly string[] {
    return [...this.entered];
  }

  /**
   * The reminders not yet given to the agent, emptying the queue. The port
   * gives the harness one channel that reaches a running session with text —
   * the result of a mutating call — so a reminder waits for the next one.
   */
  takeReminders(): string[] {
    return this.pending.splice(0);
  }
}

function reminderFor(module: string): string {
  return [
    `You read inside \`${module}\`, which this assignment does not cover.`,
    'Reading there is permitted and is recorded; writing there is not. Report what you need from it',
    'rather than changing it.',
  ].join(' ');
}
