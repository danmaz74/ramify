# Plan 3 trial review sheet

**Status:** two of the three trials ran on 2026-09-21, both with the
**scripted agent over the fixture's real toolchain**. The third, the real pi
trial on `review-notes` (T2), **did not run**: there is no pi login in this
environment ([NOT-RUN.md](review-notes/NOT-RUN.md)). The trial record and the
agent's own factual observations below are filled in. **The reviewer's
questions and verdict are blank, for the person.** Nothing in the trial
record or in the agent's observations is a verdict. No review wait was added
to execution: every run ended by itself, and this sheet is read afterwards.

## What the trials are

| Trial | Plan | Agent | What it exercises | Evidence |
| --- | --- | --- | --- | --- |
| Small plan | `status-badge-tone` | scripted, over the real toolchain | One module, one work item, decomposition not imposed: the outline records `single-iteration` and one accepted iteration completes the work | [status-badge-tone/](status-badge-tone/) |
| T3, breaking | `reviewer-identity` | scripted, over the real toolchain | A breaking change staged across three accepted boundaries, the two breaking ones each closed by a whole-project gate | [reviewer-identity/](reviewer-identity/) |
| T2, real pi | `review-notes` | **pi, not run** | One consumer, a real delegation, a named fake, a provider obligation, the provider and verification on return, a restart after contract registration | [review-notes/NOT-RUN.md](review-notes/NOT-RUN.md) |

**What "scripted over the real toolchain" means.** The harness, its records,
its guard, its gates and its commits are the real ones. Readiness, every gate
and the final gate spawn the fixture's own `npm test` (Vitest), its own
`npm run type-check` and a complete `ramify check --batch`, in a disposable
copy where `npm ci` has installed the fixture's dependencies. The architect
view is materialized by the installed Ramify through a private daemon that
is disposed before the copy is removed. Hook checks are real
`ramify check --changed` calls. **The agents' decisions and the source they
write are not a model's.** Each stage's source was written by the agent that
ran iteration 12 part 1 against the fixture's toolchain beforehand
([`reviewer-identity/stages.json`](reviewer-identity/stages.json),
[`status-badge-tone/stages.json`](status-badge-tone/stages.json)). The
scripted agent replays that source through the harness's guarded `write`
tool. So a trial shows that the loop carries a staged break through real
gates. It does not show that a model can stage one.

Every run was driven by `subs/harness/src/tests/fixture-trials.test.ts` and
checked afterwards by `scripts/live-trial.ts verify`.

## Trial record: `status-badge-tone`

| Field | Value |
| --- | --- |
| Run | `20260921T073654Z-47e6b7`, agent `scripted`, 27 events, 07:36:56–07:37:46Z (≈50 s) |
| Work | One entry capability in `collection-review/workspace/shared-ui`; one work item `wi-001` |
| Outline | Revision 1: `single-iteration`, "One component and its tests; nothing else changes and nothing depends on the change." |
| Iterations | Exactly one `iteration-assigned`; `wi-001.i01` `ordinary`, result `accepted`, commit `4d69488` |
| Gates | `ga-0001` readiness, `ga-0002` iteration (the 2 test files of `shared-ui`), `ga-0003` work-item, `ga-0004` final: every one `passed`, every command `passed`, exit 0 |
| Final state | `job-completed` with a passing final gate |
| Write-scope verification | 1 modified, 1 added, 0 deleted; both inside `wi-001.i01`'s scope; 0 outside; **0 defects**; `git status` clean |
| Observations | 2 guarded `write` calls, both `allowed`; 2 hook checks `changed`/`passed`; 1 snapshot mutation; `outsideScope` empty; coverage gaps: 4 `usage-unavailable`, 4 `context-unavailable` (the scripted agent reports neither), 1 `unsupported-runner` (the Cucumber suite) |

## Trial record: `reviewer-identity` (T3)

