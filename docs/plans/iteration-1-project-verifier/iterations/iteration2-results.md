<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 2 results: skeleton tree, build configuration and harness runner

Status: implementation draft complete; automatic regression verification pending.
No I1 semantic instance has executed, and this iteration does not claim Plan 1
completion or acceptance of iteration 1's architecture contracts.

## Delivered

- Created all nine reviewed, header-only `module.ramify` declarations and purpose
  READMEs. Each owner has `src/tests/`, retained in Git by an empty `.gitkeep`.
  Root's existing documentation follows its reviewed purpose paragraph. No future
  exposure or placeholder export was activated, and legacy `src/model`,
  `src/viz` and the combined source barrel were not moved or edited.
- Split whole-project checking, transitional emission and portable checking.
  Root `tsconfig.json` uses package-root `rootDir`, Node ambient types, no emit,
  and legacy plus nested owner selection. It excludes the independent example,
  site and tooling scopes. `tsconfig.build.json` emits under `dist/src` and
  `dist/subs`; package `main` and `dev` follow that transitional build.
  `tsconfig.portable.json` preserves the separate ambient-type restriction.
  The tooling configurations remain independent. Vitest discovers legacy and
  nested `.test.ts`/`.test.tsx` files, including testing owners' ordinary source.
  Transitional emission still includes tests; production selection remains I8.
- Extended `cases.ts` with the complete Plan 1 instance surface, backed by 308
  explicit leaf records in `plan1-instances.ts`. Records retain matrix/family
  identity, implementing iteration, capabilities, fixture/root/configuration/
  registry, mutation, independent expectation, coverage and document pointers.
  All 168 syntax/behavior variants remain separate. No execution status is
  stored in an instance.
- Added an independent reviewed-document membership reader and prerequisite
  validation. Gate membership does not depend on executable records or handler
  registration. Removed records, changed expectations, missing capabilities,
  disabled handlers, empty assertions and failed assertions cannot produce a
  successful required gate. Resource catalog prerequisites remain distinct
  from the later resource-access capability.
- Added isolated project copying/materialization, checked-baseline-before-mutation
  sequencing, single-anchor replacement, explicit whole-project acquisition
  requests, result assertion recording and cleanup on every settled outcome.
  Copies use unique `examples/collection-review/.reference-work/run-*/<id>/project`
  directories, retain source/test nesting, exclude dependencies/outputs/older
  copies, and resolve dependencies from the example. An explicit preservation
  option retains only failed owned runs. Concurrent calls use separate roots.
- Added `reference:verify -- --plan 1`, intermediate `--iteration N` verification,
  `--preserve-on-failure`, human and JSON reports, and strict argument handling.
  Intermediate reports retain all future instances as not executed and never
  claim plan completion. The real runtime registers no capability or handler.
- The reference report prints all 308 instance outcomes separately from the
  existing 63-family catalogue and application tiers. Its original explicitly
  hand-reviewed violation count is retained as required until I14.
- Added harness documentation and updated the testing command guide.

## Tests supplied for automatic execution

Four new Vitest files cover inventory integrity and exact variants; prerequisite
closure; full/intermediate positive controls and sabotaged gates; missing
capabilities, removed records, disabled handlers, absent assertions and caught
assertion failures; baseline enforcement; explicit copied roots; real filesystem
copying, one-edit mutation, original-file preservation, dependency resolution,
output exclusions, cleanup, preservation, concurrent isolation and setup errors;
and real harness subprocess output/exits.

These deterministic harness stubs are test-only. They do not register a
capability in `runtime.ts` or establish source/model conformance. All new tests
were type-checked, but Vitest and Cucumber were not run locally under the supplied
automatic-check policy. Their execution and passing status remain pending.
`npm run reference:cases` invokes Vitest, so its full test command was likewise
reserved for the automatic checks. Its instance/pointer validation was run
separately through `validate.ts`.

## Verification performed

All application edits, compiler work and Git operations used the authoritative
checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`, on
`workflow/iteration-1-project-verifier`. Starting revision: `84714c5`.

Passed:

- `npm run worktree:prepare`.
- `npm run build`.
- `npm run type-check`, covering the whole toolkit, portable source, scripts,
  the independent harness configuration and all new test source.
- `npx tsx scripts/reference-harness/validate.ts`: 308 exact records, document
  pointers, family/architecture evidence references and prerequisites valid.
- `npm run reference:report -- --dry-run`: exit 0; exactly 308 I1 instances
  reported not executed; no example tier or source assertion ran.
- A temporary compiler probe inside the project owner's source compiled with
  Node ambient types and emitted both JavaScript/declarations under `dist/subs`.
  `dist/src/index.js` exists. `tsc --showConfig` confirmed nested selection and
  exclusion of example/site/scripts from whole-project inputs. The probe and
  its generated outputs were removed afterward.
- Manual comparison of all nine current headers with the reviewed first two
  lines, presence of purpose READMEs/test directories, empty nested runtime
  source, and updated local documentation links.
- `npm run diagrams`: all nine checked-in SVGs remained byte-identical.
- `npm run site:build`.
- `git diff --check`.

Expected unavailable-capability results, observed through the actual commands:

- `npm run reference:verify -- --plan 1`: exit 1; 308 required, 0 passed,
  0 executed failures, 308 not executed; no capabilities available; plan incomplete.
- `npm run reference:verify -- --plan 1 --iteration 3 --format json`: exit 1;
  required iteration closure `[1, 2, 3]`; 14 registry instances required and
  unavailable; all other 294 instances explicitly pending; plan incomplete.

The first pointer-validation run incorrectly looked for DA/PC/QT witnesses only
in the reference family catalogue. Validation now also checks their owning
architecture documents and retains those pointers; the subsequent validation
passed. This was a harness validator correction, not an I1 checker result.

## Preserved state and limits

The pre-existing change to `iteration1-check-results.md` was left untouched and
is excluded from the implementation commit. No control-plane result/status file
was edited directly. This results draft and the checklist use the workflow MCP
write tools.

No parser, definitive model, acquisition implementation, source checker, CLI
executable, production selector or semantic fixture handler is implemented here.
No contract review is self-approved. The ordinary reference report's application
and protocol execution paths remain present; their regressions are automatic.

## Recommendations for Next Iteration

1. Complete the required acceptance of iteration 1's contracts before iteration 3.
2. Implement each assigned owner and activate its reviewed exposures only with
   the corresponding real exports. Preserve the header-only stages elsewhere.
3. Register the actual provider capability and exact leaf assertions in
   `runtime.ts`; use the real stage/session API and independent expectations.
   Iteration 3 owns the 14 I1-14 records; iteration 4 owns 53 parser records.
4. Materialize the F/J/T/H recipes at their assigned stages. Project handlers
   must assert their prepared positive baseline before applying the recorded
   cause, await all work, and assert through the evidence recorder.
5. Run the automatic toolkit and harness Vitest suites and Cucumber checks before
   accepting this draft. Full Plan 1 verification must continue to fail until
   every required capability and assertion exists and executes successfully.
