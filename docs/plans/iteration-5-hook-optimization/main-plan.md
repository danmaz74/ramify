# Plan 5 hook optimization

**Date:** 2026-09-13. **Status:** draft. This plan implements the ranked
targets of the [optimization analysis](../../analysis/fast-incremental-checks-optimization.md#ranked-targets)
that need no prior measurement: 0, 1, 2, 3, 4, 5 and 7. It adds no capability
and no owner. [Plan 5](../iteration-5-fast-incremental-checks/main-plan.md)
contracts and the [contract remediation](../iteration-5-contract-remediation/main-plan.md)
remain authoritative except where a resolved decision below clarifies them.

## Workflow and completion boundary

An agent writes a file and its post-write hook runs
`ramify check --changed <path>` against a warm resident context, usually racing
the watcher's update for the same write. The hook is the primary use case,
optimized for latency and for the context its reply occupies.

After this plan:

- a revision no longer rebuilds the observed-input list on each access;
- publication builds only what the revision keeps, and a full report is built
  from retained facts when requested;
- a known context and an unchanged invocation reuse project-root resolution;
- a queued hook covered by the revision that just published is answered from it;
- the client derives its endpoint without hashing every runtime file, and the
  compiled client refuses a build it was not compiled from;
- macOS worker supervision does not spawn a process per worker message;
- timing fields show the work outside `revision.timings.total`.

Every published result still equals batch. The plan is complete when every
matrix row passes under owner tests, type-check and the commit audit.
Real-process measurement follows the plan, see [Deferrals](#deferrals).

## Evidence

The analysis locates the costs, with source lines at `85be06c`; `8236a00`
changes no source. Racing hook medians exceed the 2 s
[acceptable-time budget](../../architecture/memory-lifecycle.md#two-kinds-of-budget)
in nine of fourteen rows. The fixed costs every row pays:

| Cost | Reference | S100 | Target |
| --- | ---: | ---: | ---: |
| Observed-input list rebuilt seven times per revision | 290 to 340 ms | 160 to 185 ms | 1 |
| Publication `finish()` size walks and deep copy | 96 to 110 ms | 552 to 588 ms | 2 |
| Project-root resolution per open and per update | 110 to 120 ms | 323 to 339 ms | 3 |
| Racing hook's second update | 413 ms | 489 ms | 4 |
| Client build-key hashing, Node entry; about 9 ms in the compiled client | 26 to 34 ms | 23 to 30 ms | 5 |

## Resolved decisions

1. **Budgets.** The hook's 2 s end-to-end median is the only acceptable-time
   budget; every other figure is an ideal optimization budget. Memory requires
   only that no retained cache leaks: an entry leaves with what it describes.
2. **Byte-identical results.** Input order, `inputId`, revision identities,
   reports and replies stay byte-identical to the current build for the same
   inputs. Existing session-equals-batch tests remain the exactness gate.
3. **Hook publication (target 2).** Publication builds `outcome`, `summary`,
   `diagnostics`, `warnings` and `coverage`, and applies `maxReportBytes` to
   those. The full report with its snapshot is built from retained facts only
   when requested (`--format json`, batch, report scope, later `inspect`), and
   its size limit applies there. A hook can therefore pass while a full report
   for the same revision would exceed `maxReportBytes`; the receiver of the
   full report still gets the resource-limit failure. Iteration 3 records this
   in [daemon and analysis](../../architecture/daemon.md).
4. **Racing hooks (target 4).** The covering rule is evaluated when a request
   arrives and again when each revision publishes. A queued request whose
   expectations the new revision covers, with no other known change or
   required sweep pending, is answered from that revision without another
   update. Iteration 5 writes that sentence into the covering rule in
   [daemon and analysis](../../architecture/daemon.md#fast-incremental-checks).
   Attaching a request to the running update on arrival is rejected.
5. **Root resolution (target 3).** The worker skips its invocation check when
   the invocation equals the session's. The daemon reuses a known context's
   resolution while the configuration dependencies its observer holds are
   unchanged. A configuration or discovery-input change resolves again.
6. **Build key (target 5).** The build writes the runtime identity; both
   clients read it instead of hashing every runtime file. A mixed or incomplete
   build still fails endpoint selection, including after `npm pack` and
   installation. The [compiled client](../../architecture/optimization.md#native-client)
   landed separately in `b6275fc`, and iteration 6 starts by merging it. The
   build embeds the identity into the executable it compiles. The compiled
   client refuses an identity that differs from its embedded one as
   `incompatible`, exit 2, before it reads a daemon record or starts a daemon.
   The Node entry has no embedded identity and is unaffected. The identity file
   is plain JSON readable by any client.
7. **No live runs in iterations.** Iterations run owner tests, type-check and
   the commit audit, never `npm run measure:*` or the full suite.

## Owners

No owner, exposure line or package entry is added.

| Iteration | Owners | Main source |
| --- | --- | --- |
| 1 | `analysis`, `daemon/contexts`, `daemon` | `session-engine.ts`, `session-revision.ts`, `context-manager.ts`, `filesystem-watcher.ts` |
| 2 | `analysis/project`, `analysis` | `capture.ts`, `data.ts`, `observer.ts`, `session-revision.ts`, `session-engine.ts` |
| 3 | `analysis`, `cli` if a consumer needs it | `report.ts`, `session-engine.ts`, `docs/architecture/daemon.md` |
| 4 | `analysis/project`, `analysis`, `daemon/contexts` | `resolve-root.ts`, `session-engine.ts`, `context-manager.ts` |
| 5 | `daemon/contexts` | `context-manager.ts`, `tokens.ts`, `docs/architecture/daemon.md` |
| 6 | `daemon`, root, root build scripts | `discovery.ts`, `compiled-entry.ts`, `scripts/build-production.ts`, `scripts/compiled-client.ts` |
| 7 | `analysis` | `session-processes.ts` |

## Acceptance matrix

| ID | Case | Evidence | Iteration |
| --- | --- | --- | --- |
| HO-1 | `timing-fields`: revision and reply timings carry invocation check, worker status, worker transport, client transport and daemon publication durations | unit | 1 |
| HO-2 | `watcher-timestamps`: a watcher batch records event receipt and batch flush times reachable from the update it triggers | unit | 1 |
| HO-3 | `input-list-cached`: repeated `inputs` and `inputId` reads without mutation return the cached list without re-hashing | unit | 2 |
| HO-4 | `input-list-invalidated`: every mutation kind advances the version, and the result equals a fresh rebuild byte for byte | unit | 2 |
| HO-5 | `input-cache-no-leak`: forgotten observations leave no cached entry | unit | 2 |
| HO-6 | `byte-order-equivalent`: the non-allocating comparator orders every tested string pair as `Buffer.compare` does, including non-ASCII and surrogate pairs | unit | 2 |
| HO-7 | `publication-without-snapshot`: publication does not build or copy the snapshot, and revision fields equal the current build's | unit | 3 |
| HO-8 | `full-report-on-request`: `--format json`, report scope and batch output are unchanged, and their size limit still fails over `maxReportBytes` | unit | 3 |
| HO-9 | `hook-passes-under-limit`: a hook check passes when only the full report would exceed `maxReportBytes` | unit | 3 |
| HO-10 | `invocation-check-reused`: an update with the session's invocation performs no root resolution | unit | 4 |
| HO-11 | `root-resolution-reused`: reopening a known context performs no root resolution while its configuration dependencies are unchanged | unit | 4 |
| HO-12 | `root-resolution-invalidated`: a changed configuration or discovery input resolves again and rejects a moved root | unit | 4 |
| HO-13 | `covered-on-publication`: a request queued during a running update whose expectations the published revision covers is answered with no second update | unit | 5 |
| HO-14 | `uncovered-after-publication`: a queued request with a differing expectation, another pending change or a required sweep still runs an update | unit | 5 |
| HO-15 | `advance-before-publish`: the window between the session advancing and the context publishing neither refuses nor misanswers a covered request | unit | 5 |
| HO-16 | `fingerprint-order`: `createFingerprints` output is unchanged with a non-serializing comparator | unit | 5 |
| HO-17 | `build-identity-read`: endpoint selection reads the build-time identity and yields the same build key as hashing | unit | 6 |
| HO-18 | `mixed-build-detected`: a changed, missing or added runtime file after the build fails endpoint selection | unit | 6 |
| HO-21 | `compiled-identity-bound`: a compiled client beside a `dist` with a different runtime identity exits 2 as `incompatible`, leaving the endpoint directory empty and starting no daemon; a matching one checks normally | process | 6 |
| HO-22 | `installed-identity`: a packed and installed build derives the same key as hashing, and a changed runtime file there still fails selection | unit | 6 |
| HO-19 | `rss-sampling`: macOS sampling spawns no process per worker message and still enforces the RSS limit | unit | 7 |
| HO-20 | `docs-updated`: the analysis marks each delivered target and links the results | review | 7 |

## Iterations

Iterations run in sequence in one worktree; each is one subagent.

| Iteration | Title | Prerequisites |
| --- | --- | --- |
| [1](iterations/iteration1.md) | Timing fields and watcher timestamps | none |
| [2](iterations/iteration2.md) | Maintain the observed-input list | 1 |
| [3](iterations/iteration3.md) | Build only what a hook publishes | 2 |
| [4](iterations/iteration4.md) | Reuse project-root resolution | 1 |
| [5](iterations/iteration5.md) | Answer queued racing hooks on publication | 1, 4 |
| [6](iterations/iteration6.md) | Build-time runtime identity | `b6275fc` merged |
| [7](iterations/iteration7.md) | macOS RSS sampling and plan closure | 1 to 6 |

## Verification policy

Each iteration runs its owners' test directories with `npx vitest run <dir>`,
`npm run type-check` and `git diff --check`, never `npm test` or the full suite
by hand, and never a command that stops every Node process. Full verification
is the cucumber-viz commit audit on the worktree after each iteration's commit;
failures are fixed before the next iteration starts.

## Deferrals

| Deferred | Reason |
| --- | --- |
| Target 6, watcher latency | Batching and debounce values change only after target 0's timestamps show the split. |
| Real-process measurement | Reference and S100 focused runs, then S500, S1000 and macOS, follow this plan against the 2 s budget. |
| Sweep re-hashing only moved files | The later step of target 1; after the cached list lands. |
| Node compile cache, `factBytes` | See the analysis's smaller items. The native client landed separately as the [compiled client](../../architecture/optimization.md#native-client). |
| Repeated deletion revision | Closed. It did not recur in the measurement, the membership path replaced deletion handling, and its [plan](../iteration-5-repeated-deletions/main-plan.md) is withdrawn. |
| Resolution-bounded narrowing | Indicated for created and deleted files; a separate plan. |

## Handoff

Iteration 7 writes `iterations/closure.md`: delivered targets, contract
clarifications, test evidence per matrix row, audit results and remaining gaps.
The measurement successor uses target 0's fields to attribute each hook row.