| Field | Value |
| --- | --- |
| Run | `20260921T075217Z-236cd4`, agent `scripted`, 47 events, 07:52:18–07:53:31Z (≈73 s); baseline commit `362d55c` |
| Architect view at start | revision `rev/1:ae43380e-9ce1-4724-9521-9915b7aad94c:1`, input `input/1:6eedf35a…4ab6424`, limits `cut: 9`, `detailsUnavailable: 2` |
| Baseline `B` | `ms-0001`, `scope-size/1`, a real `ramify.measure/1` document at that revision |
| Entry assignment | `reviewer-identity` → `collection-review/workspace/reviews` |
| Outline | Revision 1: `staged`, "The outcome has four kinds of reader, and each boundary must compile and pass." Two `breakingChanges`: `reviews.run`'s request and answer (consumers `reviews`, `ui`, `workspace`, the root, `integration-tests`), and `ReviewResultProps` (consumer `ui`). Three stages: non-breaking, breaking, breaking. Revision 2 at completion |
| Iterations | `wi-001.i01` `ordinary`, stage 0, scope `workspace/contracts/src`; `wi-001.i02` `breaking`, stage 1, explicitly broad over `reviews/core`, `reviews`, `reviews/ui`, `workspace`, the root and `integration-tests`; `wi-001.i03` `breaking`, stage 2, broad over `reviews/ui` and `reviews/ui/pure-ui`. All three `accepted` |
| Gate attempts | See the table below. Six attempts, six passes, no repair round, no infrastructure retry |
| Commits | `1a3a661` (i01), `a999645` (i02), `2023cb5` (i03), each with its gate trailer; see [`branch.txt`](reviewer-identity/branch.txt) |
| Final state | `job-completed` with a passing final gate; `failure: null` |
| Write-scope verification | 20 modified, 0 added, 0 deleted; all 20 inside a recorded write scope; 0 outside; **0 defects**; `git status` clean ([`verification.txt`](reviewer-identity/verification.txt)) |
| Observations | 22 guarded `write` calls, all `allowed`, none blocked; 22 hook checks `changed`/`passed`; 3 snapshot mutations; no shell call; `outsideScope` empty on every invocation; coverage gaps: 8 `usage-unavailable`, 8 `context-unavailable`, 3 `unsupported-runner` |

| Attempt | Checkpoint | Subject | Commands, each `passed`, exit 0 | Verdict |
| --- | --- | --- | --- | --- |
| `ga-0001` | readiness | the run | `npm test`, `npm run type-check`, `ramify check --batch` | passed |
| `ga-0002` | iteration | `wi-001.i01` | Vitest over `contracts`' 1 test file, type check, complete Ramify check | passed, commit `1a3a661` |
| `ga-0003` | breaking-iteration | `wi-001.i02` | `npm test`, type check, complete Ramify check, and the probe over the scope's 9 test files | passed, commit `a999645` |
| `ga-0004` | breaking-iteration | `wi-001.i03` | `npm test`, type check, complete Ramify check, and the probe over 3 test files | passed, commit `2023cb5` |
| `ga-0005` | work-item | `wi-001` | `npm test`, type check, complete Ramify check | passed |
| `ga-0006` | final | the run | `npm test`, type check, complete Ramify check | passed |

## Trial record: `review-notes` with pi (T2)

Not run: no pi login. See [review-notes/NOT-RUN.md](review-notes/NOT-RUN.md)
for what was checked and the commands a person runs.

## The reviewer's questions

Answer each from the retained records first, then compare with the agent's
observations below.

### 1. Decisions

The initial analysis, the outline and its breaking-change declarations, the
scope choices, and the stages. In `reviewer-identity` read
`run/analysis/`, `run/work-items/wi-001/outline/1.json` and the three
`assignment.json` files.

| Decision | Recorded as | Right? Why |
| --- | --- | --- |
| | | |

- Would you have staged the break the same way (three stages, the surfaces and every caller in one boundary)?
- Is an explicitly broad scope that names the root module an acceptable write scope (see observation 3)?
- What decision is missing from the records that you needed:

### 2. The work

The source each accepted iteration committed, on the run branch.

| Iteration | Commit | Does the change do what its assignment says? | Anything outside what it needed? |
| --- | --- | --- | --- |
| | | | |

- Does the final state meet `reviewer-identity`'s acceptance (tRPC answers the reviewer, MCP binds it, the panel shows name and role, no plain reviewer field)?
- Is `status-badge-tone`'s one iteration the right size?

### 3. The checks

The gate attempts above, their output files under `run/gates/`, and the
verification.

| Question | Answer |
| --- | --- |
| Was every accepted boundary green in the sense you require? | |
| Is a scoped gate at a non-breaking boundary enough (observation 1)? | |
| Is the Cucumber suite's absence from every gate acceptable (observation 5)? | |
| Does the write-scope verification convince you that the loop respected the project? | |

### 4. The metrics

`run/measurements/`, the invocations' `observations.jsonl` and the Run
page's Measurements area on a served copy.

