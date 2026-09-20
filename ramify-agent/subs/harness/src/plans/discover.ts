import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { planIdSchema } from '../interfaces/protocol/ids.js';
import { planTitle } from './title.js';

/** The directory of plans, relative to the project root. */
export const plansDirectory = 'plans';

export type DiscoveredPlan =
  | { readonly status: 'readable'; readonly id: string; readonly title: string; readonly path: string; readonly markdown: string }
  | { readonly status: 'unreadable'; readonly id: string; readonly path: string; readonly message: string };

const utf8 = new TextDecoder('utf-8', { fatal: true });

/** The project-relative path of a plan's file. */
export function planPath(id: string): string {
  return `${plansDirectory}/${id}/plan.md`;
}

/**
 * Every `plans/<id>/plan.md`, ordered by ID. Hidden directories, such as the
 * harness's own `.harness/`, and directories without `plan.md` are skipped;
 * symbolic links are not followed. A `plan.md` that exists but cannot be read
 * is an unreadable entry, not a failure of the list. A missing `plans/`
 * directory is an empty list.
 */
export async function discoverPlans(projectRoot: string): Promise<DiscoveredPlan[]> {
  let entries;
  try {
    entries = await readdir(join(projectRoot, plansDirectory), { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const ids = entries
    .filter(entry => entry.isDirectory() && planIdSchema.safeParse(entry.name).success)
    .map(entry => entry.name)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const plans: DiscoveredPlan[] = [];
  for (const id of ids) {
    const plan = await readPlan(projectRoot, id);
    if (plan) plans.push(plan);
  }
  return plans;
}

/**
 * One plan by ID, or `undefined` when the ID is not a plan: invalid, hidden,
 * or without a `plan.md`.
 */
export async function readPlan(projectRoot: string, id: string): Promise<DiscoveredPlan | undefined> {
  if (!planIdSchema.safeParse(id).success) return undefined;
  const path = planPath(id);
  let bytes: Buffer;
  try {
    bytes = await readFile(join(projectRoot, path));
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT' || code === 'ENOTDIR') return undefined;
    return { status: 'unreadable', id, path, message: describe(error) };
  }
  let markdown: string;
  try {
    markdown = utf8.decode(bytes);
  } catch {
    return { status: 'unreadable', id, path, message: 'The file is not valid UTF-8' };
  }
  if (markdown.startsWith('﻿')) markdown = markdown.slice(1);
  return { status: 'readable', id, path, title: planTitle(markdown) ?? id, markdown };
}

function describe(error: unknown): string {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === 'EISDIR') return 'plan.md is a directory, not a file';
  if (code === 'EACCES' || code === 'EPERM') return 'plan.md cannot be read: permission denied';
  return error instanceof Error ? error.message : String(error);
}
