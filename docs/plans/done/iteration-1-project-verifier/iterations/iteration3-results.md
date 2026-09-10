<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 3 results: definitive model

Status: implementation and focused verification complete; publication blocked
by conflicting control-plane artifact checks. Automatic iteration 3 regression
checks have not started. This iteration establishes constructed-tree model evidence only.
It does not claim filesystem/source coverage or Plan 1 completion.

## Prerequisites and scope

The workflow detail reported iterations 1 and 2 completed with publication
accepted before implementation began. Work follows the accepted iteration 1
contract package without changing its signatures, names, tags or activation
stages. All source edits, checks and Git operations used the authoritative
checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`, branch
`workflow/iteration-1-project-verifier`, starting revision `5a900cd`.

The legacy `src/model`, `src/viz`, combined root source barrel, package entries
and diagram/site artifacts remain unchanged. The existing control-plane edit to
`iteration2-check-results.md` was preserved and is excluded from this draft's
implementation commit.

## Delivered

- Implemented the exact reviewed model vocabulary in
  `subs/analysis/subs/model/src/interfaces/model.ts`, plus the eight public
  operations exposed through `src/index.ts`.
- Module IDs validate the decoded declared-name chain independently of physical
  grouping. Original IDs distinguish code/resources, owner, source-relative
  file and original lexical/effective binding. Original keys use the reviewed
  canonical JSON tuple; aliases never supply a new identity.
- Registry construction validates unknown input, the two fixed kinds, names,
  duplicate/conflicting definitions, definition fields and reserved testing.
  Default construction uses that validator. Definitions are copied, sorted and
  deeply frozen. Registry identity includes descriptions; default claims are
  computed and forged resolved identities/default claims are rejected.
- Source profiles retain the exact header tags for ordinary source. The tests
  area derives testing and every required-importer tag, without required-symbol
  tags. Child profiles are independent. Intended source roots require no disk
  creation. Filename spelling and nested helpers/tests directories do not
  replace the reserved source-area boundary.
- Original tag assignment collects explicit sets before defaults, checks all
  mandatory defining-area tags, rejects conflicts, and retains assignment
  locations. Model validation also enforces mandatory tags on private exports,
  resources, wrappers and type aliases. Forwarding preserves the original;
  newly defined bindings use their own defining profiles.
- Model construction validates a complete finite rooted ownership tree,
  consistent source areas/origins, original existence and grounded exposure
  selections. It rejects partial invalid graphs, overlapping source roots,
  invalid providers, collisions and incorrect effective flags. Equivalent
  repeated identities/exposures merge with their evidence. Named ineffective
  child selections retain their original identity and missing-path evidence.
- Visibility follows ownership, direct-child parent exposure and proper-ancestor
  descendants exposure, independently of tags. Decisions retain deterministic
  shortest exposure witnesses and relevant ineffective provider chains.
  Child receipt is evaluated by original identity across aliases.
- Import decisions check target, forwarding and defining origins before
  same-owner access, then visibility and all applicable tag requirements.
  Symbol-free loads still receive origin checks. Value/type-only requests
  remain distinct. Questions about unknown originals or inconsistent source
  classifications are caller errors rather than invented permission decisions.
- Retained model/results are detached, deeply frozen JSON data, with canonical
  ordering and no live compiler objects, filesystem handles or persistent
  registry/decision caches.
- Activated model M1-M6, analysis A5 and root R2 exactly as reviewed. The other
  six owners remain header-only. No package entry was activated early.
- Registered only the real `registry` capability and 14 exact I1-14 handlers in
  the existing reference harness. Expectations remain independent literals;
  assertions call the public model API. Updated the two existing harness tests
  whose real-runtime expectations changed, and documented the implementation
  and remaining source-analysis boundary.

## Independent evidence

Four owned test files cover registry validation/immutability; canonical identity
and complete-model validation; source profiles and tag assignments; exposure
grounding, aliases, collisions, broken paths and deterministic provenance;
source-origin versus symbol-tag restrictions; symbol-free loads; conjunction
and type availability; private access and independent child profiles; and new
wrapper/type-alias versus forwarding behavior.

The legacy shop's full 64-cell visibility table is retained as literal expected
data, together with subdivision, private-growth, root-parent and same-spelling
cases. Relevant legacy tag expectations are expressed through the new profiles
and registry. Superseded behavior is not ported as a requirement: duplicate
exposures now merge; unknown originals are invalid query inputs; testing-source
isolation applies before same-owner access; and generic tag kinds replace the
legacy fixed-tag implementation.

The real iteration gate recorded these individual outcomes:

| Instance | Outcome | Recorded assertions |
| --- | --- | ---: |
| I1-14:renamed-kinds | passed | 49 |
| I1-14:conjunction/all-present | passed | 8 |
| I1-14:conjunction/missing-importer-coupled | passed | 8 |
| I1-14:conjunction/missing-importer-transport | passed | 8 |
| I1-14:conjunction/missing-symbol-portable | passed | 8 |
| I1-14:conjunction/missing-symbol-deterministic | passed | 8 |
| I1-14:unknown/header | passed | 5 |
| I1-14:unknown/symbol | passed | 5 |
| I1-14:duplicate/same-kind | passed | 5 |
| I1-14:duplicate/conflicting-kind | passed | 5 |
| I1-14:invalid-kind | passed | 4 |
| I1-14:remove-testing | passed | 4 |
| I1-14:rebind-testing | passed | 4 |
| I1-14:two-evaluations | passed | 8 |

All use constructed fixture M and the explicit resolved registry. No compiler
configuration, acquisition, source resolution or filesystem assertion is
implied. Unknown header-tag diagnostics identify the supplied owner/source root;
the reviewed profile signature has no header span parameter. Explicit symbol
assignments retain their exact supplied declaration locations.

## Verification performed

Passed:

- `npm run worktree:prepare`.
- `npm run build`.
- `npm run type-check`, covering toolkit, portable owners, independent scripts
  and harness. Final execution passed after all edits.
- `npx vitest run subs/analysis/subs/model/src/tests/registry-profiles.test.ts subs/analysis/subs/model/src/tests/identity-model.test.ts subs/analysis/subs/model/src/tests/decisions.test.ts subs/analysis/subs/model/src/tests/legacy-visibility.test.ts`:
  **4 files, 158 tests passed**, Vitest 4.1.11, final reported duration 297 ms.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/runner.test.ts scripts/reference-harness/verify.test.ts -t 'runs the model instances|reports actual model execution'`:
  **3 amended tests passed**; 29 existing tests were unselected by the focused
  filter and remain delegated to automation. This includes actual harness
  subprocess exits and JSON results for both intermediate and full modes.
