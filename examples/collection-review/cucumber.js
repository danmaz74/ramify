/**
 * The Cucumber runner, for this package's one feature test.
 *
 * `cucumber-js` reads this file as its default profile. It is ordinary runner
 * configuration and sits beside `vite.config.ts` and `vitest.config.ts`:
 * tooling of the package rather than application source, so no module owns it.
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
  paths: ['src/tests/features/**/*.viz.feature'],
  import: ['src/tests/features/support/*.ts', 'src/tests/features/steps/*.ts'],
  format: ['progress'],
};
