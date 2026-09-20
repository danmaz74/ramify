import { After, BeforeAll } from '@cucumber/cucumber';

import { recordBeforeAll } from './initialization.js';
import type { CollectionReviewWorld } from './world.js';

/**
 * The run's shared hooks, and the second half of reference case K05.
 *
 * This file is named by two setup paths in one runtime, deliberately.
 * Cucumber's `import` glob in `cucumber.js` loads it as support code, and the
 * step definitions load it again with a symbol-free `import
 * '../support/hooks.js'`. Under Node's ESM resolution both specifiers name one
 * module URL, so the file is evaluated once: the initialization below happens
 * once and `BeforeAll` is registered once. Two paths that resolved differently
 * — a `require` of one and an `import` of the other under a loader, a
 * specifier a resolver kept distinct — would evaluate it twice and register
 * the hook twice, and the scenario's last step is what would then fail.
 *
 * Importing `./initialization.js` is the initialization: evaluating that file
 * is the whole effect. `recordBeforeAll` is a capability this file genuinely
 * uses, not an export invented so that a side effect would have something to
 * call.
 */

BeforeAll(() => {
  recordBeforeAll();
});

After(async function (this: CollectionReviewWorld) {
  await this.closeAll();
});
