import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { ExcursionWatcher } from '../run/excursions.js';
import { architectIndex, moduleEntry } from './helpers/views.js';

/*
 * Read boundaries are soft.
 *
 * The default is the assignment's own scope, what Ramify generates and the
 * module's onboarding. Reading beyond it is permitted; what the harness owes
 * is the record, once per module, and one concise reminder rather than a
 * warning at every line.
 */

const root = '/project';
const notes = 'collection-review/workspace/reviews/notes';
const notesDirectory = 'subs/workspace/subs/reviews/subs/notes';
const reviews = 'collection-review/workspace/reviews';
const reviewsDirectory = 'subs/workspace/subs/reviews';

const index = architectIndex([
  moduleEntry('collection-review', '', null),
  moduleEntry('collection-review/workspace', 'subs/workspace', 'collection-review'),
  moduleEntry(reviews, reviewsDirectory, 'collection-review/workspace'),
  moduleEntry(notes, notesDirectory, reviews),
]);

function watcher() {
  return new ExcursionWatcher({
    projectRoot: root,
    index,
    scope: { revision: 1, roots: [join(root, notesDirectory, 'src')], files: [join(root, notesDirectory, 'module.ramify')] },
  });
}

describe('a read that leaves the assignment\'s scope', () => {
  test('is one excursion on first entry, and nothing on every later read of the same module', () => {
    const watch = watcher();

    expect(watch.observe(`${reviewsDirectory}/src/router.ts`)).toEqual({ module: reviews, firstEntry: true });
    expect(watch.observe(`${reviewsDirectory}/src/session.ts`)).toBeNull();
    expect(watch.observe(`${reviewsDirectory}/src/tests/router.test.ts`)).toBeNull();
    expect(watch.modules).toEqual([reviews]);

    // One reminder, given once, and the queue is empty afterwards.
    const reminders = watch.takeReminders();
    expect(reminders).toHaveLength(1);
    expect(reminders[0]).toContain(reviews);
    expect(reminders[0]).toContain('permitted');
    expect(watch.takeReminders()).toEqual([]);
  });

  test('a second module entered is its own excursion', () => {
    const watch = watcher();
    expect(watch.observe(`${reviewsDirectory}/src/router.ts`)?.module).toBe(reviews);
    expect(watch.observe('subs/workspace/src/app.tsx')?.module).toBe('collection-review/workspace');
    expect(watch.modules).toEqual([reviews, 'collection-review/workspace']);
    expect(watch.takeReminders()).toHaveLength(2);
  });

  test('a read inside the scope is no excursion, and neither is the scope\'s own declaration', () => {
    const watch = watcher();
    expect(watch.observe(`${notesDirectory}/src/notes.ts`)).toBeNull();
    expect(watch.observe(`${notesDirectory}/src/tests/notes.test.ts`)).toBeNull();
    expect(watch.observe(join(root, notesDirectory, 'module.ramify'))).toBeNull();
    expect(watch.modules).toEqual([]);
  });

  test('what Ramify generates is what the role is given to read, never an excursion', () => {
    const watch = watcher();
    expect(watch.observe('.ramify-architect/harness/module.json')).toBeNull();
    expect(watch.observe(`${reviewsDirectory}/src/.ramify/index.md`)).toBeNull();
    expect(watch.modules).toEqual([]);
  });

  test('a path no module owns is no excursion: there is no other module to have entered', () => {
    const watch = watcher();
    expect(watch.observe('package.json')).toBeNull();
    expect(watch.observe('plans/review-notes/plan.md')).toBeNull();
    // Outside the project entirely: a compiler or runner read of its own
    // installation is not a module of this project.
    expect(watch.observe('/usr/lib/node_modules/typescript/lib/lib.d.ts')).toBeNull();
    expect(watch.modules).toEqual([]);
  });

  test('an invocation with no scope records no excursion at all', () => {
    const watch = new ExcursionWatcher({ projectRoot: root, index, scope: undefined });
    expect(watch.observe(`${reviewsDirectory}/src/router.ts`)).toBeNull();
    expect(watch.takeReminders()).toEqual([]);
  });
});
