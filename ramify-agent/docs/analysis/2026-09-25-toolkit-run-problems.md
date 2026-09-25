# Problems found running ramify-agent on the Ramify toolkit

**Date:** 2026-09-24 (runs) and 2026-09-25 (this record).
**Evidence:** the records named below are copied into
[2026-09-25-toolkit-run-problems/](2026-09-25-toolkit-run-problems/). The
complete run records lived in temporary directories under `/tmp` and are not
kept.

This was the first real run of the harness on a project other than the
`collection-review` fixture: the Ramify toolkit itself. The plan was
`plans/self-explaining-denials/plan.md`, a cut-down Plan 2E with no
pre-planned iterations. The model was `openai-codex/gpt-6-sol:high` on pi
0.87.1. The goal was to see the harness delegate across several modules.

It did delegate across modules before it stopped:
- two placement decisions;
- a contract between `ramify/cli` and `ramify/analysis`;
- a work item created in `ramify/analysis` from that contract's obligation;
- five committed iterations, plus the commit of the plan's feature files;
- nine scenarios bound and passing against the contract's fake;
- six reviews, which opened seven CheckFindings.

The run then failed, and the `ramify/analysis` work never started. Four runs
were needed to get that far. This document lists every problem found, with its
evidence and its status.

## The runs

