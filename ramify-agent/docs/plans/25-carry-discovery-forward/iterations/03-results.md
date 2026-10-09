# Iteration 3 results: discovery delivery

**Status:** implemented; focused checks passed; coordinator source review accepted.
**Date:** 2026-10-09.
**Source commit:** `71b084fd0b8c8a9983b3854b0de3c2ac433262b9`.
**Base:** iteration 2 receipt `f12396e5891d4610b40825f8a949605583053c80`,
with accepted source `83ab0d59753c25c5d269b122a2ecb2d706c42f30`.
**Branch:** `feat/plan25-carry-discovery-forward`.
**Worktree:** `/home/app/ramify-plan25-carry-discovery-forward`.

## Delivered behavior

`work/starting-inputs.ts` renders one `support:starting-points` section. Exact
path/note pairs coalesce in deterministic declaration order and retain every
distinct harness origin. Origins identify producer, work item, iteration,
invocation, recorded source boundary and capability task when available. Notes
remain producer judgments and navigation help; the section explicitly asks the
consumer to inspect current source and explore beyond stale hints.

Ordinary and capability engineers receive their exact assignment's discoveries.
Local architects receive the last engineer result through their existing result
delivery, including an explicit partial label. Capability coordinators receive
results belonging to their own task, with each assignment sequence and origin
retained. No consultation, contract or qualification submission protocol changed.

Code, scope and design reviewers receive only their bound assignment and the
matching result for their exact gate/candidate. When the closing result is not
available, the matching passing gate identifies its `proposedBy` invocation;
the retained engineer submission must match its recorded hash and assignment.
Hints resolve against the already opened candidate snapshot and existing source
policy. Missing paths, generated views, run records, symlinks and inaccessible
entries are omitted without filesystem probes or task failures. Workspace paths
are rooted for the existing module/selector cwd convention; newly delivered
snapshot hints stay project-relative. Current review-diff delivery and its
committed base behavior remain intact.

Fresh selectors and fresh local architects reuse available authenticated
orientation submissions through the named section. Retained orientation sessions
and selector forks already contain the exploration and receive no repeated list
just for changing phase. Fresh reconstructed architect sessions retain their
explicit orientation section on subsequent turns. Fresh selector rendering omits
pointers from the displayed orientation packet when it has the typed submission,
so the shared section supplies them once. Historical packets and hashes remain
immutable. A usable legacy packet still supplies its accepted orientation when
the optional typed submission is unavailable; a missing packet takes the ordinary
fresh path and may still use available structured discoveries.

All additions use iteration 1's named sections and occurrence selection.
Replacement, withdrawal, reintroduction, exact-point forks and immutable retries
remain session-layer behavior. No second discovery cache, revision algorithm,
filesystem completeness check, semantic hint finding or transcript/prose mining
was added. Read/write, tool, obligation and completion authority remain bound to
the current task.

## Acceptance witnesses

The new `plan25-discovery-delivery.test.ts` contains 13 configured ordinary Node
cases. It captures actual task packets and operates real harness sessions with
scripted provider/Git/candidate answers. The shared capability regression adds
actual engineer and coordinator delivery assertions.

| Cases | Witness and expected outcome |
| --- | --- |
| D4 | Actual engineer packets contain implementation, owned-test, support/configuration and unchanged-caller assignment pointers once, with the issuing invocation and recorded boundary. |
| D5 | Three accepted iterations and nine actual code/scope/design reviews retain distinct candidate/result pointers. Exact duplicate caller pairs retain both producer origins. An ordinary partial result and a capability partial result return labeled navigation help to their responsible architects. |
| D6, I03 | Actual retained, no-point, missing-packet, lost-parent and legacy orientation flows preserve ordinary inputs. Fresh consumers get available structured pointers once; retained consumers omit repeated lists. A valid legacy packet with missing optional submission retains its accepted focus and understanding. Existing context-selection startup-loss and legacy block/session controls pass. |
| D7, I01 | Actual session starts execute A → B → A and A → withdrawal → A with unchanged goal/requirements, followed by unchanged turns. Each change is delivered once; following unchanged turns append no reusable block. A's equal content hashes have distinct ordered occurrence identities. Physical manifest hashes match delivered text and the role prefix remains stable. |
| I02 | Actual old-point selector and reviewer forks inherit that point's state, preserve current role/tool/cwd/validator/destination, and receive explicit current discoveries. Later parent candidate/pointer changes and sibling discoveries do not enter inherited state. |
| I04 | Named discovery appends execute A → B → A, survive restart and replay once at accepted points. Original-task restore retains exact packet bytes despite changed discoveries; a conflicting non-restore request is refused. Prepared and provider failures with no reusable point establish no inherited discovery delivery; a subsequent fresh task supplies complete current blocks. |
| D11 | Captured snapshot entry/directory controls preserve readable files and directories while omitting missing/deleted, symlink, generated and run hints. Actual reviewer packets contain no absolute workspace hints or omitted hint notes; stale workspace hints remain explicitly unverified navigation help. |

