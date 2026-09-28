# Iteration 3 results: consumer consultation and scoped cooperation

**Status:** implemented and locally verified in the isolated execution worktree. Changes are uncommitted for review. Capability acceptance, production rollout, recovery and final audit remain later iterations.

## Baseline and ownership

- Started from clean committed handoff `56ed4f39f8dc7b7fb6d8d5dc8fa1ac3d1f3f5724` in `/tmp/ramify-plan16-capability-architect`. The unrelated `/ramify` checkout was not edited.
- Read the iteration 1 and 2 results and the Plan 16 contracts. The generated `subs/harness/src/.ramify/{external,children}` views were absent before new imports were considered. This change stays within the harness owner and its existing agent port; the Pi change is a test of its current port behavior, with no new child API.

## Implemented behavior

- `consult-consumer` commits an immutable pending exchange before invoking the preserved A-engineer session with read-only equipment. Its answer commits a second exchange revision and returns to the same capability architect. A missing session is explicitly reconstructed from the current request and plan with a replacement/degradation record. A consultation has no writer or source mutation tool.
- `assign` captures an ordinary write scope from the real architect view for B, A or an affected existing owner. Direct children may be selected explicitly; an unselected child's internals remain outside the scope. The task issues one sequence across owners, distinct from B's deferred entry sequence. The A experiment continues its retained engineer session when available. Every assignment uses the existing engineer equipment, real write guard, writer lease and settlement path. Its starting candidate tree, actual changed paths, outside-scope paths and ending tree are recorded. The original A provisional edits remain in the candidate but are excluded from later writers' mutation sets.
- The capability architect can request wider placement/unresolved decisions and receives their result in its same session. Routine A-side decisions and compatibility assignments stay with the capability architect; B's ordinary entry remains deferred.
- Added read-only evidence lookup, plan revision and action prevalidation tools. Plan changes use immutable revisions and a current-basis check. Preview and final submission use the same action validator; a stale final submission gets field feedback and the session continues.
- Assignment results remain **provisional** (`partial` when the writer submitted in scope). Iteration 4 must run and record the combined candidate gate and review before marking assignments accepted or allowing handback. A failed/out-of-scope writer is recorded as failed. No provisional result is presented as accepted evidence.

## Executed evidence

| Check | Result | Limit |
| --- | --- | --- |
| Real service cooperation and nearby regression: `npx vitest run subs/harness/src/tests/capability-consultation.test.ts subs/harness/src/tests/capability-assignments.test.ts subs/harness/src/tests/capability-delegation.test.ts subs/harness/src/tests/capability-records.test.ts subs/harness/src/tests/capability-submission.test.ts subs/harness/src/tests/capability-state.test.ts subs/harness/src/tests/write-guard.test.ts subs/harness/src/tests/work-items.test.ts subs/harness/src/tests/run-protocol-materialization.integration.test.ts subs/harness/subs/agent/subs/pi/src/tests/session-modes.test.ts subs/harness/subs/agent/subs/pi/src/tests/guard-installed.test.ts` | 11 files, 56 tests passed | Scripted agents and real fixture Git trees; no live model judgment or combined capability gate. |
| `npm run type-check` | Passed | Agent, web and script TypeScript scopes. |
| `npm run check:self` | Passed: 0 errors, 0 warnings, 312 analysis limits across 12 owners; coverage partial | The reported analysis limits remain. |
| `git diff --check` | Passed | Tracked changes; new test and report files were separately scanned for trailing whitespace. |

The real service fixture retains A's edited caller, untracked file and failing test. Its recorded A scope test fails before delegation. B's attempted write to A is denied by the real guard and leaves A unchanged. B, D, P and A then receive `cap-001.i01` through `cap-001.i04`, with separate actual mutation sets; P's selected B child subtree permits its change there. Five writer acquisitions alternate with five confirmed releases, including the original A writer. The offline scripted Pi adapter confirms that a continued session loses `edit`/`write` during consultation and regains them for a later assigned experiment. A second service case returns a wider boundary decision from the global fork to the same capability architect without recalling A's local architect.

A first service run exposed a coordinator authority mismatch: the selected action's invocation had not yet become the state machine's active coordinator. That transition was added before dispatch. Test assertions then exposed a stale stop version, an unchanged P fixture write, and a cached list of architect starts; each test was corrected and the final runs above passed. One intermediate focused run timed out on that cached list; it was rerun after correction.

## Iteration 4 handoff

Use the live multi-owner candidate and `capability-assignment-settled` events (`mutated`, `outsideScope`, `endingTree`) together with each immutable assignment's `startingTree`. The original A failing scope-test observation and provisional snapshot remain attached to the originating invocation/request. Add the combined gate and owner-spanning review, then promote provisional task assignments to accepted only on current real-provider/consumer evidence. The reducer currently treats `partial` as unfinished, so iteration 4 needs a deliberate acceptance transition or equivalent checkpoint before `request-handback` can verify. Keep the original A assignment open for final continuation; its latest session point may be after consultation or an A-scoped experiment. Iteration 5 owns durable reconstruction across a process restart.