| Run | Project | Ended | At | Why |
| --- | --- | --- | --- | --- |
| `20260924T213446Z-84a63c` | worktree | failed | readiness, nested packages | [H1](#h1-readiness-requires-every-nested-package-to-be-installed) |
| `20260924T213823Z-c0f512` | worktree | stopped | readiness, Ramify check | [H2](#h2-the-command-output-cap-was-smaller-than-a-ramify-report) |
| `20260924T214637Z-53bc9b` | worktree | failed (`internal`) | first commit after readiness | [H3](#h3-the-run-branch-name-collides-with-an-existing-branch) |
| `20260924T215457Z-2ff23b` | clone | failed (`unresolvable-requirement`) | after 49.5 min, event 193 | [H6](#h6-no-assignment-can-write-a-file-outside-every-module), [H7](#h7-one-unresolvable-requirement-ends-the-whole-run), [P1](#p1-the-plan-required-a-change-no-assignment-could-make) |

The first three runs used the git worktree
`/tmp/ramify-run-self-explaining-denials`; run 4 used the clone
`/tmp/ramify-run-sed`. Both were on branch `run/self-explaining-denials`,
setup commit `e64f9015`:
- `ramify-agent/` was removed, so that the harness would not test it as a
  nested package;
- the plan was added;
- Cucumber was added, with a World and hooks in `src/tests/support/`;
- `ramify-agent.json` was added.

Each run's event timeline is in `run-<id>-events.txt`, and its decisive events
with their data are in `run-<id>-outcomes.txt`.

Run 4 used 10.86 M tokens, most of them cache reads:

| Role | Invocations | Tokens |
| --- | ---: | ---: |
| engineer | 6 | 2,842,551 |
| reviewer | 8 | 2,410,063 |
| local architect | 9 | 2,020,175 |
| contract engineer | 1 | 1,685,928 |
| global architect fork | 4 | 1,453,203 |
| initial architect | 1 | 448,209 |

The review count includes the orientation step that design reviews fork from.

## Summary

| ID | Problem | Status |
| --- | --- | --- |
| **Harness** | | |
| H1 | Readiness requires every nested package to be installed, even one it never tests | fixed, `2f0ca760` |
| H2 | The command output cap was smaller than a Ramify report | fixed, `193fc421` |
| H3 | The run branch name collides with an existing branch, and the failure surfaces only at the first commit | fixed, `2f0ca760` |
| H4 | A type error in the engineer's own file is attributed outside the assignment | fixed, `2f0ca760` |
| H5 | The local architect had contract files edited without authorizing them | fixed, `87be40c4` |
| H6 | No assignment can write a file outside every module | fixed, `87be40c4` |
| H7 | One unresolvable requirement ends the whole run | fixed, `08bcfdb2` |
| H8 | The local architect's API view could not be materialized | fixed, `84ab8fcb` |
| H9 | The hook identifies a finding by code and message and ignores Ramify's `id` | fixed, `345f30fc` |
| H10 | The hook says nothing when a description error removes import findings | fixed, `345f30fc` |
| H11 | Engineers never see warnings or analysis limits | fixed, `345f30fc` |
| H12 | The scripted fake agent's analysis lacks the required scenario lists | fixed, `345f30fc` |
| **Web client** | | |
| W1 | Cards and edges disappear while panning | fixed, `8c1397ed` |
| W2 | The view jumps back to the selected card | fixed, `8c1397ed` |
| W3 | Dragging on a card does not pan, and releasing selects it | fixed, `8c1397ed` |
| W4 | Gate cards show internal tokens and ambiguous text | fixed, `8c1397ed` |
| W5 | The expand button covers card text; transcript windows jump 8 px | fixed, `8c1397ed` |
| W6 | Capability cards, the All gates list, collapse, initial fit and gate progress | fixed, `5ac6bc1c` |
| **Ramify toolkit** | | |
| R1 | A complete JSON report is 25 MB, of which the harness needs a few kB | fixed, `107883fa` |
| R2 | Import denial messages are keys, and the hook form drops their explanation | open, the plan's subject |
| R3 | `testing-origin` prints one path twice; the hook form's warning says "1 files" | open, in the plan |
| **Plan authoring** | | |
| P1 | The plan required a change no assignment could make | resolved by H6 |
| P2 | A scenario's wording produced an assertion that cannot fail | fixed in the plan |
| **Environment and process** | | |
| E1 | The main checkout's ramify-agent dependencies were stale | fixed |
| E2 | The toolkit build `/ramify/dist` is stale | fixed, rebuilt |
| E3 | pi 0.87.1 changed how system messages reach the adapter | fixed, `20db7eb9` |
| E4 | No audit has run since `20db7eb9`, `193fc421` and `8c1397ed` | open |

## Harness

### H1. Readiness requires every nested package to be installed

**What happened.** Run 1 failed readiness before any work:

> Readiness attempt 1 failed at nested-packages; its recoveries are spent: 3
> independent nested packages: examples/collection-review (test: vitest run),
> scripts/reference-harness/fixtures/module-tree-consumer (no test script),
> site (no test script); node_modules is missing in
> scripts/reference-harness/fixtures/module-tree-consumer

`module-tree-consumer` is a fixture of a reference-harness script. That script
installs the fixture from a packed tarball when it runs, so the fixture cannot
be installed beforehand. It has no test script, so the gate would never run
anything there.

**Cause.** [`nestedPackagesStep`](../../subs/harness/src/run/readiness.ts)
(`readiness.ts:355-368`) fails on any nested package without `node_modules`,
whether or not it has a test script.

**Evidence.**
- `run-20260924T213446Z-84a63c-outcomes.txt`, event 7.

**Status.** Fixed in `2f0ca760`. Readiness requires `node_modules` only in a
nested package the gate tests; any other uninstalled package is noted.
### H2. The command output cap was smaller than a Ramify report

**What happened.** In run 2 the baseline tests (163 s), the nested tests and
the type check passed. The complete Ramify check was recorded as
`not-verified (runner-error)`. Readiness retried, and the retry would have
failed the same way, so the run was stopped.

**Cause.** `runCommand` killed any command printing more than 16 MiB
(`outputCapBytes`, `evidence/src/run-command.ts`). The Ramify CLI wrapper had
the same bound as its own `maxBuffer`. `ramify check --format json` on the
toolkit prints 25,368,539 bytes (see R1).

**Evidence.**
- `run2-ga-0001-ramify-check-log-size.txt`: the captured log is exactly
  16,777,216 bytes, cut inside the snapshot.
- `run2-ga-0001-attempt.json`: `ramify-check`, outcome `not-verified`,
  `runner-error`.
- `run-20260924T213823Z-c0f512-outcomes.txt`, event 7.

**Status.** Fixed in `193fc421`. Both bounds share `outputCapBytes`, which is
now 128 MiB. Type check passes and the focused tests of both files pass (19).
R1 is the real fix.

### H3. The run branch name collides with an existing branch

**What happened.** In run 3 readiness passed. The harness then tried to commit
the plan's feature files and failed:

> The run failed (internal): The harness commits only on a run branch; HEAD is
> run/self-explaining-denials

The server had logged, earlier:

> Run 20260924T214637Z-53bc9b: the run branch could not be created:
> `git switch --create ramify-agent/run-20260924T214637Z-53bc9b` exited with 128

Reproduced by hand in the worktree:

```text
fatal: cannot lock ref 'refs/heads/ramify-agent/run-test-probe': 'refs/heads/ramify-agent' exists; cannot create 'refs/heads/ramify-agent/run-test-probe'
```

**Cause.** Run branches are `ramify-agent/run-<run-id>`
([`git.ts:19,83`](../../subs/harness/subs/evidence/src/git.ts)). The repository
has a branch named `ramify-agent`, and git cannot hold a ref and a directory of
refs with one name. A worktree shares its refs with its main repository, so no
worktree of this repository can hold a run branch.

A second defect makes it worse. `createBranch`
([`service.ts:6465-6472`](../../subs/harness/src/run/service.ts)) turns the
failure into a server warning and lets the run continue. The run then fails at
the first commit (`git.ts:102`) with reason `internal`, which hides the real
cause.

**Evidence.**
- `run-20260924T214637Z-53bc9b-outcomes.txt`: `readiness-passed`, then
  `job-failed`.
- The warning and the git error above, quoted from the server log and
  terminal. The server log was overwritten when the server restarted.

**Status.** Fixed in `2f0ca760`:
- run branches are now `ramify-agent-run/<run-id>`, and runs recorded under the
  old prefix still resume;
- creating the branch is the last readiness step, which fails with git's own
  message.
### H4. A type error in the engineer's own file is attributed outside the assignment

**What happened.** Gate `ga-0003` of iteration `wi-001.i03` failed on one type
error in the engineer's new test file:

```text
subs/cli/src/tests/explained-diagnostics.test.ts(56,52): error TS2352: Conversion of type '{ stdout: (value: string) => number; }' to type 'CliEnvironment' may be a mistake ...
```

The file lies inside the assignment's write scope, `subs/cli/src`. The scoped
tests, the Ramify check and the scenarios passed. The gate's cause was
`outside-assignment`. So the iteration closed `unsuitable` and went back to
the local architect, instead of to a repair round for the engineer. The local
architect then assigned repair iteration `wi-001.i04`, which passed.

**Cause.** [`causeOf`](../../subs/harness/src/checks/gate.ts) and
`outsideAssignment` (`gate.ts:279-346`) decide from which commands failed. The
scoped tests passed and the project-wide type check failed, so the failure was
called outside. They read no file locations, although `tsc` names each error's
file.

This is the defect the T2 run found, which `docs/todo.md` item 3 fixed for
Ramify findings only.

**Evidence.**
- `run4-ga-0003-attempt.json`: type-check failed, everything else passed,
  cause `outside-assignment`.
- `run4-ga-0003-type-check.log`.
- `run4-wi-001.i03-result.json`: outcome `unsuitable`, finding "the gate
  returned to the local architect: outside-assignment at gate ga-0003".

**Status.** Fixed in `2f0ca760`. A project that declares
`"typeCheck": { "output": "tsc" }` in `ramify-agent.json` has a failed type
check attributed by where its errors lie. Without the declaration, or with
output the gate cannot read, the attribution is as before.
### H5. The local architect had contract files edited without authorizing them

**What happened.** Iteration `wi-001.i06` was an ordinary `ramify/cli`
iteration. Its approach told the engineer to correct the fake and conformance
test of contract `ct-001`. Those files are guarded, and it named neither of
them in its scope. Gate `ga-0005` passed every command and failed with cause
`guarded-change`. It listed:
- `subs/analysis/src/fakes/explained-import-diagnostics.fake.ts`;
- `subs/analysis/src/tests/explained-import-diagnostics.conformance.test.ts`.

Both have `authorizedBy: null`. The next assignment, repair iteration
`wi-001.i07`, named both files as extra scope with purposes `fake` and
`conformance`. It passed.

**Cause.** The first version of this record blamed the prompt; that was wrong.
`wi-001.i06` did name both files as extra scope, with purposes `fake` and
`conformance`, but carried no `authorizations`. The assignment validator
accepted it, so the write guard let the engineer write the files, and the gate
then refused the change.

**Evidence.**
- `run4-wi-001.i06-assignment.json`: no extra scope.
- `run4-ga-0005-attempt.json`: `guardedChanges`, cause `guarded-change`.
- `run4-wi-001.i07-assignment.json`: `scope.extra` with the two paths.

**Status.** Fixed in `87be40c4`. The validator refuses an extra path that is
guarded and has no authorization, before any engineer round is spent.
### H6. No assignment can write a file outside every module

**What happened.** The plan requires `scripts/reference-harness/report.ts` to
print the same block as the CLI. In the toolkit, `scripts/` belongs to no
module. The local architect's assignment named `report.ts` and its test as
extra consumer paths. The harness rejected both as lying "under no module of
the refreshed view and under no module this assignment may create"
([`work/assignment.ts:282`](../../subs/harness/src/work/assignment.ts)).

The local architect asked the global architect where the rendering belongs
(`pr-002`). Three forks answered `partial` (retries 1 to 3). Each said that no
placement makes those files writable, and that moving the renderer into `src/`
would break the `reference:report` command and the reference tests' discovery
unless the script configuration changed too.

**Cause.** Two things:
- The scope model covered only paths under a module's directory, so a project's
  scripts and other files outside modules could not be assigned.
- A bug: the root module's directory is `''`, which the validator normalised to
  `'.'`, so no path ever matched the root.

**Evidence.**
- `run4-pr-002.json`: the placement question.
- `run4-inv-0024-submission.json`, `run4-inv-0027-submission.json`,
  `run4-inv-0028-submission.json`: the three partial fork answers.
- `run-20260924T215457Z-2ff23b-outcomes.txt`: `placement-requested` and three
  `fork-returned-partial` events.

**Status.** Fixed in `87be40c4`:
- a new extra-scope purpose, `outside-modules`, takes a required `reason`;
- a path belongs to a module only if it lies in its `src/`, `module.ramify` or
  `README.md`;
- harness-only files, `plans/` and `.git` are refused;
- test files under such a path run at the gate as their own command.
### H7. One unresolvable requirement ends the whole run

**What happened.** After H6, the local architect of `wi-001` submitted
`unresolved`:

> The run failed (unresolvable-requirement): The local architect of wi-001
> reports the request cannot be met as stated: The required reference harness
> rendering cannot be implemented under any permitted assignment scope ...

The harness ended the run. Several things were never reached:
- `wi-003`, the `ramify/analysis` work item created from the contract's
  obligation, never started;
- neither did `wi-002`;
- the four open CheckFindings on `wi-001` were never reconciled.

**Cause.** An `unresolved` submission fails the run at once
([`service.ts:3516-3520`](../../subs/harness/src/run/service.ts)). The harness
cannot record one requirement as unmet and continue with the rest.

**Evidence.**
- `run4-inv-0029-submission.json`: the `unresolved` submission.
- `run-20260924T215457Z-2ff23b-outcomes.txt`, event 193.

**Status.** Fixed in `08bcfdb2`. An `unresolved` answer forks the global
architect, which answers with one of:
- a placement fix;
- a plan deviation, recorded as a high-risk `plan-deviation` CheckFinding that
  blocks nothing;
- nothing possible, which fails the run as before.

The plan file is unchanged, and the deviation binds the rest of the run. The
run ends "completed with N plan deviations to review". A sixth deviation holds
the run for the person's decision.
### H8. The local architect's API view could not be materialized

**What happened.** The local architect of `wi-001` recorded twice that it
could not get an API view. Its first analysis lists as unresolved "API view
could not be materialized (analysis-failed after four attempts)". Its outline
(`run4-wi-001-outline-1.json`) says "API materialization failed after four
attempts (analysis-failed), not a refusal". It told engineers to check any new
shared symbol against the exposure declarations instead.

The engineer's assignments recorded a materialized view, so the failure seems
limited to the local architect's own request.

**Cause.** A toolkit daemon defect. A retained capture kept the abort signal
of the operation that created it. When file events aborted that operation after
the rebuild, every later sweep threw an empty `Cancelled`, which was reported as
`analysis-failed` with no message. Retries failed within milliseconds, until an
unrelated file event reopened the project. The harness also materialized the
view once per work item and resent the failure on all nine turns. The engineers'
assignments recorded the *architect* view, not the API view.

**Evidence.**
- `run4-wi-001-outline-1.json`, `changes`.
- `run-20260924T215457Z-2ff23b-outcomes.txt`, the analysis data.

**Status.** Fixed in `84ab8fcb`:
- **Toolkit:** the capture and the observer drop the creating operation's
  signal; a stale cancellation reopens the project; `Cancelled` carries a
  message.
- **Harness:** the local architect's API view is materialized again after a
  failure.

`/ramify/dist` was rebuilt.
### H9. The hook identifies a finding by code and message

**What happened.** Found by a probe that planted one violation per denial code
in a fixture copy (`denial-probe-RESULTS.md`).
[`findingIdentities`](../../subs/harness/src/hooks/post-write.ts)
(`post-write.ts:294`) builds a finding's identity from its top-level `code`,
`rule`, `severity`, `file`, `path`, `line`, `message` and `detail`. Ramify puts
the file and line inside `location`, so only the code and message count.

Two files importing the same forbidden symbol give the same message, and so
the same identity. They are reported as one finding, and fixing one of them is
not reported correctly.

**Cause.** Ramify's own `id` is ignored.

**Evidence.** `denial-probe-RESULTS.md`, and `post-write.ts:294-305`.

**Status.** Fixed in `345f30fc`. A finding is identified by Ramify's `id`,
and a violation that only moved keeps its identity.
### H10. The hook says nothing when a description error removes import findings

**What happened.** In the probe, a syntax error in one `module.ramify` made
evaluation `invalid`. All six planted import errors disappeared from the
report. The changed-check JSON listed their ids in `removed`, but neither
Ramify's human form nor the harness mentions it. An engineer could read the
silence as the violations being fixed.

**Evidence.** `denial-probe-RESULTS.md`, "Extras" and point 6.

**Status.** Fixed in `345f30fc`. When imports were not evaluated, the hook
says so, and earlier import findings stay open.
### H11. Engineers never see warnings or analysis limits

**What happened.** [`entriesOf`](../../subs/harness/src/hooks/post-write.ts)
(`post-write.ts:271`) reads only `findings` and `diagnostics`. Ramify reports
warnings and analysis limits in `warnings` and `coverage`, so the hook never
relays them. An engineer who adds a file outside every module's source, or an
import Ramify cannot resolve, is not told.

**Evidence.** `denial-probe-RESULTS.md`, point 4, and `post-write.ts:271-278`.

**Status.** Fixed in `345f30fc`. Warnings and analysis limits on the files
just written are relayed as not blocking, except the outside-module warning for
`outside-modules` paths.
### H12. The scripted fake agent's analysis lacks the required scenario lists

**What happened.** While the map fixes were being verified, a server started
with `--agent fake` could not get a run past its analysis. The scripted
analysis leaves out the `scenarios` and `integrationScenarios` arrays that
Plan 10 made required. So the verification used the Plan 11 browser fixture
instead.

**Cause.** `demonstrationScript` in
[`http/server.ts:107-120`](../../subs/harness/src/http/server.ts).

**Status.** Fixed in `345f30fc`. A test now validates every submission of the
script.
## Web client

Found while watching run 4, and investigated and fixed by a subagent. The fix
is `8c1397ed` on `ramify-agent`, a fast-forward of branch
`fix/execution-map-drag`.
- `execution-map.test.tsx` has 15 tests, 6 of them new. All six new tests
  fail against the previous source.
- `transcript-workspace.test.tsx` has one new test.
- 46 tests pass across the three touched test files.
- Type check and `check:self` are clean.
- Each fix was verified in a browser.

### W1. Cards and edges disappear while panning

During a 30-step pan, 32 of 115 sampled animation frames had every card hidden
and no edges. Some of those frames reached the screen as flicker.

**Cause.** `execution-map.tsx` rebuilt the node objects on every render without
their measured size. React Flow then hid each node and its edges until it had
measured them again. The viewport was held in the parent's state, so every pan
frame also re-rendered the Run page. This dates from Plan 11 (`f7ed9845`).

**Status.** Fixed. After the fix, a sample of 98 frames during a pan had none
hidden and no edges missing.

### W2. The view jumps back to the selected card

After panning away from a selected card, a live update or an expand/collapse
centred the view on it again.

**Cause.** The centring effect depended on the layout, which changes on every
update. `ea3ebda` (Plan 12's follow-up) made it fire more often, because
measured heights change the layout.

**Status.** Fixed. The map now centres only on a click, a jump, Now or Focus on
map.

### W3. Dragging on a card does not pan, and releasing selects it

**Cause.** The card's button carried React Flow's `nopan` class, and at normal
zoom cards cover most of the canvas. Releasing counted as a click, which
selected the card and, for a session, opened its transcript window.

**Status.** Fixed: `nopan` removed, `nodrag` kept.

### W4. Gate cards show internal tokens and ambiguous text

A readiness gate card read:
- "gate" as its label, above "Readiness gate ga-0001";
- a lone "•••" on its own row;
- "run-wide or module unavailable";
- "$readiness · round 0 · audit not-applicable".

**Causes.**
- The `$` was a typo in the JSX.
- The "•••" was the running mark, placed in its own grid row, with no audit
  ring for `not-applicable`.
- "run-wide or module unavailable" was one fallback for two different cases.
- The round and the audit were printed even when they did not apply.

**Status.** Fixed:
- the verdict is in words ("Running for 1m 25s", "Passed", "Not verified");
- the card says "Run-wide" or names the work item's module;
- the round shows only above 0, and the audit only where it applies;
- the detail panel follows the same rules.

### W5. The expand button covers card text; transcript windows jump 8 px

- The absolutely positioned expand button covered a capability card's last
  line.
- A transcript window dragged against the edge jumped 8 px on release:
  `react-rnd` allowed 0 px while `clampWindowRect` kept 8 px.
- Windows also could not reach the right side of the screen, because the
  workspace inherited the page's 52rem maximum width.

**Status.** Fixed.

### W6. Open web client defects

- **The "All gates" side list** still reads "audit not-applicable · round 0".
- **Capability cards:**
  - they read "0 passed · 0 failed · 0 other · 2 no real run · 0 unavailable;
    2 / 2", where "no real run" is jargon and the count is hard to parse;
  - their titles are generated from the capability's id, for example
    "Explain Not Checked Hook Replies".
- **Collapsing** leaves a large empty gap, because unmoved cards keep their
  stored positions.
- **The initial fit** often sits at or near minimum zoom, because all cards
  sit in one tall stack.
- **A running gate** cannot show its current step (tests, type check, Ramify
  check, scenarios). No gate emitted step events, not only readiness.

**Status.** Fixed in `5ac6bc1c`, with the `gate-command-started` event from
`2f0ca760`:
- the gate list uses the card wording;
- capability cards show the id with its behavior, and non-zero counts such as
  "2 of 2 not run yet";
- every card follows the recomputed layout;
- the initial view opens at a readable zoom on the active card;
- a running gate shows its step, for example "Type check (2 of 4)".

The gate detail's command list still prints raw kinds.

## Ramify toolkit

### R1. A complete JSON report is 25 MB

`ramify check --batch --format json` on the toolkit prints 25.37 MB. Almost
all of it (25.36 MB) is `snapshot`, the record of every evaluated import:

| Snapshot part | MB | Count |
| --- | ---: | ---: |
| `results` | 12.13 | 6,583 |
| `accesses` | 6.73 | 6,583 |
| `linked` | 1.83 | |
| `catalog` | 1.67 | |
| `model` | 1.61 | |
| `inputs` | 0.86 | 5,201 |
| `inventory` | 0.53 | |

Each result repeats the whole question, the original and its visibility chain:
about 1.8 KB, even for an allowed import within one module. `diagnostics`,
`warnings` and `coverage` were empty, and `summary` and `outcome` take a few
hundred bytes.

The harness reads nothing of the snapshot. Yet every gate and every complete
hook check writes and parses the whole report. The CLI's `check` flags are
`--root`, `--format`, `--batch`, `--changed`, `--since` and `--deadline`. None
leaves the snapshot out.

**Evidence.** `toolkit-report-size.txt`.

**Status.** Fixed in `107883fa`. `ramify check --format json --no-snapshot`
prints the report with `"snapshot": null`: 5,119 bytes on the toolkit. The
harness passes the flag on every complete check. The resident daemon still
builds the snapshot and drops it at output.
### R2. Import denial messages are keys, and the hook form drops their explanation

A `not-visible` denial reads
`collection-review/workspace/catalog/core:records.ts#findRecord: not-visible`.
The hook form, `--changed`, prints only that line and drops the `Importer:`,
`Original:` and `Related:` lines. The other denial codes read the same way.

**Evidence.** `denial-probe-RESULTS.md`, every code, in all four forms.

**Status.** Open. This is the subject of `plans/self-explaining-denials/plan.md`.

### R3. Two formatting defects

- A `testing-origin` message prints its blocking path twice after "via".
- The hook form's warning line always says "files", as in "1 compiler-selected
  files", and gives no file list (`subs/cli/src/format.ts:12`).

**Evidence.** `denial-probe-RESULTS.md`.

**Status.** Open. The plan covers both.

## Plan authoring

These two problems are in the plan written for this run, not in the harness.

### P1. The plan required a change no assignment could make

The plan's Constraints require the reference harness's renderer,
`scripts/reference-harness/report.ts`, to print the same block. That file lies
outside every module (H6), so the requirement could not be met. It ended run 4
(H7).

**Status.** Resolved by H6. The requirement stays in the plan.
### P2. A scenario's wording produced an assertion that cannot fail

The plan's first scenario says "And it contains no owner-file-binding key".
The engineer's step asserted that the output does not contain the literal
string `owner-file-binding`. That assertion cannot fail, and the output did
still print an `owner/file#binding` key. Two reviews reported it
independently:
- the scope review of `wi-001.i07`, as `cf-0003`;
- the code review of `wi-001.i07`, as `cf-0006`;
- the scope review of `wi-001.i04` had already reported the key still being
  printed, as `cf-0001`.

The step is `subs/cli/src/tests/steps/denial-rendering.steps.ts:59-62` on the
run branch.

**Status.** Fixed in the plan. The step now reads "And it contains no key of
the form `owner:file#binding`, such as `app/catalog/core:records.ts#findRecord`".
## Environment and process

- **E1. Stale dependencies.** The main checkout's ramify-agent dependencies
  lacked `react-rnd`, which Plan 11 added, so `npm run build:web` failed.
  Fixed with `npm ci`.
- **E2. Stale toolkit build.** `/ramify/dist` is out of date: it lacks
  `highlightedNodeIds`, and a type check against it fails. The harness's Ramify
  checks run through it. It was left alone during the run, because rebuilding
  changes the compiled client's identity. Rebuilt after the R1 and H8 merges.
- **E3. The pi upgrade.** `gpt-6-sol` exists only from pi 0.87.1. That version
  sends the system prompt and tools as system messages, which the adapter
  passed on as user messages. Fixed in `20db7eb9`, with the adapter's test
  helper adapted. The adapter's tests (56) and the related harness tests (157)
  pass. A live session and a live fork probe on `gpt-6-sol` passed.
- **E4. No audit.** No ramify-audit has run on `ramify-agent` since
  `20db7eb9`, `193fc421` or `8c1397ed`.

## Not reached

The run ended before these could be observed with a real model:
- reconciliation of CheckFindings, including whether the two reports of P2's
  defect are joined as one issue (they were opened as separate findings);
- a provider work item in another module (`wi-003`) and the replacement of a
  fake by the real provider;
- a work item's completion and its unresolved signals;
- the final gate.
