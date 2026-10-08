# Status-badge-tone real run after Plan 21: findings and proposals

**Date:** 2026-10-08. **Status:** analysis of one real run, with proposals for
a follow-up plan. It is not an implementation plan and establishes no
implemented behavior.

[Plan 23](../plans/23-session-reuse-and-run-efficiency/main-plan.md) combines
these corrections with the session-reuse proposal in one implementation plan.
Its [coverage map](../plans/23-session-reuse-and-run-efficiency/proposal-coverage.md)
records existing work, selected changes and explicit deferrals.

The run is the first real pi session after Plan 21 and the first under
`run-policy/7`. It uses the usual real case, plan `status-badge-tone` on the
collection-review fixture, which last passed in Plan 10 and Plan 12.

## Summary

The run completed and its result is correct, but three harness defects
surfaced, planning cost rose by about two thirds against Plan 12, and the
search-space KPI cannot produce a value in any real run.

- **Outcome.** The run completed in about 11 minutes. All four gates passed,
  and the Cucumber check selected, executed and passed real scenarios at every
  gate. The engineer's change is correct, minimal and properly tested.
- **Defects.** The non-functional coordinator and repair prompts were
  delivered with unfilled placeholders; concurrent shell-hook checks reported
  a false module violation to the engineer; the engineer had no working way to
  run its pending scenarios.
- **Cost.** About 1.25M tokens and an estimated $2.25. 79% of the tokens went
  to roles that write nothing. Planning cost about 67% more than in Plan 12,
  mostly from a schema sent twice, prompt-cache loss on system-prompt changes
  and duplicated catalog classification.
- **Metrics.** `scope-size-ratio`, the edits-versus-search-space KPI, is
  always `partial` in a real run, most sessions record no scope size, and
  support documents are counted about eleven times. Computed by hand, the
  engineer's search space was about 3% of the project's content, a 33-fold
  reduction, but its project-wide greps reached the whole project.

## The run

| Item | Value |
|---|---|
| Run | `20261008T112847Z-ede7d9` |
| ramify-agent | `38b81e5e` on branch `ramify-agent` |
| Model | `openai-codex/gpt-5.6-sol:high` |
| Command | `npm run real-session -- --project <copy> --plan status-badge-tone --model openai-codex/gpt-5.6-sol:high` |
| Trial copy | prepared by `npm run trial -- prepare`, baseline `4bbee1ec`, final candidate `6bef70d` |
| Duration | 11:28:49Z to 11:39:44Z, about 11 minutes (Plan 10: about 12; Plan 12: 8) |
| Invocations | 13, 11 sessions |
| Final state | `completed`; one work item, no open requirements, four gate attempts |

The trial copy and its run records were in the session scratchpad and are not
retained. The figures below come from them.

### Preparatory fixes made the same day

Two earlier attempts on the same day did not reach an engineer. Each led to a
fix:

1. **`b23db328` — trial copies have a committed audit definition.** Plan 21
   made readiness and every gate ask the committed `ramify-audit.json`, but
   `live-trial.ts prepare` wrote none, so readiness could only fail. `prepare`
   now writes and commits one into the copy (type check, Vitest, Cucumber
   scenarios, batch Ramify check) and links the agent's `ramify` into the
   copy's `node_modules/.bin`. The fixture's Cucumber profile collects
   plan-written features and steps and filters `not @ramify-pending`.
   `start-run` refuses a missing or unreadable audit configuration before any
   agent starts.
2. **`38b81e5e` — architects learn the write scope, and it is validated at
   submission.** Run `20261008T100041Z-0b0ec3` failed `internal` after the
   local architect listed its owner's own `src/tests` in
   `assignment.scope.base.included`. The delivered capability procedure said
   only "Keep source and tests with their owners"; commit `9de371d2` had
   updated only the legacy procedure. A shared
   `write-scope.procedure.md`, a "Default write scope" briefing block and
   schema descriptions now state the model, including that an included child
   brings its whole subtree. Invalid `included` and `extra` entries are
   rejected at submission with remaining attempts.

### Gates and scenarios