| Question | Answer |
| --- | --- |
| Is a run whose token usage and context are all `unavailable` (scripted agent) evidence of anything about cost? | |
| Is the guarding statement (edit and write guarded, shell unguarded and observed) stated clearly enough? | |
| Which metric would you want first from a real pi run? | |

## The reviewer's verdict

- Accept the trials as evidence for T3 and for the small-plan case, or not:
- Is T2 required before Plan 3 is called complete, and who runs it:
- The depth 4 or 5 question for nested-package discovery:
- The 28 union values with no producer: keep in the vocabulary, give producers, or remove:
- What the next plan should change first:

## The agent's observations

Kept apart from the verdict above, which stays blank for the person. Each is
a fact read from the records or from a command, and says where it came from.

1. **Stage 0's boundary was not an all-project gate.** `wi-001.i01` is an
   `ordinary` iteration, so its checkpoint is `iteration` with an
   `owned-by-scope` selection: one test file of `contracts`, plus the type
   check and the complete Ramify check over the whole project. The plan's
   checkpoint table says so. The two breaking boundaries ran `npm test` over
   the whole project. So T3 has a passing all-project gate at every
   *breaking* boundary, and at stage 0 a scoped one. Independently of the
   harness, the kept copy was checked out at each of the three accepted
   commits in part 2's first T3 run (`fa7a9de`, `42f9526`, `adfc556`). At
   each one the fixture's whole `npm test` passed (20 files; 79, 85 and 86
   tests), `npm run type-check` exited 0 and `ramify check --batch` passed
   with complete coverage. That is this agent's check, not a gate the
   harness recorded.
2. **The trial's own last check was wrong, and was corrected.** The first T3
   run in part 2 completed the run with every gate passing, then failed the
   test's final assertion. That assertion grepped for
   `reviews.run.mutate({ recordId` to prove no caller omits the reviewer.
   The substring also matched the correct production call
   `mutate({ recordId, reviewer })` and two tests asserting that a call
   without a reviewer is refused. The check now examines every call site: it
   must name a reviewer, or be a call the project asserts is refused
   (`@ts-expect-error` above it or `.rejects` around it). Against the
   fixture's baseline the corrected check flags all 9 callers that omit the
   reviewer; against the final state it flags none. The retained evidence is
   from the second run, with the corrected check, which passed.
3. **An explicitly broad scope resolves each named module to its whole
   directory.** `wi-001.i02` names the root module `collection-review`, so its
   `scope.resolved.roots` contains the project root, and the guard would have
   allowed a write anywhere in the project, including `pure-ui`, which stage 1
   did not name. The verification attributes the `pure-ui` files that stage 2
   wrote to `wi-001.i02` for that reason: it names the first recorded scope
   that contains a path. All 22 writes were allowed, and none went outside
   the modules each stage meant to change. But with a real model, a broad scope that
   names the root puts no bound on where it can write. The code is
   `subs/harness/src/work/scope.ts`, the `else` arm over `base.modules`.
4. **Zero blocked calls is not evidence of scope compliance.** No call was
   blocked in either trial, and the scripted agent used no shell. `edit` and
   `write` were guarded; `shell` is unguarded, and only `git status` at
   settlement, `outsideScope` and the `unguarded-shell` gap observe it. A real
   model's use of the shell is untested by these trials.
5. **The Cucumber suite is recorded as a gap on invocations, not on gates.**
   The fixture's `test:cucumber` is outside the one supported runner. Its
   `unsupported-runner` gap was recorded once per engineer invocation (3 in
   T3, 1 in `status-badge-tone`). No `GateAttempt` records it, although the
   main plan says every gate over the fixture should. `GateAttempt` has no
   field for a gap. Stage 1 changed the suite's step file
   (`collection-review.steps.ts`). This agent ran `npm run test:cucumber` at
   the final commit of part 2's first T3 run: 1 scenario, 12 steps, passed.
   No gate ran it.
6. **Settlement reports `groupsKilled: 0` on every invocation.** That is so
   by construction: no process group is registered with the writer
   (iteration 7). It does not mean that no runaway process group existed.
7. **The metrics of these runs say nothing about cost.** The scripted agent
   reports no usage and no context, so every token and context metric is
   `unavailable` (16 gaps in T3). `B` and the scope sizes are real
   measurements.
8. **Decomposition was not imposed on the small plan.** `status-badge-tone`
   recorded `single-iteration` with one assignment, one accepted iteration
   and one commit. The scripted architect chose that, so it shows that the
   harness accepts a single iteration without forcing stages. It does not
   show that a real architect would choose it.
