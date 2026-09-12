<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 7 results: Description, broad and metadata revisions and the audit

**Date:** 2026-09-12. **Outcome:** iteration scope implemented; acceptance remains subject to the workflow checks. The retained session now takes the description path without compiler work, preserves metadata-only updates, applies broad invalidation for membership, configuration, dependency, shim and area changes, and audits both valid and acquisition-invalid revisions. All eleven I5-07 instances execute over isolated reference copies with independent assertions, session audits and complete batch comparisons. Worker hosting and contexts integration remain iterations 8 and 9.

## Scope and contracts

All work was performed in `/tmp/worktrees/ramify-67e9dd0f/iteration-5-fast-incremental-checks`, on its workflow branch. Changes are confined to analysis source, same-owner tests and the reference harness. The existing control-plane change to `iterations/status.md` was not edited. No model rules, dependency-owner source, public session shapes, declarations, package entries, CLI or daemon source changed. Iteration 7 activates no additional declaration lines.

The existing `SessionRevision` has no `cause` field and `SessionStatus` has no `lastValid` field. Audit repair returns its new revision through `VerifyOutcome.status: 'mismatch'`; iteration 9 uses that provenance for `ContextRevision.cause: 'verify'`. Historical valid report projections remain available by sequence while invalid revisions are current. No new public fields were invented to anticipate contexts.

## Implementation

- **Description:** local description edits relink against the retained catalog and rebuild the model. Only accesses whose importer or selected original owner belongs to a changed module's subtree are decided again; unrelated decision objects and all per-file compiler facts are retained. The checked file list is empty because no file was described or re-interpreted. Compiler, description and extraction timings are zero. Description-statement position changes refresh their decision evidence. Combined source/description edits use the source path, force relinking and combine both decision dependency sets.
- **Metadata:** README edits replace the inventory's purpose metadata while retaining catalog, model, linked descriptions, accesses and decisions. Compiler, description, access, link and decision timings are zero.
- **Broad:** created/deleted owned files, configuration, dependency, recorded declaration-shim, source-area and changed unknown events describe and interpret every owned file and decide all accesses. Membership is compared against the last valid inventory, so structural changes also supply created/deleted names. Membership update precedes whole invalidation. Configuration and dependency updates retain the compiler; changed source areas still require rebuilding the adapter because its reviewed port fixes areas at creation. Resolution-bounded membership narrowing remains deferred.
- **Invalid and recovery:** an invalid local description is acquired through the existing project port to obtain the same invalid inventory, diagnostics and envelope as batch. Its revision carries sealed observed inputs and an identity derived from those inputs; its unchanged batch report retains null `inputId`. Current invalid reports contain no stale access/results list. After an invalid acquisition or other failed update, reconciliation passes through the observer's configuration boundary before using inventory again. Source-only and README-only updates therefore remain invalid until the description is corrected; recovery includes changes made during the invalid period.
- **Publication and failures:** facts and history are committed only after observation promotion, report-size admission and retained-fact admission succeed. Incomplete extraction, promotion failure and either size limit return unpublished `reported` outcomes with the previous revision, facts and historical projections intact. A comparison of actual file-read hashes across promotion rejects conflicting observed content as `changed-input`; the next update reconciles broadly. Cancellation marks partially advanced state stale.
- **Audit:** valid revisions recompute descriptions, access facts, model and decisions from the warm compiler. Comparison includes registry, inventory, areas, per-file facts and dependencies, catalog, link results, model, decisions and indexes, explicitly naming differing `original.declarations` evidence inside decisions. Invalid revisions undergo a fresh invalid acquisition comparison instead of treating absence of compiler facts as an automatic equal result. A mismatch publishes the recomputed facts as a new broad revision; the next audit is equal. Audit promotion and publication share the cancellation/error boundary.

## I5-07 evidence

All rows are session evidence over W/R. The harness compares the current projection captured before any possible audit repair with `analyzeProject` on the same disk state, replacing only `runId`. It verifies real compiler-child disposal and release of session/observer/history resources.

| Instance | Independent expectation established |
| --- | --- |
| description-relink-subtree | W2 removal takes description, re-decides exactly subtree-dependent access IDs, leaves unrelated decisions retained and denies the root's unchanged `createCatalogRouter` import with `not-visible`. No compiler or extraction work. |
| description-revert | Restoring W2 removes exactly that denial; batch projection and audit agree. |
| readme-metadata-only | Empty checked set, zero compiler/link/decision work and the new workspace purpose paragraph in the projection. |
| created-importing-file | New catalog file and allowed vocabulary access; every owned file checked on broad; no finding. |
| deleted-file | Deleted file leaves inventory/catalog/accesses/coverage. An additional denied import provides a real finding whose identity is removed on deletion. |
| configuration-broad | New paths entry causes whole re-extraction; the compiler PID is unchanged; all report fields including input identity equal batch. |
| dependency-broad | An isolated copy of the Zod declaration is edited; its new observed hash appears in the revision and broad results equal batch. |
| invalid-description-current | Dropping W2's from clause publishes parse diagnostics and current invalid inputs; the prior valid projection is preserved. |
| invalid-recovery | Correcting the description publishes completed baseline findings with no added finding. |
| audit-equal-sequence | All twelve prescribed reference edits independently assert their expected outcome and report equality; every audit is equal. The focused sequence executed 98 assertions. |
| audit-detects-drift | Injected access corruption is named as `files[path].accesses`; verify publishes sequence + 1, restores correct facts and then reports equal. |