- `npm run reference:verify -- --plan 1 --iteration 3`: exit 0.
  The JSON variant also passed after final edits: prerequisite closure
  `[1, 2, 3]`, capability `registry`, 14 required/passed instances,
  **129 assertions**, 0 failed, 294 not executed, `planComplete: false`.
- `npx tsx scripts/reference-harness/validate.ts`: all 308 instance records,
  pointers and prerequisites valid; this is inventory validation only.
- Exact comparison of the model interface file with the reviewed TypeScript
  block and of all activated declarations with owners.md. All match, and
  remaining owners retain only their reviewed headers.
- Emitted-runtime dependency inspection starting at the model entry found
  **7 local runtime modules**, no external/filesystem/compiler/UI imports,
  dynamic imports or require calls, and no dependency on owned tests.
  A Node ESM import of the compiled entry confirmed exactly the eight reviewed
  public operations and a valid default registry.
- `git diff --check`; source diff inspection confirmed no legacy model or
  visualization changes.

The full-plan subprocess deliberately still exits 1 with 14 passed and 294
unexecuted instances; unavailable future capabilities remain a failing
completion gate.

During the first focused run, a fixture helper produced a nonnormalized root
declaration path. The fixture was corrected; subsequent focused runs passed.
Transient TypeScript errors while adding typed validators and parameterized
test data were corrected before final checks. No new test failure remains.

