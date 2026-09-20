/**
 * The Cucumber runner, for this package's one feature test.
 *
 * `cucumber-js` reads this file as its default profile. It is ordinary runner
 * configuration and sits beside `vite.config.ts` and `vitest.config.ts`:
 * tooling of the package rather than application source, so no module owns it.
 * The feature and its support code belong to `integration-tests`, a separately
 * declared testing module under the root's `subs/`, whose ordinary `src/` is
 * what the globs below collect.
 *
 * One scenario is the whole suite on purpose. It is the reference project's
 * witness for case K05 — actual runner registration, one scenario, and shared
 * hook initialization reached through two setup paths in one runtime — and not
 * this package's test framework, which is Vitest.
 *
 * `import` is what loads the support code. The support files come first, so
 * the World constructor and the hooks are registered before the step
 * definitions that use them. Both entries are globs of TypeScript, which the
 * `test:cucumber` script makes loadable by starting Node with `--import tsx`.
 */
export default {
  paths: ['subs/integration-tests/src/features/**/*.viz.feature'],
  import: [
    'subs/integration-tests/src/support/*.ts',
    'subs/integration-tests/src/steps/*.ts',
  ],
  format: ['progress'],
};