The focused eleven-handler run passed 313 assertions. Registration now includes 53 handlers across iterations 2–7. A harness-only loader captures private state at the real `openRetainedSession` factory using one unique module URL and an exactly-once anchor; it deregisters and removes its capture symbol in `finally`. It supplies actual decision replacement, compiler PID and injected-drift evidence without adding a production testing API.

Same-owner tests add a smaller twelve-step sequence and boundary cases for description positions, mixed changes, owned CSS shims, changed unknown events, header tags, invalid-period source/README edits, extraction/promotion failures, retained-fact and report limits, conflicting promoted reads, cancellation during audit promotion, and injected decision declaration-position corruption.

## Verification

**`npm run reference:verify -- --plan 5 --iteration 7` passes on the final implementation:** required 53, passed 53, failed 0, not executed 50. Required iterations are 1–7; all eleven I5-07 rows passed. The remaining 50 instances are future iterations, so Plan 5 is not complete. Portable evidence: `.reference-work/reports/plan5-iteration7-c8c22eda-9932-4bd6-973d-f6e1f3c4babe.json`.

| Command | Result |
| --- | --- |
| `npm run worktree:prepare` | Example and site dependencies provisioned from this checkout's lockfiles. |
| `npm run build && npm run type-check` | Pass; all four compiler scopes. |
| `npx vitest run subs/analysis/src/tests/session-revision.test.ts subs/analysis/src/tests/session-audit.test.ts subs/analysis/src/tests/retained-session.test.ts` | 31 tests pass: 16 revision, 5 audit and 10 retained-session tests. |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/plan5.test.ts` | 10 registration/gate tests pass. |
| `npm run check:reference` with an owned endpoint | Resident path: 15 owners, 54 source files, 294 accesses, 0 errors, 2 expected warnings, complete coverage. |
| `npm run check:self` with an owned endpoint | Resident path: 11 owners, 250 source files, 3,231 accesses, no findings or analysis limits, complete coverage. |
| Owned daemon stop and `git diff --check` | Pass; each project-check endpoint was cleaned after explicit stop. |
| Full `npm test`, Cucumber regression and scenario/seal checks | Not run locally, as required by the supplied automatic-check policy. Their automatic verdict is separate from this evidence. |

The unfiltered Plan 5 completion gate was not claimed or run. Hosting, contexts, hook CLI, live-equivalence and measurement capabilities remain scheduled later.

## Failures found and resolved

Initial focused tests exposed three incorrect test expectations (description comment spelling, the separate type-import access count and the audit's detailed declaration field); corrected expectations then passed. The first ad-hoc harness invocation used CommonJS through `tsx --eval`, which duplicated the ESM compiler evidence module; the ESM runner executed all eleven handlers successfully and no compiler children survived the abandoned probe.

The first toolkit check reported a namespace-escape coverage note from a test's namespace spy. The helper now uses a delegating Vitest factory mock with capture enabled only during cold open; the final toolkit check has complete coverage. Review identified the owned-shim trigger, audit-promotion cancellation and invalid-period recovery defects described above; each has a passing focused regression. An initial prerequisite-gate process was stopped after the final recovery correction, and its owned descendants were confirmed stopped; only the subsequent complete run is acceptance evidence.

## Recommendations for Next Iteration

- **Project observation provider gap:** `ProjectObserver.apply` currently discards the changed-path list returned by its private promotion step. The analysis guard added here protects already byte-captured reads and wholly new byte-read inputs. It cannot establish coherence for directory membership, existence/realpath probes, or reads of paths previously captured only as probes/absences, because `observer.inputs` hides pending byte hashes behind those captured entries. Correct the provider's disagreement propagation before accepting concurrent live-equivalence/freshness evidence. This iteration changes no project-owner source and claims no concurrent-writer proof for those cases.
- Iteration 8 owns worker hosting, accounting, sweep scheduling and deadlines. Measure the observer getter/promotion cost before hook budgets become binding; this iteration prioritizes correct publication and adds no performance claim.
- Area changes continue to rebuild the adapter because `SourceChangeSet` cannot replace its source areas. Keep this explicit when recording broad-path compiler costs; any provider contract change needs the contract review process.
- Iteration 9 owns last-valid context status, verify causes/counters, compact history and eviction. Use exact historical sequences and release their facts through the existing handle.
- Keep membership narrowing and proportional model relinking deferred under their existing triggers; no persistent cache, syntactic filter or alternate checker was introduced.

## Files

Source: `subs/analysis/src/{retained-session,session-revision,session-facts,session-audit}.ts`.
Tests: `subs/analysis/src/tests/{session-revision.test,session-audit.test,session-test-fixture}.ts`.
Harness: `scripts/reference-harness/{plan5-session-revision-cases,plan5-session-inspection,plan5-runtime,plan5.test}.ts` and its README.
