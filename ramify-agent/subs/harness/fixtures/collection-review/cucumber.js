/**
 * The Cucumber runner, for this package's feature tests.
 *
 * `cucumber-js` reads this file as its default profile. It is ordinary runner
 * configuration and sits beside `vite.config.ts` and `vitest.config.ts`:
 * tooling of the package rather than application source, so no module owns it.
 * The package's own feature and its support code belong to
 * `integration-tests`, a separately declared testing module under the root's
 * `subs/`, whose ordinary `src/` is what its globs collect.
 *
 * Its one scenario is the reference project's witness for case K05 — actual
 * runner registration, one scenario, and shared hook initialization reached
 * through two setup paths in one runtime — and not this package's test
 * framework, which is Vitest.
 *
 * The profile also collects the feature files ramify-agent writes for a plan
 * and the step definitions that bind them: a module's `src/tests/features/`
 * and `src/tests/steps/`, or a testing module's `src/features/` and
 * `src/steps/`. `not @ramify-pending` leaves out every scenario no step file
 * binds yet.
 *
 * `import` is what loads the support code. The support files come first, so
 * the World constructor and the hooks are registered before the step
 * definitions that use them. Every entry is a glob of TypeScript, which the
 * `test:cucumber` script makes loadable by starting Node with `--import tsx`.
 */
export default {
  paths: [
    'subs/integration-tests/src/features/**/*.feature',
    'src/tests/features/**/*.feature',
    'subs/**/src/tests/features/**/*.feature',
  ],
  import: [
    'subs/integration-tests/src/support/*.ts',
    'subs/integration-tests/src/steps/**/*.{ts,tsx}',
    'src/tests/steps/**/*.{ts,tsx}',
    'subs/**/src/tests/steps/**/*.{ts,tsx}',
  ],
  tags: 'not @ramify-pending',
  format: ['progress'],
};
