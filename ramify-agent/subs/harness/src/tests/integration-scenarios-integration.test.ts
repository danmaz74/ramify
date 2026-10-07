import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, test } from 'vitest';
import { findingsOf } from '../hooks/post-write.js';
import { requestCompletion } from './helpers/analysis.js';
import { unchanged } from './helpers/contracts-git.js';
import {
  ancestorSteps, ancestorStepFile, bindAtAncestor, bindCommit, bindTurn, entryCommits, entryTurns, finalSubject, integrationFeature,
  integrationProject, noteSteps, notesModule, plan, runIntegration, tagSteps, tagsModule, type Cleanups,
} from './helpers/integration-scenario.js';
import { submit } from './helpers/iterations.js';
import { onlyRun, realRamify, runEventsOnDisk } from './helpers/runs.js';

/*
 * An integration scenario bound through `expose-test`, accepted by the real
 * checker, architecture §10.
 *
 * The scripted run of `helpers/integration-scenario.ts` completes with its
 * integration scenario bound and reported done: the integration work item's engineer
 * wrote a step file at the common ancestor that imports both sub-scenarios'
 * step files by name, and exposed each to its parent with `expose-test`.
 * The run's own gates use the direct executor, so what the engineer wrote
 * is then given to the installed Ramify, with a daemon of its own: the
 * complete check passes, and fails at the ancestor's import once one
 * exposure is taken away.
 */

const cleanups: Cleanups = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe('AS08: an integration scenario bound through expose-test', () => {
  test('the scripted run completes with the integration scenario done, and the real checker accepts the ancestor\'s imports only through the exposures', async () => {
    const root = await integrationProject(cleanups);
    const { service, runId, git } = await runIntegration(cleanups, root, {
      ...entryTurns,
      'local-architect:wi-003': [submit(bindAtAncestor), submit(requestCompletion())],
      'engineer:wi-003': [bindTurn],
    }, [...entryCommits, bindCommit, unchanged('wi-003'), unchanged(finalSubject)]);

    const snapshot = onlyRun(service, plan);
    expect(snapshot.failure).toBeNull();
    expect(snapshot.state).toBe('completed');
    expect(snapshot.counts.scenarios).toEqual({ pending: 0, bound: 0, done: 3 });
    const log = await runEventsOnDisk(root, plan, runId);
    expect(log.find(event => event.type === 'obligation-bound' && event.data.id === 'sc-003')).toBeDefined();
    expect(log.find(event => event.type === 'obligation-reported' && event.data.id === 'sc-003' && event.data.judgment === 'done')).toBeDefined();
    expect(log.at(-1)!.type).toBe('job-completed');
    git.assertAnswered();

    // What the engineers wrote is in the tree: both step files, the
    // ancestor's that imports them by name, and the two exposures.
    expect(readFileSync(join(root, ancestorSteps), 'utf8')).toBe(ancestorStepFile);
    expect(readFileSync(join(root, notesModule), 'utf8')).toContain('expose-test reviewNoteSteps from "steps/review-note.steps.ts" to parent');
    expect(readFileSync(join(root, tagsModule), 'utf8')).toContain('expose-test reviewTagsSteps from "steps/review-tags.steps.ts" to parent');
    expect(readFileSync(join(root, integrationFeature), 'utf8')).toContain('  @ramify-sc-003\n');
    for (const file of [noteSteps, tagSteps]) expect(readFileSync(join(root, file), 'utf8')).toContain('export const ');

    // The complete check a gate runs passes over that tree.
    const daemon = await realRamify();
    cleanups.push(() => daemon.dispose());
    const checked = await daemon.ramify.checkComplete(root);
    const errors = findingsOf(checked.report).map(finding => `${finding.code} ${finding.file ?? '(no file)'}:${finding.line ?? ''} ${finding.message}`);
    expect(errors).toEqual([]);
    expect([checked.outcome, checked.exitCode]).toEqual(['checked', 0]);

    // Without the tags' exposure the ancestor's import of its step file is
    // a violation there: the exposure is what the import passes through.
    await writeFile(join(root, tagsModule), 'ramify 1\nmodule tags\n');
    const unexposed = await daemon.ramify.checkComplete(root);
    expect(unexposed.exitCode).not.toBe(0);
    const denied = findingsOf(unexposed.report);
    expect(denied.map(finding => finding.file)).toEqual([ancestorSteps]);
  }, 300_000);
});