| Gate | Checkpoint | Audit | Scenarios selected / executed / passed |
|---|---|---|---|
| `ga-0001` | readiness | full | 1/1/1 (the fixture's own scenario) |
| `ga-0002` | iteration | ramify-partial | 2/2/2 (sc-001, sc-002) |
| `ga-0003` | work item | reuse of `ga-0002` | 2/2/2 |
| `ga-0004` | final | full | 3/3/3, 21 of 21 steps |

The local architect used the new briefing block and assigned
`collection-review/workspace/shared-ui` with `included: []`, `extra: []` and
no authorizations.

### Invocations

| Inv | Role | Time | Tokens (uncached in / cache read / out) | Notes |
|---|---|---|---|---|
| 0001 | catalog-extractor (intake) | 10 s | 3.7k / 2.8k / 0.5k | |
| 0002 | initial-architect | 97 s | 23.4k / 66.7k / 5.0k | 21 tool calls, 54 KB of tool output |
| 0003 | catalog-extractor (check) | 76 s | 9.4k / 11.0k / 4.1k | 1 rejected submission |
| 0004 | local-architect (orientation) | 26 s | 14.5k / 14.8k / 1.3k | 2 "Path not found" errors |
| 0005 | context-selector (fork) | 7 s | 16.4k / 0 / 0.3k | no cache hits |
| 0006 | local-architect (assign) | 87 s | 46.8k / 74.1k / 4.5k | one 32 KB grep result |
| 0007 | engineer | 142 s | 23.9k / 235.8k / 5.9k | 15 turns; 1 false violation |
| 0008 | code review | 65 s | 25.8k / 70.1k / 2.8k | no concerns |
| 0009 | scope review (fork) | 24 s | 41.3k / 76.2k / 0.8k | 38k uncached on its first turn |
| 0010 | local-architect (completion) | 16 s | 8.9k / 97.5k / 0.8k | 92% cached |
| 0011 | design orientation | 7 s | 3.6k / 0 / 0.2k | |
| 0012 | design review (fork) | 29 s | 22.4k / 23.2k / 1.4k | no concerns |
| 0013 | nonfunctional-coordinator | 84 s | 71.2k / 239.2k / 4.6k | ran without its procedure |

Token shares by role: nonfunctional-coordinator 25%, reviews 21%, engineer
21%, local architect 21%, initial architect 8%, catalog extractor 3%, context
selector 1%. Cost estimates use the rates pi recorded for the model: input
$4/M, output $20/M, cache read $0.4/M.

Against Plan 12's run of the same case (from
[Plan 12 results](../plans/12-check-findings/results.md), since its records
are gone):

| | Plan 12 | This run |
|---|---|---|
| Planning invocations | 3 | 7 |
| Planning time | 235 s | 318 s (+36%) |
| Planning tokens | 312k | 406k (+30%) |
| Planning uncached input | 58k | 123k (+112%) |
| Planning cost | about $0.56 | about $0.93 (+67%) |
| Engineer | 214.8k tokens, 145 s | 265.6k (+24%), 142 s |
| Scope review | 82k | 118k (+44%) |
| Nonfunctional coordinator | not present | 315k |

The initial architect improved (97 s against 127 s, no rejection). The added
cost comes from the catalog intake and check, the orientation and selection
stages, cache loss and the coordinator.

## Result quality

The engineer's change in `4bbee1ec..6bef70d` meets the plan with the smallest
reasonable diff. `StatusBadge` gains an optional `tone` restricted to
`neutral | positive | warning | critical`, defaults it to `neutral`, and
renders `data-tone` beside the unchanged `data-status`; labels and both
callers are untouched. The unit tests cover all four tones, the default and a
supplied label. The step file renders the real component without fakes.

Minor points in the step file: `this: StatusBadgeWorld` asserts a type over
the global World, `isTone` repeats the union, generic step texts such as "the
badge is rendered" could collide with another module's steps, and one
assertion matches serialized markup.

The three reviews read the code rather than approving blindly, and found no
concerns; there was nothing material to find. The coordinator's three
`satisfied` verdicts are correct and grounded in source.

## Defects

### D1. Non-functional prompts are delivered with unfilled placeholders

`fill()` in [packages.ts](../../subs/harness/src/prompts/packages.ts)
(around line 591) replaces only `{{name}}`. Four files use single braces:

- `nonfunctional/coordinator.system.md:5` and `nonfunctional/repair.system.md:3`
  contain `{procedure}`;
- `nonfunctional/assessment.procedure.md:2` and
  `nonfunctional/repair.procedure.md:2` contain `{submissionTool}`.