## Checks and evidence

Commands ran from `ramify-agent/`. Evidence is under
`/home/app/ramify-plan25-evidence/`. All `iteration03-*.log` files are bounded
below 64 KiB. The complete ownership-check output is retained in
`iteration03-raw/`; `iteration03-log-bounds.json` records its bytes and SHA-256.

| Check | Outcome and evidence |
| --- | --- |
| Required five selectors plus affected review-diff, three-review-question, block-session and capability-assignment regressions | Passed: 9 files, 115 tests; `iteration03-final-tests.log`. Includes every required selector; its exact command appears in the log. |
| Final discovery-only controls | Passed: 13 tests; `iteration03-final-delivery-tests.log`. The final combined run also includes these same cases. |
| `npm run type-check` | Passed across project, web, scripts and browser-acceptance compiler scopes; `iteration03-final-typecheck.log`. |
| `npm run check:self` | Passed: 12 owners, 699 source files, 50 resources, 13,676 accesses; 0 errors/warnings and 328 nonblocking analysis limits; `iteration03-final-check-self.log`. |
| Configured discovery | `vitest list --filesOnly --json`; `iteration03-configured-discovery.json`. All nine selected files were confirmed in the configured ordinary Node project. |
| Process guard | Exact final test window: 9 per-file receipts, zero allowed launches and zero refused attempts; `iteration03-process-guard.json`. No native exemption was added. |
| Source review and `git diff --check` | Passed; coordinator accepted the final consumer source contingent on these completed checks. |

Development failures were corrected before the final passing run. Early fixture
errors involved package shapes, current snapshot identity and nonexistent helper
methods; their logs are retained. The retained-orientation control also caught a
source comparison between a logical session ID and an invocation session
descriptor, which unnecessarily repeated pointers; it now compares the recorded
startup session ID. The capability fixture waited for its next coordinator turn
before asserting delivery. The broader selection found a pre-iteration-1 review
assertion expecting unframed inherited package bytes; it now expects the existing
invariant work-item-package framing. The new all-review-role fixture initially
counted a design orientation as a review and now checks the actual submission
tool. No failure was labeled passing or treated as a flake.

The initial required-selection log was overwritten after a bookkeeping command
used unavailable `python` instead of `python3`; its original failure output
remains in the tool transcript, and `iteration03-required-tests-initial-summary.json`
retains the two exact failing cases and their corrections. Other development
failure logs remain intact. This summary is not a claim to retain the lost full
log.

No direct whole suite, configured audit, native/live provider or performance run
was performed. Final integrated qualification remains iteration 5's gate. This
receipt does not establish provider cache hits, latency or cost improvement.

## Iteration 4 handoff

- Reuse `StartingPointGroup` and `startingPointsSection` for NFR delivery. Supply
  the already captured snapshot and `nonfunctionalSourceAllows` with the task's
  declared read scope; absence returns no optional section.
- Existing service helpers derive assignment/orientation/result producer origins
  from committed records and retained submissions. NFR needs its planned
  whole-run grouping and comparisons; this iteration adds no NFR wiring.
- Use the same `support:starting-points` key for replacement and withdrawal.
  Supply sections or omit the optional section; session operations own revision
  selection, structural removal and immutable retries.
- Required ordinary and capability consumers retain current review-diff delivery.
  Historical comparison and NFR source tools remain iteration 4's write scope.

All source work stayed on the committed isolated base. No writes were made to
`/ramify`; its independently changing uncommitted edits were neither copied nor
incorporated. This records absence of writes there, not unchanged bytes in that
concurrent checkout. No merge, push or publication occurred.
