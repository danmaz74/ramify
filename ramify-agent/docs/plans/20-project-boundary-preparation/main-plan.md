# Plan 20: project-boundary preparation under the current pins

**Date:** 2026-10-04. **Status:** implemented. See [final results](final-results.md) for acceptance evidence and the full-audit reference.
The user decisions below are accepted, and the obsolete `spikes/` tree was
removed on 2026-10-04. The
user asked for this plan on 2026-10-04: do in ramify-agent what the
project-boundary migration needs and what does not depend on the updated
Ramify or the updated ramify-audit, while Ramify's Phase 1 is still being
implemented and ramify-audit's source is being recovered.

This plan is not Phase 3 of the project-boundary sequence. Phase 3's detailed
plan is still authored from the two provider handoffs. This plan removes from
it the work that needs neither provider. The sequence's rule that a consumer's
implementation waits for its provider's handoff is kept for everything else;
[what waits](#what-waits-for-the-providers) lists it.

An earlier draft at `docs/plans/20-project-boundary/` was removed on
2026-10-03 and is not a starting point.

## Outcome

With `ramify.ts` 0.1.0 and `ramify-audit` 0.3.2 still pinned:

- The harness gives every engineer iteration a module scratch directory with
  the lifetime the [harness specification](../../harness.spec.md#scratch-has-the-iterations-lifetime)
  defines, keeps it out of Git, and removes it at closure and at readiness.
- The harness's own readers of a module header accept the root marker,
  `root module <name>`, as well as today's `module <name>`.
- Every test that writes a root description does so through one helper, so
  that Phase 3 adopts the marker by changing that helper and the four
  committed root descriptions.
- The fixture projects live beneath the harness module, where Phase 3 declares
  them, and the project's compiler and runner configurations exclude them and
  scratch.

Nothing in this plan changes a pin, a provider adapter, the write scope, test
selection by ownership or the audit request.

## Constraints

- Work on a branch from `ramify-agent`, in its own worktree. Ramify's Phase 1
  branch does not touch `ramify-agent/`, so the two do not conflict.
- `docs/harness.principles.md`, `docs/harness.spec.md` and every other
  `.principles.md` or `.spec.md` file are read-only for implementation agents.
  A needed change is proposed to the user with the exact patch.
- Tests use the scripted `GitService` helpers and never rebuild a repository
  where a script suffices. No test makes a real model call.
- Agents never run the complete suite. Each iteration runs the test files it
  names. The complete suite runs only through the project's audit, once before
  iteration 1 and once at the final gate:
  `ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --json`
  from the repository root, on a clean commit.
- `npm run check:self` and `npm run type-check` pass at every iteration's end.

## Current state

Verified in the checkout at `33d8a739`:

- There is no scratch handling. The only `.gitignore` the harness writes is
  the one inside its own state directory
  (`subs/harness/src/store/state-directory.ts`). No prompt mentions
  temporary files.
- A path beneath `<module>/src/tmp/` is already inside an assigned module's
  write scope (`subs/harness/src/work/scope.ts`).
- An accepted candidate is committed with `git add --all`
  (`subs/harness/subs/evidence/src/git.ts`), so an unignored scratch file
  would be committed and audited.
- Engineers work in the project's working directory; there is no engineer
  worktree. `engineerWorkingDirectory`
  (`subs/harness/src/work/engineer-directory.ts`) is the one place both the
  run and the single-session path prepare a module's `src/`.
- `closeIteration` in `subs/harness/src/run/service.ts` is the one place an
  iteration closes. A run that fails, stops or is interrupted leaves its
  iteration open.
- Readiness (`subs/harness/src/run/readiness.ts`) requires a clean working
  tree first, runs the baseline checks in place and creates the run branch
  last. A failed or interrupted attempt is retried from the clean-tree step,
  so anything readiness leaves uncommitted blocks the next attempt. Nested
  packages are captured before readiness, by a walk in
  `subs/harness/src/run/policy.ts`.
- Scenario materialization, which follows readiness, is a ledger effect that
  writes files, commits them with its own trailer and recovers from an
  interruption on either side of the commit (`performMaterialization` in
  `service.ts`).
- A single session (`subs/harness/src/sessions/single.ts`) never runs
  readiness and never commits.
- `GitService` (`subs/harness/subs/evidence/src/git.ts`) has change queries
  only. It cannot list tracked files, which a change query misses when they
  are unchanged, and it cannot ask Git whether a path is ignored.
- Three readers match the header with `^module\s+` and so miss a root that
  carries the marker: `moduleHeader` in
  `subs/harness/src/run/project-config.ts`, `candidateModuleIndex` in
  `subs/harness/src/reviews/signals.ts` (which then returns no modules at
  all) and `readDeclaredTree` in
  `subs/harness/src/tests/helpers/iterations.ts`.
- `ramify.ts` 0.1.0 rejects `root module <name>` as an unknown statement, so
  no committed description can carry the marker before the pin changes.
- Fourteen test files and helpers write a root description as literal text.
- `fixtures/` holds three projects. Tests reach them through
  `subs/harness/src/tests/helpers/fixture.ts` and `helpers/capability.ts`,
  and four other places name the path directly.

## Decisions

Decided in this plan, because one answer is clearly safer:

1. **Ignoring is verified with Git, not by reading the file.** A rule's text
   proves nothing: a later exception such as `!src/tmp/`, or a `.gitignore`
   in a nested directory, overrides it, and scratch would then enter the
   candidate through `git add --all`. The harness asks Git whether each
   module's scratch directory is ignored, and treats only that answer as
   ignored.
2. **One general rule, appended, never rewritten.** Setup does not stop at
   the modules that exist: a root-only project that ignores `/src/tmp/`
   covers no module added later. Whenever the project's root `.gitignore`
   has no line `**/src/tmp/`, the harness appends that line, whatever the
   current modules' status, so that later modules are covered. It then asks
   Git about every current module. When some module's scratch is still not
   ignored, or the line was already present and is overridden, the harness
   changes nothing further and reports a conflict naming the file and line of
   the overriding rule, as Git reports it. It never edits, reorders or
   duplicates a project's rules.
3. **In a run, setup is a recoverable effect after readiness.** Readiness
   itself writes nothing to `.gitignore`. Once readiness has passed and the
   run branch exists, a ledger effect appends the rule, verifies it and
   commits it with its own trailer, before scenario materialization and
   before any iteration, following that step's pattern. A project that
   already has the line, with every module's scratch ignored, gets no
   commit. A conflict restores
   `.gitignore` to its committed content and fails the run as an environment
   problem before any work.
4. **A single session prepares for itself and commits nothing.** Before its
   engineer starts, a session applies the same tracked-file check and the
   same verified rule. An appended rule stays uncommitted in the working
   tree, with the engineer's changes, and the session's result reports it as
   the harness's change, not the engineer's. A conflict or a tracked scratch
   file refuses the session before the agent starts.
5. **Scratch is verified at each point where it matters, not once.** A check
   before the engineer starts proves nothing about what the engineer then
   does: it can write `src/.gitignore` with `!tmp/`, or stage a scratch file
   by force. The harness asks Git again at three points:
   - **Before creating a module's scratch directory.** If it is not ignored,
     the engineer is not started and the conflict is reported.
   - **Before every candidate tree is taken and before every commit.** If any
     module's scratch is not ignored, or any path beneath a scratch
     directory is in the index, the gate fails with a finding naming the
     rule or the paths, and the engineer repairs it like any other gate
     failure. Nothing is committed or audited from such a tree.
   - **Before every removal**, under decision 6.
6. **Tracked files beneath a scratch directory are never deleted.** Every
   removal first lists the paths beneath scratch that are in the index,
   including files staged during the session. Readiness checks all scratch
   before any deletion; if any tracked paths exist, it names them and stops,
   deleting nothing. A single session's preparation likewise refuses tracked
   scratch before deleting anything. At closure or a session's end, cleanup
   preserves and reports tracked paths and removes the remaining eligible
   scratch under D1; the next readiness stops on the tracked paths. This
   covers files that are committed and unchanged and files newly staged.
7. **Git questions go through `GitService`.** The evidence module gains two
   operations and exposes them to the harness: the tracked paths beneath
   given directories, read from the index, and the ignore status of given
   paths with the source of the deciding rule. Every scripted adapter in the
   test helpers gains them, and an unscripted call fails as the others do.
8. **Walks skip scratch.** Nested-package discovery, readiness test discovery
   and the scoped test-selection walk do not enter a scratch directory.
9. **Compiler exclusions stay the project's.** The harness does not check a
   target project's compiler configuration for a scratch exclusion. Until the
   updated Ramify warns about compiler-selected source in scratch, a project
   without the exclusion sees its scratch files in the write hook and in
   type checks. This is a stated limitation.

User decisions accepted on 2026-10-04:

- **D1: scratch has its generating iteration's lifetime.** Scratch survives
  as long as the iteration that generated it is not finished, including
  suspension while nested capability iterations run and close. A closure
  removes scratch only from modules with no iteration still open, subject
  to decision 6's protection of tracked paths. The harness specification
  now records this lifetime and the cleanup rules.
- **D2: delete the obsolete `spikes/` tree now.** The tree and its executable
  probes have been removed, and documents retain the historical findings
  without links to deleted files. Conceptually, `spikes/` is an
  `owned-ignored` directory; deletion does not change that classification.
  If reintroduced, declare it `owned-ignored` when Phase 3's provider syntax
  is available. The separate `docs/spikes/` evidence remains.

## Iterations

Each iteration ends with its named tests, `check:self` and `type-check`
passing, and a results file beside this plan recording the commit, the
commands run and their outcomes.

### Iteration 1: header readers accept the root marker

- Give the three readers one shared recognition of the header statement, with
  an optional `root` prefix, quoted and unquoted names and the `tagged` list.
  The harness's reader lives in the harness; the test helper uses it.
- Add a `rootDescription` test helper that renders a root description, and
  use it at every test site that writes one as literal text. It renders
  today's form; Phase 3 changes it to the marker.
- Tests: the readers on both forms of a root header, with children, a quoted
  name and tags; a root with the marker keeps its children's name paths and
  its own test area; `candidateModuleIndex` returns the whole tree.
- No committed `module.ramify` changes.

### Iteration 2: scratch operations

- Add the two `GitService` operations of decision 7 to the evidence module,
  its `gitService` object and its exposure to the harness, and to every
  scripted adapter: `mock-git`, `scripted-git`, `gate-git`, `recovery-git`
  and `contracts-git`.
- Add one harness-internal unit that owns scratch: the scratch path of a
  module; the tracked files beneath scratch directories; whether scratch is
  ignored, and the conflict when it is not; appending the rule under
  decision 2; creating a module's scratch directory; and removing the
  scratch directories of a set of modules.
- Make the three walks of decision 8 skip scratch.
- Tests of the two Git operations, against one real repository built once for
  the file: an unchanged committed file and a newly staged file beneath
  scratch are both listed; a path is reported ignored, not ignored, and not
  ignored with the overriding rule's file and line.
- Tests of the unit, with scripted Git answers: the rule is appended to a
  missing, empty and populated `.gitignore`, other lines unchanged byte for
  byte; a root-only project that ignores `/src/tmp/` still receives the
  general rule; nothing is appended when the line is present;
  a later `!src/tmp/` exception and a nested `.gitignore` each produce a
  conflict and no second copy of the rule; creation is idempotent; removal
  covers the root and nested modules and leaves everything else; each walk
  ignores a scratch directory holding a manifest and a test file.

### Iteration 3: setup and safety before any scratch is used

No scratch directory is created yet. This iteration makes every path that
will create one safe first.

- Readiness, before its clean-tree step: fail with the tracked paths under
  decision 6, deleting nothing; otherwise remove untracked scratch left by
  an earlier run. Readiness writes nothing to `.gitignore`.
- The run's setup effect of decision 3, between readiness and scenario
  materialization, with its recovery.
- A run resumed after readiness passed does not repeat the cleanup.
- A single session's preparation under decision 4, and its result reporting
  an appended rule as the harness's change.
- Tests for runs: stale scratch from a failed, stopped and interrupted run is
  removed and readiness passes; tracked scratch, unchanged or newly staged,
  fails readiness and nothing is deleted; a readiness attempt whose baseline
  fails leaves the tree clean and the next attempt passes its clean-tree
  step; a project without the general rule gets exactly one setup commit
  holding only the `.gitignore` change; a project that has the rule, effective for
  every module, gets none; a root-only project that ignores only `/src/tmp/`
  gets the general rule; an interruption before the setup commit and one after it each
  recover to exactly one commit; each of the two conflicts fails the run
  before any iteration and leaves `.gitignore` as committed.
- Tests for single sessions: a project without the rule ends with the rule
  uncommitted and reported as the harness's change, and no commit; tracked
  scratch and each conflict refuse the session before the agent starts.

### Iteration 4: scratch through the iteration lifecycle

Requires iteration 3; D1 is accepted.

- `engineerWorkingDirectory` verifies under decision 5 and creates the
  assigned module's scratch directory, for run iterations and single
  sessions.
- Every gate, in a run and in a single session, verifies under decision 5
  before it takes the candidate tree, and the accepted commit verifies again
  before it stages.
- Every removal lists tracked paths first, under decision 6.
- `closeIteration` removes scratch according to D1, for every outcome. A
  single session removes its module's scratch when it ends, before its gate
  reads the tree.
- A resumed or replayed iteration finds its scratch as it left it.
- The engineer's system prompt and procedure say where throwaway files go and
  that nothing there outlives the iteration.
- Tests of the lifecycle: scratch exists when the engineer starts; it
  survives a repair, a correction and a resumed suspended iteration; it is
  gone after each of the closing outcomes; on a project that had no general
  rule before the run, an accepted commit and its audited tree contain no
  scratch file; a nested capability iteration's closure follows D1; a
  resumed run keeps its open iteration's scratch.
- Tests of a module added during the run: in a root-only project that
  ignored only `/src/tmp/`, a child module created by the run has ignored
  scratch and its engineer starts.
- Tests of changes during the active session: an engineer that writes
  `src/.gitignore` with `!tmp/` gets a failed gate naming that rule, nothing
  is committed, and the gate passes once the rule is removed; an engineer
  that stages a scratch file by force gets a failed gate naming the path;
  at closure that staged file is kept and recorded, the untracked scratch
  around it is removed, and the next readiness stops on it; the same two
  cases in a single session, whose end keeps and reports the staged file.

### Iteration 5: the project's own layout

D2's spike deletion is already complete.

- Add the scratch rule to the project's `.gitignore` and exclude scratch from
  `tsconfig.json`, `subs/web/tsconfig.json` and both Vitest projects. Add the
  compiler exclusion to the three fixture projects.
- Probe first, on a throwaway copy: move `fixtures/` to
  `subs/harness/fixtures/`, exclude it from the compiler and runner
  configurations, and run `check:self`, `type-check` and the audit's module
  selection with the current pins. If any of them reports the moved projects
  as layout errors or selects their source, stop, record the observation and
  leave the move to Phase 3.
- If the probe passes, make the move and update the two helpers and the four
  direct references, including `scripts/live-trial.ts`.

### Final gate

On a clean commit, the project's audit passes in full. The results file
records the audit reference, each acceptance case below with its evidence and
any limitation found.

## Acceptance

| Case | Statement | Iteration |
| --- | --- | --- |
| PB-A01 | Each header reader gives the same module tree for a root written `module <name>` and `root module <name>`. | 1 |
| PB-A02 | No test writes a root description except through `rootDescription`. | 1 |
| PB-A03 | Scratch counts as ignored only when Git reports it ignored; a later exception and a nested `.gitignore` are each reported as a conflict naming the overriding rule. | 2 |
| PB-A04 | Appending the rule never duplicates it and never alters another line. | 2 |
| PB-A05 | Nested-package discovery, readiness test discovery and scoped test selection report nothing from a scratch directory. | 2 |
| PB-A06 | Readiness removes untracked stale scratch and fails, deleting nothing, on tracked scratch, whether unchanged or newly staged. | 3 |
| PB-A07 | A failed or interrupted readiness attempt leaves no uncommitted harness change, and the next attempt is not blocked by one. | 3 |
| PB-A08 | A project without the general rule receives one harness setup commit containing only the rule, also after an interruption before or after that commit. | 3 |
| PB-A09 | A conflict stops a run before any iteration and a single session before its agent starts, with the project's ignore files unchanged. | 3 |
| PB-A10 | A single session never uses unignored scratch, never deletes a tracked file and never commits. | 3, 4 |
| PB-A11 | The assigned module's scratch directory exists and is ignored when its engineer starts, in a run and in a single session, including for a module the run created. | 4 |
| PB-A12 | Scratch survives repairs, corrections and the resumption of a suspended or interrupted iteration. | 3, 4 |
| PB-A13 | After an iteration closes, with any outcome, no scratch directory remains except for an iteration still open under D1 or tracked paths preserved and reported under decision 6. | 4 |
| PB-A14 | No accepted commit and no audited tree contains a scratch file, on a project that had no rule before the run and when the engineer exposes or stages scratch during its session. | 4 |
| PB-A15 | No removal deletes a path that is in the index, including one staged during the session. | 4 |
| PB-A16 | The project's audit passes in full on the final commit, with the fixtures where iteration 5 left them. | Final |

## What waits for the providers

Phase 3 keeps all of the following, with the reason each cannot start now:

- **The pins, the root marker in committed descriptions and target projects.**
  `ramify.ts` 0.1.0 rejects the marker.
- **Whole-tree module scope and explicit inclusion of owned-ignored trees,
  with their instructions.** The declared trees come from the updated Ramify.
- **Relaying the not-analyzed answer through the write hook.** The answer
  does not exist yet.
- **Removing the `outside-modules` purpose, its per-file suites and the
  hook's warning suppression.** Ramify 0.1.0 owns nothing outside `src/` and
  still emits the warning those pieces exist for.
- **Scoped test selection by ownership.** It must match the updated audit's
  recipe.
- **Replacing the nested-package walk and readiness tests with the audit
  configuration's package directories.** `ramify-audit` 0.3.2 exposes no way
  to read its configuration, the harness overrides the configuration's
  workspace section on every request, and the package directories do not say
  which packages have tests. This needs the Phase 2 audit.
- **Declaring fixtures `owned-ignored` and `scripts/` as root-owned analyzed
  code.** The statements and the analysis are new. A reintroduced `spikes/`
  tree also belongs to its owner as `owned-ignored`, under D2.
- **The shared-input audit policy and nested audits at the final gate.** Both
  are Phase 2 audit features.
