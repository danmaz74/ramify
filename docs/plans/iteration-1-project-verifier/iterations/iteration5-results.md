<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 5 results: project acquisition and metadata

Status: implementation and focused verification complete; submitted as an iteration draft for acceptance and automatic checks. This establishes project acquisition and metadata, not source cataloging, linked permissions, CLI checking or Plan 1 completion.

## Prerequisites and working scope

Workflow detail confirmed iterations 1 through 4 completed with accepted publication. This iteration requires 2 and 4 and uses the reviewed project contracts unchanged. All implementation edits, tests and Git operations used the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`, branch `workflow/iteration-1-project-verifier`, starting revision `f8e8517d6851eaf383d32ae134b0d52d64e54b9c`.

The pre-existing control-plane change in `iteration4-check-results.md` was preserved and excluded from implementation staging. No previous results, checklist, check outcome, reviewed plan, instance inventory or required membership was edited.

## Delivered

- Implemented the exact reviewed `ProjectRequest`, scope, inventory, metadata, exact-reference, issue, limits and input-view vocabulary in `subs/analysis/subs/project/src/interfaces/project.ts`, and public `readProject(options)` in `read-project.ts`.
- Explicit root selection rejects symlink roots and missing root descriptions. Implicit selection canonicalizes cwd, climbs through multiple ordinary grouping levels beneath subs, stops at the nearest independent declared boundary, diagnoses a missing parent above a direct subs child, and never searches downward for a project.
- Discovery records declared-path IDs, parents, raw header tags, ordinary and nested tests areas, intended absent source roots, source/resource file identities, and README metadata. Grouping moves preserve declared IDs; rename and reparent change them. Acquisition creates no source directories.
- Invalid descriptions, duplicate sibling names, markers inside src, reserved-container markers, stray descriptions and symlink descriptions are located invalid inputs. Malformed boundaries never assign their source to an ancestor. UTF-8 validation precedes parser invocation; parser issue codes, lines, columns and spans remain in acquisition issues.
- Every owned file is inventoried independently of compiler selection, including nested tests, ordinary source in a testing module, CSS, HTML, feature files and binary resources. Only the fixed src/tests area receives the raw tests classification; registry/profile evaluation remains with the model/analysis owners.
- The actual compiler selects outside-module source. Warnings aggregate by root entry and count, with no owned source-area classification. Unselected outside-source bytes are silent. Compiler exclusions cannot hide owned src/subs or misplaced descriptions. Independent configurations, installed dependencies and generated-output conventions provide discovery boundaries.
- Exact references preserve decoded paths and statement indexes, normalize POSIX dot segments, enforce the selected src or src/tests root, compare every component against exact directory entries, and distinguish file, missing, directory, escape, symlink, case mismatch, excluded and invalid-path states. No extension substitution, alias resolution, implicit index lookup or symlink traversal is used. Interface eligibility is recorded for the later linker.
- README acquisition records the README path and first top-level prose paragraph rendered as text. Headings, lists, tables, quotes, code blocks and HTML blocks do not supply a fallback. Missing-file and no-paragraph states do not invalidate layout.
- One invocation-owned capture supplies discovery, descriptions, metadata, exact paths, resources, configuration and future compiler callbacks. It records original bytes/hashes, file kinds, canonical paths, directory membership and negative observations. Text decoding is strict UTF-8; binary resources are hashed without decoding.
- Capture revalidates observations and retries the whole acquisition at most three times within one acquisition deadline. Root climbing observes only the relevant ancestor marker so unrelated temporary-directory activity cannot invalidate the project. Regular-file reads use no-follow/nonblocking opens to reject a symlink replacement between observation and capture.
- A successful view remains open for iteration 6's additional influencing reads. Repeated reads use captured data. Seal validates observations and forbids new observations or previously unread bytes. Changed sealing is explicit. Idempotent disposal releases retained bytes and observations; inventory and prior input records remain frozen plain data.
- Moved TypeScript to the exact runtime dependency `7.0.2`, with only corresponding dependency-classification changes in the lockfile. The configuration-only helper uses its reviewed `typescript/unstable/sync` API without creating a compiler program or importing the future source adapter.
- The helper runs in a supervised POSIX process group. Every native filesystem callback is served asynchronously from the parent capture, with no undefined/live-disk fallback. The single-operation bridge enforces 1 MiB frames and sequential 192 KiB chunks; a 2 MiB configuration transfer is tested. Deadlines/cancellation terminate the owned group, with escalation and pipe cleanup. No application/configuration script, daemon, listener or web runtime is launched.
- Activated P1/P2, analysis A7 and only the project-name portion of root R4. Updated the parser's independent current-declaration fixtures for these stage additions. No future exports or package surfaces were fabricated.
- Added the reviewed F materialization recipe and 35 real-filesystem handlers to the existing harness. Registered only the newly implemented acquire/metadata capabilities. All handlers use the real readProject operation and injected real description parser, with a checked baseline before each mutation. Existing runtime/invocation expectations now reflect actual acquisition availability.

## Executed matrix evidence

`npm run reference:verify -- --plan 1 --iteration 5` passed. The final direct Node/tsx JSON invocation of that same verifier also exited 0 with empty stderr, prerequisite closure `[1, 2, 4, 5]`, **88 required/passed instances**, **0 failed**, **220 not executed**, **3,070 assertions** including baselines, and `planComplete: false`. These comprise all 53 parser prerequisites and all 35 assigned filesystem instances. Model iteration 3 is available but is not in iteration 5's prerequisite closure.

The ignored final report is `examples/collection-review/.reference-work/iteration5-final-9ifcjvhk/verification.json`. The portable per-instance summary follows.

| Instance | Outcome | Assertions including baseline |
| --- | --- | ---: |
| I1-02:missing-root | passed | 8 |
| I1-02:invalid-child | passed | 10 |
| I1-02:duplicate-name | passed | 9 |
| I1-02:description-in-src | passed | 8 |
| I1-02:stray-description | passed | 13 |
| I1-02:loose-subs-source | passed | 10 |
| I1-02:sibling-tests | passed | 10 |
| I1-02:sibling-interfaces | passed | 10 |
| I1-03:empty-owner | passed | 11 |
| I1-03:grouping-move | passed | 9 |
| I1-03:rename | passed | 9 |
| I1-03:reparent | passed | 9 |
| I1-04:exact-path/js-extension | passed | 10 |
| I1-04:exact-path/extensionless | passed | 10 |
| I1-04:exact-path/configured-alias | passed | 10 |
| I1-04:case-mismatch | passed | 10 |
| I1-04:escape/parent | passed | 10 |
| I1-04:escape/absolute | passed | 10 |
| I1-04:symlink-root | passed | 8 |
| I1-04:symlink-description | passed | 8 |
| I1-04:symlink-reference | passed | 8 |
| I1-04:symlink-directory | passed | 13 |
| I1-25:purpose | passed | 8 |
| I1-25:missing-readme | passed | 8 |
| I1-25:no-paragraph | passed | 8 |
| I1-25:readme-edit | passed | 10 |
| I1-29:explicit-root | passed | 14 |
| I1-29:root-from-subdirectory | passed | 13 |
| I1-29:root-from-grouped-subdirectory | passed | 9 |
| I1-29:root-outside | passed | 10 |
| I1-29:nested-project-root/root-example | passed | 13 |
| I1-29:nested-project-root/child-example | passed | 13 |
| I1-29:stray-files | passed | 11 |
| I1-29:scope-report/given | passed | 25 |
| I1-29:scope-report/found | passed | 25 |

Both real reference scope variants independently assert 15 owners, 59 owned files, both distinct CSS-module resources, 30 ordinary/testing area roots, the standalone integration-tests owner, exact exposure references, captured configuration bytes and exactly two single-file warnings for vite.config.ts and vitest.config.ts. They also acquire the actual toolkit and assert its nine owners and zero warnings.

The stray-description instance exercises the prompt's tests/helper.ts plus tests/module.ramify spelling and independently checks the earlier reviewed loose-directory spelling. Grouped-root discovery crosses three grouping levels. Independent-project variants cover both root examples and an example beneath a child module.

The root-outside fixture necessarily creates an owned OS temporary directory: a location beneath the ramified harness checkout would discover the enclosing project. It creates a project below the unmarked cwd, proves that discovery does not descend into it, and deletes its owned directory in finally. All other mutations use isolated ignored harness copies. No application checkout is mutated.

## Verification performed

Passed:

- `npm run worktree:prepare`.
- `npm run type-check`, including toolkit, portable owners, independent scripts and harness; final execution passed after the last implementation change.
- `npm run build`; final emitted build passed.
- `npx vitest run subs/analysis/subs/project/src/tests subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`: **5 files, 102 tests passed**, final duration 6.56 seconds with Vitest 4.1.11. This includes 77 project-owned tests and 25 existing description/declaration tests.
- Focused amended harness tests in runner.test.ts and verify.test.ts: **5 tests passed** in the initial focused run, covering the real full gate and iterations 3, 4 and 5. After the root-discovery correction, the affected full-gate and iteration-5 invocation tests were rerun: **2 passed**, with 32 existing tests unselected by the filter. Full gate still reports 102 executed instances and 206 unavailable instances, exits 1 and retains planComplete false.
- `npm run reference:verify -- --plan 1 --iteration 5` and the final JSON invocation summarized above.
- `npx tsx scripts/reference-harness/validate.ts`: all 308 records, pointers and prerequisites valid. This is inventory validation, not conformance evidence.
- Real Node ESM imports of the emitted readProject and parser, followed by compiled-helper acquisition, coherent seal and disposal for both actual projects: reference 15 owners/59 owned files/two warnings; toolkit nine owners/91 current owned files/no warnings. The interim toolkit count includes staged source and .gitkeep resources; it is not production-build selection.
- Exact comparison of the implemented project interface with the reviewed TypeScript block and P1/P2 with the reviewed declaration.
- Inspection of the emitted parent static import closure: nine local runtime modules and only Node built-ins as external static imports; the public entry exports only readProject. TypeScript is loaded in the separate configuration helper. The compiled branch does not require the development tsx loader.
- `git diff --check` and implementation diff review.

One parallel focused run had 99 passing tests and a failure in implicit cwd symlink discovery: observing all entries of /tmp made unrelated concurrent fixture activity look like changed project input. A dedicated named-marker regression reproduced the unnecessary dependency; the root climb now records only the candidate marker. The affected test and regression passed, followed by the final complete focused suite above.

An ad-hoc static-import inspection initially misread the literal process argument '--import' as an ESM import. The inspection was corrected to match actual import declarations and passed; the compiled acquisition/seal checks had already passed. No implementation or test failure remains.

The supplied automatic-check policy takes precedence over broad local npm test execution. Full toolkit/harness Vitest regression, Cucumber, scenario coverage and sealed-file checks were not run locally and remain with workflow automation. Their outcomes are not claimed here. No diagram/site/runtime application changes were made.

## Handoff and limits

Iteration 6 must supply every compiler callback through the returned open ProjectInputView and preserve null/false/empty missing-input responses without live-disk fallback. It may add first observations for influencing configuration, package, declaration, library and resolution inputs until seal. It owns its source-helper deadline and must dispose its compiler work and view on terminal outcomes.

Later analysis composition resolves raw header tags to model profiles and builds input identity from scope, registry and captured inputs. This owner does not depend on iteration 3 or validate import permissions. Interface wildcard expansion, missing exports, foreign-original checks and child exposure linking remain iteration 7 work. Source coverage, analysis sessions, CLI results, production selection, self-check and plan-completion evidence remain assigned to later iterations.

ProjectInputView is intentionally live and disposable; inventory and captured-input records are frozen plain data. A changed final seal requires discarding all dependent source work and retrying the whole affected analysis within its finite policy. Session-level cancellation, retained-report memory, repeated-run measurements and complete native lifecycle acceptance remain iterations 12 and 15; the focused acquisition tests do not claim those matrix instances.

## Recommendations for Next Iteration

1. Use the exact reviewed project contract and parent-served filesystem bridge for source catalog acquisition; keep compiler objects inside the adapter.
2. Preserve the difference between raw source areas and resolved model profiles, and between exact resource existence and compiler export descriptions.
3. Extend influencing-input and cancellation evidence through the real source helper and session at their assigned stages, including the explicit changed-input matrix variants.
4. Continue activating declarations only alongside real exports and provider contracts. Run automated regressions before accepting this draft; the full Plan 1 completion gate must continue to fail for missing future capabilities.
