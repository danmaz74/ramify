import { chmod, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { discoverPlans, readPlan } from '../plans/discover.js';
import { planTitle } from '../plans/title.js';
import { fixtureRoot, temporaryDirectory } from './helpers/fixture.js';

describe('planTitle', () => {
  test('the first ATX heading, outside code fences', () => {
    expect(planTitle('intro\n\n## Second level first\n# Later')).toBe('Second level first');
    expect(planTitle('```md\n# Not a title\n```\n# Title #')).toBe('Title');
    expect(planTitle('~~~~\n```\n# still code\n~~~~\n# C# guide')).toBe('C# guide');
  });

  test('none without a heading or with an empty one', () => {
    expect(planTitle('#hashtag only\ntext')).toBeUndefined();
    expect(planTitle('#\ntext')).toBeUndefined();
  });
});

describe('the fixture project', () => {
  test('has four plans, titled by their first heading', async () => {
    const plans = await discoverPlans(fixtureRoot);
    expect(plans.map(plan => [plan.id, plan.status, plan.status === 'readable' ? plan.title : '', plan.path])).toEqual([
      ['review-notes', 'readable', 'Reviewer notes on a review run', 'plans/review-notes/plan.md'],
      ['reviewer-identity', 'readable', 'Who reviewed a record', 'plans/reviewer-identity/plan.md'],
      ['revision-diff', 'readable', 'Compare two revisions of a record', 'plans/revision-diff/plan.md'],
      ['status-badge-tone', 'readable', 'A tone for the status badge', 'plans/status-badge-tone/plan.md'],
    ]);
  });
});

describe('discoverPlans', () => {
  let directory: Awaited<ReturnType<typeof temporaryDirectory>>;
  beforeEach(async () => { directory = await temporaryDirectory(); });
  afterEach(async () => {
    await chmod(join(directory.path, 'plans', 'locked', 'plan.md'), 0o644).catch(() => undefined);
    await directory.remove();
  });

  async function plan(id: string, content: string | null): Promise<void> {
    await mkdir(join(directory.path, 'plans', id), { recursive: true });
    if (content !== null) await writeFile(join(directory.path, 'plans', id, 'plan.md'), content);
  }

  test('no plans directory is an empty list', async () => {
    expect(await discoverPlans(directory.path)).toEqual([]);
  });

  test('skips hidden directories, loose files and directories without plan.md; falls back to the ID', async () => {
    await plan('.harness', '# Hidden');
    await plan('drafts', null);
    await plan('b-plan', 'No heading here.');
    await plan('a-plan', '﻿# A');
    await writeFile(join(directory.path, 'plans', 'README.md'), '# Not a plan');
    expect(await discoverPlans(directory.path)).toEqual([
      { status: 'readable', id: 'a-plan', title: 'A', path: 'plans/a-plan/plan.md', markdown: '# A' },
      { status: 'readable', id: 'b-plan', title: 'b-plan', path: 'plans/b-plan/plan.md', markdown: 'No heading here.' },
    ]);
  });

  test('an unreadable plan is an error entry, not a failed list', async () => {
    await plan('good', '# Good');
    await mkdir(join(directory.path, 'plans', 'folder', 'plan.md'), { recursive: true });
    await plan('binary', null);
    await writeFile(join(directory.path, 'plans', 'binary', 'plan.md'), Buffer.from([0xff, 0xfe, 0x00]));
    const plans = await discoverPlans(directory.path);
    expect(plans.map(entry => [entry.id, entry.status])).toEqual([['binary', 'unreadable'], ['folder', 'unreadable'], ['good', 'readable']]);
    expect(plans[0]).toMatchObject({ message: 'The file is not valid UTF-8' });
    expect(plans[1]).toMatchObject({ message: 'plan.md is a directory, not a file' });
  });

  test.skipIf(process.getuid?.() === 0)('a plan without read permission is unreadable', async () => {
    await plan('locked', '# Locked');
    await chmod(join(directory.path, 'plans', 'locked', 'plan.md'), 0o000);
    expect(await readPlan(directory.path, 'locked')).toMatchObject({ status: 'unreadable', message: 'plan.md cannot be read: permission denied' });
  });

  test('readPlan refuses IDs that are not one non-hidden segment', async () => {
    await plan('.harness', '# Hidden');
    for (const id of ['.harness', '..', '../plans/x', 'a/b', '']) expect(await readPlan(directory.path, id)).toBeUndefined();
    expect(await readPlan(directory.path, 'missing')).toBeUndefined();
  });
});