The coordinator's rendered system prompt in this run contains a literal
`{procedure}`. Without its procedure, a read scope or a diff, it read `.git/`
files and the harness's own job records, which were 64% of what it read,
looking for "intermediate evidence" that no requirement called for. It was the
most expensive role of the run.

### D2. Concurrent shell-hook checks report a false module violation

Every engineer shell command triggers a whole-project Ramify check
([post-write.ts](../../subs/harness/src/hooks/post-write.ts), around lines
287–311). The engineer ran three commands in parallel. Ramify walks
`plans/**/.harness` (it warns `ignored-but-walked`), so one check saw another
check's log file appear and reported `Inputs changed during analysis …
[changed-input]`. The harness presented that as "RAMIFY MODULE VIOLATION …
`completion-proposed` is refused while this stands".

Related faults:

- the concurrent checks all wrote `hooks/005.json`; `006` and `007` were never
  written;
- checks ran even after a refused command that changed nothing;
- the violation text names `contract-needed` (`post-write.ts` lines 551, 701,
  712), which is not one of the engineer's submission kinds;
- hook checking took about 30 s of the engineer's 142 s.

The engineer saw the clearing message first in transcript order and was not
misled this time.

### D3. The engineer cannot run its pending scenarios

The project's Cucumber profile excludes `@ramify-pending`, and the scenario
briefing ([scenario-briefing.ts](../../subs/harness/src/work/scenario-briefing.ts),
around line 134) does not say so or give a command. A tagged run found no
scenarios, and `cucumber-js --help` was refused as a whole-suite run
([shell-tests.ts](../../subs/harness/src/tools/shell-tests.ts), around lines
117–123). The engineer worked around it with a temporary configuration in
`src/tmp/`, costing about three turns and 30 s.

The classifier is also wrong in the other direction: cucumber-js 13 merges
command-line paths with the profile's `paths`, so a "focused"
`cucumber-js <feature>` runs every non-pending scenario.

### D4. Trial verification flags the harness's own scratch commit

`npm run trial -- verify` exits 1 on this run. Its only finding is `.gitignore`,
changed by the harness's commit "Prepare module scratch ignore rule"
(`Ramify-Scratch: setup`, from `performScratchSetup` in `run/service.ts`).
`verify()` in [live-trial.ts](../../scripts/live-trial.ts) does not skip it.
Every agent write lay inside the recorded scope.

### Defects recorded earlier and still open

- **Scenario execution and semantic completion are separate.** A run can have
  architect-declared `done` scenarios without a matching Cucumber check. Under
  [the current verification contract](../harness.spec.md#verification-follows-scope-and-audit-policy),
  this is not itself a harness defect: audit establishes configured suite
  health, the responsible architect judges implementation and passing behavior,
  and the harness trusts that judgment without matching scenario references to
  execution results. Missing required reports or an unsuccessful configured
  audit still prevent completion. The harness must not add an independent
  scenario-execution veto. This run's configured checks did execute its scenarios.
- **Capability-task guarded set.** A capability task can authorize contract
  artifacts only (`run/service.ts`, around lines 7336 and 7989), while its
  architect's briefing now lists the full guarded set.
- **Stale scripted fixture trial.** The environment-gated
  `fixture-trials.test.ts` writes paths relative to the project root, but
  engineers now start in the module's `src/`, so the paths double.

## Cost drivers

### C1. Each submission schema is sent twice

[packages.ts](../../subs/harness/src/prompts/packages.ts) (around line 210)
pretty-prints the schema into the system prompt, and
`subs/agent/subs/pi/src/pi-agent.ts:525` adds it compact to the tool
description. The local architect's system prompt is 53.7 KB, of which 43.9 KB
is the schema, and the tool description repeats 16.8 KB of it: about 61 KB, or
15k tokens, of schema on every call against 9.8 KB of prose. The engineer's
19 KB system prompt carries 8 KB of schema; each reviewer's carries 4.2 KB.

### C2. Changing the system prompt within a session discards the cache

- The local architect's move from the 4.4 KB orientation prompt to the 53.7 KB
  assign prompt made `inv-0006`'s first call 30.6k tokens with nothing cached.
- The context-selector history-reuse start changes to a 469-byte prompt and
  new tools: 16.4k tokens, none cached, 93% of its cost. Its message resends
  the briefing (`context-selection/submissions.ts:47`). Neither that repetition
  nor the absence of further exploration establishes that inherited history
  contributed nothing. This start replaces the prefix and is not an exact fork.
- The scope-review fork from the local architect cost 38k uncached tokens.
- `inv-0010` kept its prompt and was 92% cached, which shows a stable prompt
  works.

### C3. The plan is classified twice and the copies disagree

The catalog intake correctly recorded the three Constraints and "tests still
pass" as non-functional (`nfr-001` to `nfr-004`). The initial architect never
sees the intake's elements and is not told what counts as non-functional; it
is told only "Other readers extract … you extract neither"
(`initial-analysis.procedure.md:9`). It filed the same Constraints as
functional (`fr-004` to `fr-006`, `fr-009`).

The check turn then spent about 60 s deduplicating. Because `replace` needs at
least one new element and no retire action exists, it recreated the
non-functional elements as identical `nfr-005` to `nfr-007`, then cited them
in `requirementRefs` and was rejected. Nothing in `check.procedure.md` says
those references take functional elements only, and the rejection named
`nfr-005`, an ID the model had never seen. The check also copied each Gherkin
block into `fr-007` and `fr-008`, so every package carries each scenario
twice. Form rule 6 (`initial-analysis.procedure.md:138`) forced the "tests
still pass" acceptance onto both scenarios, though neither verifies it.

### C4. Prompts send roles exploring

- The initial architect's message reports "cut: 11; detailsUnavailable: 4"
  (`run/service.ts`, around line 11783) without naming modules, which led to
  about 21 KB of irrelevant greps.
- The embedded module-architect skill still says to run `ramify materialize`
  and to follow `report.md`'s template, overridden only by "everything else in
  it holds". The initial architect read `report.md` and three placement
  references for a one-symbol change.
- The orientation hint to search `.ramify/children` produced `grep '.'` dumps
  of both API views (19 KB) and two path errors.
- The assignment briefing never says where the Cucumber and step setup lives,
  so the architect grepped the project root and got 32 KB, mostly
  `package-lock.json`, which then stayed in its session and the scope-review
  fork.
- The fixture's root README (around line 114) describes the expected
  step-file design for this very plan, which the design reviewers read.

### C5. Orientation stages cost more than they return here

Local-architect orientation and context selection added about 32 s and 47k
tokens; the selector picked three of three elements. The orientation briefing
withholds the requirement text that its procedure says to read, and its
message ends "Read your module, decide, and submit"
(`work/session.ts:497`), contradicting "submit only your orientation".

The design-review rule (`design-review.procedure.md:20`) requires a concern's
ground to be read with `snapshot_read` in this review even if earlier context
showed it. The 13 KB README was read again in this run. That is repeated input,
but does not establish that the inherited understanding saved nothing. The
procedure should distinguish knowing guidance from obtaining current evidence
for a reported concern.

### C6. Repeated and noisy context

- Each local-architect turn resends the full briefing: three near-identical
  copies of 7.1, 8.1 and 11.6 KB in one session.
- Every reviewer relists the changed paths its message already lists, and the
  code review reads both the patches and the whole files.
- All three review diffs show the feature file as modified, because the
  harness removed `@ramify-pending` when binding; the file says agents never
  edit it, and the review message does not explain the change, so two
  reviewers spent turns on it.
- The initial architect's hypothesis restated the entry capability, and the
  local architect then re-decided placement for it, bumping the registry to
  revision 2. The rule against that exists only in the legacy local-architect
  procedure.

### Smaller text faults

- `engineer-capability.system.md:36–43` says whole-suite runs "are refused"
  and then "Nothing checks a command before it runs".
- `subs/plan-evidence/src/interfaces/catalog.ts:313` says "the elements above
  are unchanged" although they follow, and prints it with no deviations.
- A fresh code review still receives the "this session may begin with an
  earlier conversation" paragraph.
- The module-architect skill is listed and hashed in the engineer, reviewer
  and coordinator packages but never sent, since their templates have no
  `{{skill}}`.
- `work/session.ts:477` always says a step definition outside the owner's step
  files arrived through an import, even when none exists.

## Efficiency metrics

### What is defined

| Metric | Definition | Status |
|---|---|---|
| `scope-size-ratio` (`kpi/1`) | Search space per changed line, Σ(w·S)/Σw, divided by the whole-project baseline B; `reduction-factor` is its inverse ([measurements and KPIs](../measurements-and-kpis.md), lines 92–135 and 172–178) | Implemented in `subs/harness/src/kpi/`, served at `GET /plans/:id/runs/:run/metrics`, shown on the web Run page; no CLI |
| `session-weighted-total` | Σ S over sessions / B | Implemented |
| `token-efficiency/1` | U = 100·T/C and K = U / g(S0), with C the delivered nonblank lines and S0 the whole project's nonblank source lines ([token efficiency](../metrics/token-efficiency.md)) | Specified only; Plan 4 awaits Dan's go-ahead (`docs/dan-to-do.md:88`) |
| `lineage/1` | Fork, repair and engineer segment costs, continuation growth | Implemented |
| Planning drift | Owner, seam and reuse drift, adaptation cost | Specified only |
| Actual exploration | Files read, searches | Deferred; raw data is recorded per invocation in `observations.jsonl` |

### What this run collected

| Item | State | Value |
|---|---|---|
| B | measured | 988,462 bytes |
| `scope-size-ratio`, `reduction-factor` | partial | none; "inv-0007: unguarded-shell" |
| `session-weighted-total` | unavailable | 2 of 11 sessions sized |
| Tokens | measured | 311k input, 911k cache read, 32k output |
| Gate attempts per accepted iteration | measured | 1 |
| Lineage | measured | fresh engineer start 5,562 tokens; continuation growth 24,232 |

Three faults prevent a usable value:

1. **Always partial.** Engineers run tests through the shell, which marks
   their line counts partial, and the partial branch (`kpi/metrics.ts`, lines
   135–138) drops those writers before summing, so the KPI shows 0/0 instead
   of a weight and subtotal. This predates Plan 21.
2. **Unsized sessions.** Reviewers, catalog extractor, context selector,
   orientation, coordinator and failure analyst record `size: null`
   (`run/service.ts`, about ten sites), as do the capability-task and
   non-functional repair engineers.
3. **Support documents inflated.** Every role's size includes all eleven
   roles' prompt packages, and shared skill files are counted eleven times
   (541 KB recorded against 245 KB of unique files). `.ramify-architect` is
   listed as a support document, so the architect view is counted twice in B
   and charged to engineers. This contradicts the specification's "each once"
   (`measurements-and-kpis.md`, lines 113–121). Support documents made up 98%
   of the engineer's recorded 552 KB.

Further gaps: the engineer's measured scope ignores the read scope, `extra`
locations, nested-project includes and bootstrap modules; the orientation
brief is not counted; the unit labels are wrong (the first KPI is a weighted
mean in bytes, the ratio is dimensionless); and no check compares the
measurement revision with the view revision.

Plan 21 did not break collection, and the definitions survive whole-owner
write authority. Owned-nested-project includes are writable but uninventoried,
and nothing records that in coverage. A future `token-efficiency/1` must
attribute edits, because harness commits now lie in the run's git range.

### Values computed for this run

Edits: the engineer changed three files (two modified, one new), 83 added and
10 deleted nonblank lines, C = 93.

| Variant | Engineer S | Baseline | Ratio | Reduction |
|---|---:|---:|---:|---:|
| Harness formula as recorded | 551,900 B | 988,462 B | 0.56 | 1.8× |
| Support documents counted once | 48,815 B | 691,998 B | 0.07 | 14× |
| Project content only (original definition) | 10,556 B | 346,046 B | 0.03 | 33× |
| Project content plus the read scope | 27,065 B | 346,046 B | 0.08 | 13× |

By files, the assigned module is 4 of 102 tracked files (3.9%), 20 with the
read scope (19.6%).

Exploration shows the limit of the static ratio. The engineer read 10 files
(8.9 KB), but four of its nine greps were project-wide, so its actual reach
was the whole project; no read excursion was recorded because grep is not
counted as one. The coordinator read 32 files and ran 27 searches.

Token efficiency, as `token-efficiency/1` would compute it: T = 1.25M,
g(S0) = 1.68, U ≈ 1.35M and K ≈ 0.80M tokens per 100 changed lines; on
uncached tokens only, U ≈ 369k and K ≈ 220k.

## Proposals

Concrete correction directions are grouped below. They are proposed changes,
not claims of implementation or approval of the separate policy decisions.

The [session-reuse proposal](2026-10-08-session-reuse-and-system-prompts.md)
covers D1, C1 and C2, and now includes explicit corrections for duplicated
briefings and task/submission consistency. It preserves orientation instead of
selecting stage removal by runtime thresholds. The remaining fixes below are
independent of exact session inheritance.

### P1. Correctness

1. Use `{{procedure}}` and `{{submissionTool}}` in the four non-functional
   prompt files, make rendering fail when any placeholder survives, and add a
   test that renders every package.
2. Bound the coordinator to the evidence its assessment needs: supply the
   current requirements, base and candidate commits, changed paths and a
   bounded read scope. Exclude `.harness/` and `.git/` from assessment reads;
   do not send the coordinator searching for harness history. Omit the
   temporal-condition sentence when no element has such a condition. The
   agent judges the requirements; the harness enforces the declared scope.
3. Shell-hook checks: skip the whole-project check when a command changed
   nothing or was refused; serialize checks for the same working tree and
   allocate log numbers atomically before asynchronous work starts; report
   `changed-input` or an incomplete check as not checked, never as a module
   violation; keep job records out of the walked tree (write them outside the
   project, or declare `.harness` `owned-unwired` in the trial).
4. Name the invoking role's real submission kinds in the violation text
   instead of `contract-needed`.
5. Pending scenarios: explain the profile's exclusion in the scenario briefing.
   Prepare a focused configuration in the permitted `src/tmp/` location,
   using the project's declared support setup and exactly the iteration's
   feature paths, with pending scenarios enabled. Give the engineer its
   explicit command. It must not inherit a default profile's broader paths
   or pending-tag exclusion. Classify help/version and dry-run commands
   separately from test execution; none is evidence that scenarios ran.
   Verify both selected paths and pending-scenario execution, including the
   refusal of a falsely focused command that merges in wider profile paths.
6. Make `trial verify` distinguish recorded harness scratch-setup changes
   from agent edits, using the setup commit and recorded attribution. Do not
   exempt an entire file from verification just because setup also changed it.
7. Derive the capability-task briefing, accepted authorizations and execution
   guards from the same declared guarded-set policy. Do not advertise a wider
   authorization set than the implementation supports. Expanding that policy
   is a separate change, not an automatic remedy for inconsistent prose.
8. Update the scripted fixture trial to resolve engineer-relative paths from
   the supplied module `src/` working directory. Keep project-relative paths
   only in fields whose contracts require them; do not prepend the module path
   a second time.

### P2. Metrics

1. Deduplicate support files by their recorded file identity before summing.
   Include only the invoking role's actual delivered package plus the plan;
   keep `.ramify-architect` in its own component rather than support documents.
   Report the project-content-only ratio beside the total. An inherited file
   must not become several distinct support files because several roles use it.
2. Preserve partial writers' weight and known subtotal, with their coverage
   reason, instead of dropping them and presenting 0/0. Do not promote partial
   observations to fully measured. Apply the [changed-line attribution contract](../measurements-and-kpis.md#changed-line-attribution-and-exclusions):
   shell writes being unguarded is an execution-boundary limitation, not by
   itself a gap in snapshot line counts. Complete captured snapshots and known
   writer attribution permit measured counts; missing evidence or unattributable
   overlapping writers remain explicit coverage gaps. Intermediate writes later
   reverted do not contribute to delivered change volume.
3. Record scope sizes for every role, including the capability-task and repair
   engineers.
4. Add read scope and `extra` locations as separate size components, deduplicate
   overlaps, and record uninventoried nested-project includes and unmeasured
   bootstrap locations as coverage limits. Account for the delivered orientation
   brief explicitly instead of silently omitting it.
5. Label the weighted mean in bytes and the ratio as dimensionless. Compare
   measurement and view revisions before combining them; a mismatch is stale
   evidence requiring refresh or an explicit incomplete result.
6. Add a cheap exploration metric from the recorded observations: files and
   bytes read, project-wide searches and reads outside scope per role. It would
   expose cases like this engineer's whole-project greps that the static ratio
   hides. Count grep's searched scope as well as returned reads, so searches
   outside scope are not invisible. Attribute future delivered-line counts to
   agent edits separately from harness setup and pending-tag removal commits.

### P3. Cost

1. Send each submission schema once, compact, in the tool description; drop
   the "takes exactly this JSON" block from the system templates. About 11k
   tokens saved per local-architect call.
2. Follow the [session-reuse proposal](2026-10-08-session-reuse-and-system-prompts.md#proposal-predetermined-strategies):
   retain the initial role prompt, put each task in its user message, and append
   specialized tools when needed. Continue successive work and use exact forks
   at the specified points for side tasks. This supersedes upfront registration,
   fresh selector/scope-review alternatives and replacement starts called forks.
3. On continued turns, send only the briefing sections that changed, with the
   new revision and current task. Fresh starts and explicit fresh recovery
   receive the complete current briefing. A fork inherits only through its
   recorded point, so append every required update after that point.
4. Classify the plan once: pass the intake's accepted elements to the initial
   architect as already recorded, define non-functional in its procedure, and
   in `check.procedure.md` state which element kinds each reference list
   takes, add a retire-only action, forbid copying Gherkin into elements and
   name submitted keys in rejections. Keep scenario text in the scenario
   registry and refer to its identity from elements. Validate submitted keys
   before allocating durable IDs so an error names the caller's actual input,
   not an unseen ID created during the rejected submission.
5. Keep orientation and selection under the predetermined workflow. Supply the
   goal and requirement text the orientation procedure requires; if some catalog
   material is deliberately withheld until selection, do not instruct orientation
   to read it. End that task with "submit your orientation using
   `submit_work_orientation`", not an ambiguous assignment instruction.
6. Keep the design-orientation fork. Clarify the review procedure: reuse earlier
   understanding of the same captured guidance, refresh guidance whose identity
   differs or cannot be established, and obtain current `snapshot_read` evidence
   for every reported concern's ground. Align the opening guidance instruction
   with this rule. Do not require a blanket reread solely because a new review
   starts, and do not let inherited understanding substitute for required evidence.
7. Retain the coordinator in the current scope. A future proposal to omit a
   stage must identify the exact use case and preserved assessment responsibility;
   a small catalog or a concern-free review alone does not establish equivalence.
8. Use one canonical changed-path listing for the captured candidate. Align the
   review message and its procedure so an identical enumeration is not repeated
   solely because both currently request it; retain any listing required by the
   evidence contract. Read patches first, then surrounding or full source where
   it is needed to assess behavior or design, rather than requiring both forms
   for every file. Do not weaken the recorded coverage of inspected paths.

### P4. Prompt text

1. Render the module identities and coverage reasons already present in the
   captured view. Where those details are unavailable, say so and tell the
   agent to retain the limit rather than search for missing metadata.
2. Adapt the embedded skill explicitly to the read-only role: views are already
   materialized, there is no shell, and the accepted output is the task's
   submission tool rather than `report.md`. Use placement references when an
   ownership or placement question actually needs them; they are not a required
   reading list for a change to one existing symbol.
3. Name the Cucumber configuration, support files and an existing step file in
   the assignment briefing; name only API-view directories that exist; consider
   having grep skip lockfiles.
4. In the capability local-architect procedure: "The entry is already
   registered; record a local decision only for a capability not in the
   registry." In `initial-analysis.procedure.md`: "Record no hypothesis that
   restates an entry."
5. Relax form rule 6 so a non-behavioral acceptance can be covered by a
   registered test rather than a scenario.
6. Annotate pending-tag removal as a recorded harness binding change in the
   review's changed paths. Preserve the audited diff; the annotation explains
   attribution without hiding other changes to the feature file.
7. Correct the command-policy text to distinguish pre-execution refusals from
   post-execution checks. Replace "elements above" with position-independent
   wording and omit unchanged/deviation boilerplate when it has no content.
   Remove inherited-history boilerplate from fresh code-review tasks. Build
   each delivered prompt manifest from the instructions actually supplied,
   including inherited instructions when applicable, rather than hashing an
   unused skill as delivered. Describe a step definition as imported only when
   an import is recorded; otherwise identify the actual known source or say
   it is unavailable. Remove the fixture README's supplied solution, stale
   enforcement text and broken documentation links.

## Decisions for Dan

1. Whether Plan 4 (`token-efficiency/1`) may start, or whether the exploration
   metric (P2.6) comes first.
2. Any future removal of orientation, selection or coordinator stages requires
   a separately defined use case and assessment contract; no runtime small-item
   skipping is proposed here (P3.5–P3.7).
3. When to retry the long toolkit trial, `plan16-bounded-denials`, whose
   target configuration still predates Plan 21.

Scenario completion authority and the distinction between shell guarding and
line-count coverage are already specified above; they are implementation
alignment checks, not open policy decisions.