Full toolkit/harness Vitest, Cucumber, scenario coverage and sealed-file checks
were not run locally, following the supplied automatic-check policy. This draft
does not claim their eventual outcomes.

## Handoff and limits

Consumers can use the reviewed model entry and owning interface types directly.
Linking must supply every canonical original, collected assignments, source
profiles, located declarations and correct effective selections before building
a model. Source interpretation must establish targets/forwarding origins and
classify value versus type-only requests before asking for decisions. Unknown
or missing exports and unresolved access remain adapter/report concerns.

The model performs no disk discovery, parser/linker work, compiler resolution,
source enumeration, browser-closure verification, CLI work or production
selection. Its complete data remains available for later queries, without
claiming any such capability. Parser, acquisition, catalog, linking and source
handlers remain pending at their scheduled iterations.

## Recommendations for Next Iteration

1. Implement the parser independently in its owner and activate only its
   reviewed stage. Keep generic tag-name syntax separate from registry validity.
2. At the linking stage, attach parsed header spans to unknown-header diagnostics;
   the model profile API intentionally receives only an owner/root and raw tags.
   Continue using supplied exact locations for symbol assignments.
3. Preserve canonical original identity and testing-origin evidence when the
   compiler/catalog and access stages arrive. Do not turn missing prerequisites
   into empty successful models.
4. Run the delegated automatic regressions before accepting this draft. Keep
   the full Plan 1 gate failing until every required future instance executes.

## Publication bookkeeping

Implementation commit: `9ab062f`.
The first publication attempt returned `WORKTREE_DIRTY` for the pre-existing
generated `iteration2-check-results.md` change. Inspection showed only the
control plane's added `Regression Tests: PASSED` line. Its contents were not
edited; that existing generated output is committed separately with this
publication note so publication can preserve it. No iteration 3 regression
outcome is inferred from the iteration 2 result.

## Publication failure diagnosis

The retry after bookkeeping commit `70203cb` returned
`FILE_POLICY_VIOLATION`: the unchanged generated
`iteration2-check-results.md` belongs to iteration 2 and cannot appear in the
iteration 3 diff. The working tree is clean; implementation and required drafts
are committed. Publication has not succeeded.

Installed cucumber-viz version: **0.6.3**. Configured project root: `/ramify`;
Studio port: 4080. Workflow: `_JG0Ucx92X1f6WqRyuxxC`; active attempt:
`attempt_mhbYNTHGn40H6Dgjt3nRy`. The live publication-status tool reports no
pending accepted draft and retains the file-policy rejection.

Read-only evidence:

- The initial checkout diff already contained only the control plane's new
  iteration 2 `Regression Tests: PASSED` line.
- The workflow journal records iteration 2 post-commit regression completion
  immediately before iteration 3 starts. It records publication rejection
  against base `5a900cd98d550ce172a68c4eba7b02ea03e14471` and draft head
  `70203cbfefd0f6410a3fc33cfa2b49fec48a4ab8`.
- Installed `publication-service.js`, lines 2265-2321, restricts publish-time
  bookkeeping commits to current-iteration artifacts, but its subsequent
  dirty-file check rejects the changed previous-iteration artifact.
- The same service, lines 610-638, rejects a committed sibling-iteration
  artifact unless it matches accepted artifact state. This produced the second
  rejection after following the first error's instruction to commit.
- The available workflow tools include publication retry and status, but no
  control to reconcile this generated post-commit result with the accepted
  artifact state/base.

No application correction can resolve this publication-policy conflict.
The concrete next action is for the workflow service/operator to reconcile
iteration 2's generated post-commit result with its accepted artifact state
and publication base, then retry iteration 3. This belongs to external
cucumber-viz recovery; no workflow state, accepted artifact metadata or check
outcome was manually edited. The iteration 3 implementation remains ready for
automatic verification.
