# Plan 7: Commit-audit integration

**Date:** 2026-09-21. **Status:** implemented; completion gate verified.

A gate that commits becomes an audit of that commit. The harness commits the
working directory on the run branch, and
[ramify-audit](https://github.com/danmaz74/ramify-audit) checks that exact
commit out in a temporary worktree, runs the checkpoint's checks there and
publishes evidence bound to the commit. The harness still runs every command
itself, through an executor it registers with the audit, so what a
`GateAttempt` records does not get poorer.

This discharges the former standalone commit-audit future item and replaces
Plan 3's checks-then-commit stand-in with its implemented
[commit, then audit](../03-autonomous-implementation-loop/core-records.proposal.md#commit-then-audit)
contract.

## Why

- **A pass was bound to nothing before this plan.** The gate ran in the working
  directory and the commit followed. No record tied the verdict to the tree
  that was committed, by design of the MVP.
- **The tool exists.** ramify-audit `0.1.0` is published; it was extracted from
  cucumber-viz, whose audit Plan 3 deliberately did not copy.
- **It is not a body swap.** Plan 3 expected the tool to replace the body of
  `runGate` and nothing else. Reading both sides shows five things that do not
  fit, listed under [verified facts](#verified-facts). The plan exists because
  of them.

## Runnable outcome

```text
engineer proposes completion, and is idle
  -> the harness verifies the commands and compares the guarded files
  -> the harness commits the working directory on the run branch
  -> ramify-audit checks that commit out in a temporary worktree,
     with node_modules linked, and asks the harness to run each check there
  -> evidence is published to refs/audited/* and refs/notes/audit
  -> the attempt records the verdict, the commit and the evidence refs
  -> failed: diagnostics return for repair; the next attempt is a new commit
```

After a run with one repair round:

```sh
git log --format='%h %s' ramify-agent/run-<id>      # two commits for that iteration
git notes --ref=audit show <first>                  # Audited-Overall: fail
git notes --ref=audit show <second>                 # Audited-Overall: pass
npx ramify-audit check-branch ramify-agent/run-<id> # exits 0
```

## Scope

**In.** The `iteration`, `contract`, `breaking-iteration`, `work-item` and
`final` checkpoints; the commit-then-audit order and its ledger effects; the
registered executor and the path rebasing it needs; the harness's own
workspace preparation; the `GateAttempt` schema revision; every consumer that
reads the run branch's head as the last accepted commit; a conformance suite
that pins the library's behavior.

**Out.**

- The `readiness` gate and the single engineer session's `--gate`. Neither
  commits, so both keep running in the working directory. A baseline audit at
  readiness is a [known interaction](#known-interactions).
- Module-scoped selection. The audit runs with `full@1` over the checks the
  harness resolved. ramify-audit's own
  [Plan 1](https://github.com/danmaz74/ramify-audit/blob/plan/module-scoped-audits/docs/plans/01-module-scoped-audits/main-plan.md)
  owns scoping.
- The audit queue, socket listener, worker child and CLI. The harness calls
  the library in process.
- Merging the run branch anywhere, and squashing its failing commits.

## Decisions

| ID | Decision | Reason |
| --- | --- | --- |
| D1 | **Commit, then audit. A failed gate leaves its commit on the run branch.** Decided by Dan, 2026-09-21. | The audit certifies a commit, so the commit precedes the verdict. The branch is the harness's own, and the repair is the next commit. |
| D2 | **The harness makes the commit and passes it as `existing-commit`.** | `commitAccepted` keeps its identity, `--no-verify`, the run-branch guard and the `Ramify-Gate` trailer. The library's `create-commit` source would use the person's identity and hooks. |
| D3 | **Every check is a registered executor that calls the harness's own `runCommand`.** | The library's command checks record no exit code and inherit the whole process environment. See facts 1 and 2. |
| D4 | **Guarded files and harness rules become one registered check.** | Otherwise the evidence says `pass` for a gate the harness failed, and `check-branch` would disagree with the ledger. |
| D5 | **The harness supplies its own workspace preparation.** | The library's `nodejs` preparation links only the repository root's `node_modules`. See fact 5. |
| D6 | **Always an isolated worktree.** | It costs one `git worktree add` and one symlink; nothing is installed. `existing-worktree` mode is not used. |
| D7 | **An attempt that cannot be verified makes no commit and no audit.** | `verifyChecks` refuses before anything runs, as today. Nothing ran, so there is nothing to bind evidence to. |
| D8 | **`full@1`, with a universe that names the checkpoint and the selection.** | An `owned-by-scope` iteration gate runs a narrowed test command. Its evidence must not read as an audit of the repository. See fact 9. |
| D9 | **"Last accepted commit" is the `audited` hash of the latest passed committing checkpoint in the ledger.** | With D1 the head of the run branch may be a failed attempt; a successful unchanged retry accepts that commit without making another. |
| D10 | **ramify-audit is pinned to an exact version and only one new module imports it.** | It is AGPL-3.0-only; ramify-agent is GPL-3.0, which section 13 of both licenses lets combine. One importer keeps the seam a port. |

## Verified facts

Read from ramify-audit at `919582c` and from the harness on 2026-09-21. Each
is pinned by a conformance test in iteration 1, so an upgrade of the library
re-verifies it.

| # | Fact | Where | Consequence |
| --- | --- | --- | --- |
| 1 | A command check's result has `passed`, `status` and a `runnerError` kind, and **no exit code**. | `check-runner.ts` `runCommandFromSpec` | The harness reads `ramify check` exiting 2 as not verified, never failed (`gate.ts` `classify`). Only its own runner can keep that. D3. |
| 2 | A command check inherits `process.env` without `NODE_OPTIONS`. | `check-runner.ts` `cleanEnvironment` | The harness spawns with an allowlist and records names only (`childEnvironment`). D3. |
| 3 | A registered executor receives the repository worktree root as `workingDirectory` and returns an `AuditCheckSummary`; a handler failure, a malformed result and a cancellation are explicit results. Check IDs must be unique. | `check-dispatcher.ts` `executeRegistered`, `check-registry.ts` `orderChecksByDependencies` | The bridge for D3 exists through `registeredExecutors`. Preserve the project's repository-relative prefix and assign IDs per planned check, not per kind. |
| 4 | Evidence is published with plain `git commit-tree`, and the library's git executor inherits `process.env`. | `publication.ts` `createCommit`, `git.ts` | With no configured identity publication fails. The harness injects a git executor carrying its own identity. |
| 5 | The `nodejs` preparation links `<repositoryPath>/node_modules` to the worktree's root and runs `npm run build` when the script exists. It has no other link paths. | `workspace-adapters.ts` | A project that is a subdirectory of its repository, or has nested packages, is prepared wrongly. D5; `workspacePreparation` is injectable. |
| 6 | The audit runs every selected check even after one fails, and stops only on cancellation. | `audit-service.ts` run loop | Same as `runGate`. No change. |
| 7 | A repository lease, keyed by the git common directory, is held from before source resolution through publication. | `execution-lease.ts` | Another audit of the same repository blocks a gate. The run's gate callers pass no `AbortSignal` today, so a blocked gate would wait without bound. |
| 8 | The worktree is removed in `finally`. A killed process leaves its directory and registration behind; `git worktree prune` retains a registration whose directory still exists. | `audit-service.ts` `createExecutionWorkspace`; real Git recovery probe | Recovery explicitly removes abandoned worktrees identified by durable ownership records, after establishing that their audit is inactive. Pruning alone is insufficient. |
| 9 | `check-branch` reads `overall` and the applicability policy, and ignores the coverage envelope. | `branch-applicability.ts` `getBranchAuditStatus` | A passing narrowed audit reads as a passing branch. The harness never reads `check-branch` for a verdict, and the universe and claim say what ran. Fixed at the source by ramify-audit's Plan 1. |
| 10 | The run ref is named by second and short hash and is overwritten on a collision; the by-tree ref and the commit's note always name the latest audit. | `refs.ts`, `publication.ts` | An infrastructure retry of the same commit replaces its note. The attempt record, not the note, is the harness's history. |
| 11 | A cancelled or failed audit publishes nothing. | `audit-service.ts` `catch` | The commit then has no evidence; the attempt is not verified and the retry audits the same commit. |
| 12 | `selector` is required and must be `full@1` unless a selector is injected. | `audit-service.ts` | D8. |

From the harness:

| # | Fact | Where | Consequence |
| --- | --- | --- | --- |
| 13 | Every check command is built once from `projectRoot` and frozen in the run policy: an absolute `cwd`, an absolute `node_modules/.bin/vitest`, and `ramify check --root <projectRoot>`. Resolved test files are project-relative. | `run/policy.ts`, `checks/selection.ts` | The executor rebases project paths onto the project directory within the repository worktree, using the same mapping as preparation. |
| 14 | The only output read for paths is the Ramify JSON report, whose files are project-relative, compared with a project-relative write scope. | `checks/diagnostics.ts` `ramifyAttribution` | Attribution is unchanged once `--root` is rebased. |
| 15 | Output tails reach the engineer's repair briefing and the web page. | `diagnostics.ts` `gateDiagnostics`, `projections/work.ts` | A stack trace would name the deleted worktree. The executor reverses the repository-to-worktree mapping in the log and the tail, preserving the project's prefix. |
| 16 | Attempt logs live in the run's state directory, which is ignored and so is absent from the worktree. | `run/records.ts` `gateOutput` | Logs keep their place; `output.path` stays valid. |
| 17 | The ledger effect is: attempt record with `commit: null`, then the commit, then the record again with the commit. | `service.ts` `commitGate` | The order inverts: the commit is an effect of its own, before the attempt exists. |
| 18 | Eleven places read the head of the run branch as the last accepted commit: line KPIs, writer and mutation accounting, module notices, `Invocation.base`, the architect briefing, projections and the recovery table's trailer count. | listed in iteration 5 | D9. |
| 19 | `runGate` has two callers, `runCheckpoint` and readiness. There is no port for running the checks. | `run/gates.ts`, `run/readiness.ts` | Iteration 2 introduces the port. |

## Prerequisites

- Plans 3 and 5 as they stand on this branch. No other plan is required.
- ramify-audit `0.1.0` installable here. It is published on a private registry
  and is unscoped, and its repository builds on `prepare`; iteration 1 chooses
  between a registry entry in `.npmrc` and a git dependency pinned to a
  commit, and records the `legacy-peer-deps` interaction.

## Iterations

### Iteration 1: the dependency and the conformance suite

**Owner:** a new module `subs/harness/subs/audit`, the only importer of
`ramify-audit`. Its place and tags are confirmed with the module-architect
skill before the first file is written.

Add the pinned dependency. Write `audit-conformance.test.ts`: real
ramify-audit over real git repositories in temporary directories, with
`GIT_CONFIG_GLOBAL=/dev/null` as the run tests already use. One test per
verified fact 1 to 12, and these besides:

- an `existing-commit` audit of a commit made by `commitAccepted` publishes a
  note, a run ref and a by-tree ref, and leaves the run branch, the index and
  the working directory untouched, so `isCleanRepository` still answers the
  same;
- a project in a subdirectory of its repository, and one with a nested
  package, under the library's `nodejs` preparation: what is linked where,
  and that the executor's `workingDirectory` is the repository worktree root;
- duplicate check IDs are refused, including two checks of kind `tests`;
- two audits of one commit within a second;
- a lease already held by another process: what a waiting audit does when its
  signal aborts;
- a process killed mid-audit: what `git worktree list` and the lease look
  like, what the next audit does, and that pruning does not remove the
  abandoned directory or its registration.

**Exit:** the suite passes against the pinned version; any fact that turned out
wrong is corrected in this plan before iteration 2 starts. Anything that needs
a change in ramify-audit is filed there, not worked around silently.

### Iteration 2: a port for running the checks

**Owner:** `subs/harness` (`src/checks/`).

Split `runGate` without changing behavior: what the harness decides (guarded
files, rules, `verifyChecks`, `classify`, `verdictOf`, `causeOf`, `nextOf`)
stays; what executes the verified commands becomes a port that takes the
planned checks and answers one `GateCommandRecord` each. The in-place runner
is today's loop. `runCheckpoint` and readiness both take the port; readiness
and the single session are given the in-place runner.

**Exit:** the existing gate suites pass unchanged.

### Iteration 3: the audit runner

**Owner:** `subs/harness/subs/audit`.

The second implementation of the port, over an already made commit:

- **Request.** `existing-commit`, `full@1`, one registered check per planned
  check with a deterministic ID formed from its position in the planned list
  and its kind, such as `check-01-tests` and `check-04-tests`. Keep `kind`
  separately and map results back to the original order. Reserve
  `harness-rules` for D4. `requestId` is the gate attempt's ID, with
  `universeId` and `coverageClaim` naming the checkpoint, the selection policy
  and, for `owned-by-scope`, the resolved owners.
- **Path mapping.** Resolve the repository root and the project's relative
  prefix once. The executor's `workingDirectory` is the repository worktree
  root; the audited project root is that directory joined with the prefix.
  Preparation and execution share this mapping. For `/repo/ramify-agent`,
  the target is `<worktree>/ramify-agent`, not `<worktree>`.
- **Executor.** Rebase project paths in `cwd` and `argv`, including the Vitest
  executable and `ramify check --root`, onto the audited project root;
  project-relative test filenames stay relative to it. Match path boundaries
  and leave external executable paths unchanged. Spawn with `runCommand` and
  `checkCommandEnvironment`, write the log to the attempt's directory, reverse
  the repository-to-worktree mapping in the log and the tail, and answer an
  `AuditCheckSummary` whose `details` carry
  the exit code and the not-verified reason. The `GateCommandRecord` is built
  from the harness's own `CommandRun`, not read back from the evidence.
- **The harness check** (D4): guarded changes and rules, computed in the
  working directory before the commit, reported as a registered check.
- **Preparation** (D5): link the project's `node_modules` at the audited
  project root, and each nested package's at its path beneath that root.
  No build step; a project whose checks
  need a build declares it as a check.
- **Git.** An injected executor with the harness's identity and the child
  environment allowlist. Before forwarding `git worktree add`, it asks the
  harness to durably record the intended temporary directory and worktree
  path, repository identity, source commit, run and attempt IDs, and audit
  process identity. This covers a crash immediately after worktree creation,
  before preparation starts; the harness remains the durable-state writer.
- **Result mapping.** `completed` gives the records; `cancelled` gives
  `interrupted`; `failed` gives `runner-error` with the library's message, so
  the cause is `infrastructure` and the existing retry bound applies.
- **Signal and bound.** Every gate caller passes a signal, and waiting for the
  lease is bounded by the gate's own timeout.

**Exit:** over a temporary repository, a passing and a failing audit produce
the same `commands`, `verdict`, `cause` and `next` as the in-place runner does
over the same tree, except for the fields iteration 4 adds. A `ramify check`
that exits 2 is not verified. A failing stack trace names project paths.
An all-project gate with a scope probe executes and records both `tests`
checks under distinct IDs, preserving their attribution. A repository with
different scripts at its root and nested project proves that npm scripts,
scoped tests and `ramify check --root` all target the nested project; its
nested package resolves the prepared dependencies and its diagnostics map
back to the original project paths.

### Iteration 4: commit, then audit

**Owner:** `subs/harness` (`src/run/`).

- `GateAttempt` becomes `ramify-agent.gate-attempt/2`: `commit` is the commit
  this attempt made whatever the verdict, `null` when nothing changed;
  `audited` names the commit the checks ran over, which is `head` when nothing
  changed; `evidence` holds the run ref, the report commit and the by-tree
  ref, or `null` when nothing was published. The Zod mirror, the protocol view
  and the projections follow.
- The ledger order for a committing checkpoint: verify; effect
  `gate-commit:<id>` makes or finds the commit by its trailer; the audit runs;
  the attempt is written once, complete. A crash between the two re-audits the
  found commit after the recovery cleanup below.
- Recovery uses the durable worktree ownership records from iteration 3.
  While holding the repository execution lease, and before creating a new
  worktree, it confirms the recorded audit process is inactive and removes
  its abandoned worktree with `git worktree remove --force`, then removes
  the owned temporary directory and records cleanup completion. Cleanup is
  idempotent across missing paths, partial creation and another crash.
  Unrelated worktrees and worktrees belonging to an active audit remain
  untouched. Pruning stale registrations is supplementary, not the cleanup
  mechanism for an existing directory.
- The commit message loses its `Checks:` block, which the verdict now
  postdates, and gains the retrieval line for the note. Everything else stays.
- The recovery table's rule becomes: one commit per attempt that changed the
  tree, no trailer twice.

**Exit:** `accepted-commit.test.ts`, the recovery table and the composition
scenarios pass under the new rules, with a scenario that fails once and
repairs, and a crash point between the commit and the audit. Kill an audit
after worktree creation and during check execution: recovery removes its
directory and registration, preserves an unrelated worktree, and re-audits
the same commit. Repeat recovery after an interrupted cleanup and verify
that an active audit's worktree is never removed.

### Iteration 5: the last accepted commit

**Owner:** `subs/harness`.

Introduce one query over the ledger: the `audited` hash of the latest passed
attempt at a committing checkpoint, ordered by committed ledger events.
Fall back to the run's base only when no such attempt exists. Do not skip a
passed attempt because its `commit` is null: an unchanged retry can accept
a commit made by an earlier failed or not-verified attempt.
Move to it: `kpi/lines.ts` and
`worktreeLineChanges`, `diffNumstat`'s callers, `run/mutations.ts`,
`run/writer.ts`, `pendingModules` and `committedModules`, `Invocation.base`,
the architect briefing in `work/session.ts`, `IterationResult.commit`, the
projections and `gate-attempts-per-accepted-iteration`. Module notices are
computed between the preceding accepted boundary and the passing attempt's
`audited` hash, so a module created in a failed attempt is announced by the
attempt that passes. `IterationResult.commit` names that accepted hash even
when the passing attempt made no new commit; `GateAttempt.commit` continues
to record only the commit that attempt made.

**Exit:** a run with a failed and a repaired attempt reports the same line
counts, module notices and changed paths as the same work committed once.
Also cover an attempt that commits C but encounters an infrastructure failure,
then passes on an unchanged retry: `commit` is null, `audited` is C, the
accepted boundary and iteration result advance to C, and C's module notices
appear once. Subsequent unchanged work-item and final passes preserve C as
the accepted boundary; they neither fall back to the run base nor repeat the
module notices.

### Iteration 6: what a person sees

**Owner:** `subs/web`, `docs`.

The gate view shows the audited commit and the evidence refs beside the log
path. The harness README, Plan 3's proposal section and the future item are
updated; the future item moves out of the list.

**Exit:** the run page test covers a failed and a passed attempt of one
iteration.

## Completion gate

1. The conformance suite passes against the pinned ramify-audit version.
2. A full fixture run ends with `ramify-audit check-branch` exiting 0 on the
   run branch, and one with a repair round shows a `fail` note followed by a
   `pass` note.
3. No gate attempt at a committing checkpoint passes without published
   evidence, and none is recorded for a commit the checks did not run over.
4. No engineer-facing text names a temporary worktree path.
5. `ramify check` passes for ramify-agent, with `ramify-audit` imported by one
   module.
6. No test calls a real model; the conformance suite calls real git and the
   real library only.

## Known interactions

- **Module-scoped audits.** When ramify-audit's Plan 1 ships, `owned-by-scope`
  and the `ramify-modules@1` selector select the same thing twice. Which one
  remains is decided then. Its composition work also closes fact 9.
- **A baseline at readiness.** Auditing the clean head at `start-run` would
  give scoped audits their first baseline. It needs nested packages linked,
  which D5 provides, and is left out only to keep readiness unchanged here.
- **Linked `file:` dependencies.** `node_modules` is linked from the working
  directory, so a `file:..` dependency resolves to the checkout and not to the
  audited commit. With one idle writer the two are the same tree. They stop
  being so under
  [isolated worktree execution](../../future/README.md#isolated-worktree-execution-and-merge).
- **A lockfile changed by the engineer.** The linked `node_modules` is whatever
  the working directory installed. Comparing the lockfile's hash at the commit
  with the one at the last install is cheap and is not part of this plan.
- **Other audits of the same repository.** cucumber-viz auditing the same
  repository holds the same lease. The bound in iteration 3 turns a long wait
  into an infrastructure retry, never into a hang.
