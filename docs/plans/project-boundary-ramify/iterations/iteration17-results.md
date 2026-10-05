# Iteration 17 results: CLI boundary outputs and advisory diagnostics

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 17](iteration17.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the second
worktree, pipelined one iteration ahead of the coordinator's milestone gate on
`3b5c168f`. Cases produced here: PB1-10, PB1-20, PB1-26 and PB1-30, at the
`cli-process` evidence boundary; their final qualification remains with
iteration 20. `reference:verify` was not run: it is left to the coordinator's
gate (plans 1, 2, 5 and 2A).

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1-next`, branch `feat/project-boundary-ramify-next` |
| Base commit | `3b5c168f`, clean at assignment, dependencies installed |
| Contract revision | sha256 `contracts.md` `c6baba7d…`, `cli-invocation.spec.md` `98f8aa2f…`, `module-description.spec.md` `b21e77d8…`, `glossary.md` `1cd8cbf3…`, all unchanged (one patch proposed). Non-protected `daemon.md` `87633383…` → `5aea9ee0…`, `processes-and-clients.md` `09b36fd2…` → `f35657a7…` |
| Configuration | unchanged: `package.json` `be7f3c90…`, `package-lock.json` `cf3b14fc…`, `ramify-audit.json` `371ebef9…`, every `tsconfig*.json` and Vitest configuration; no `module.ramify` changed; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11; Git 2.39.5 (one manual process check only) |
| Changed (source) | `subs/cli/src/check-command.ts`, `format.ts`, `affected-command.ts`, `arguments.ts`, `interfaces/cli.ts`; `src/cli-process.ts`; `subs/analysis/subs/project/src/interfaces/project.ts` (type only) |
| Changed (tests, harness) | `subs/cli/src/tests/changed-command.test.ts`, `affected-command.test.ts`; `scripts/reference-harness/cli-cases.ts` |
| Changed (prose) | `README.md`, `subs/cli/README.md` (no first paragraph changed), `docs/architecture/daemon.md`, `docs/architecture/processes-and-clients.md`, `docs/development/resident-verification.md` |
| Added | `subs/cli/src/git-advice.ts`, `src/git-command.ts`, `subs/cli/src/tests/git-advice.test.ts`, `src/tests/project-boundary-cli.test.ts`, this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/iteration17/` |

## Changed behaviour

### Changed-check presentation (deliverable 1)

1. **Human output.** After the root, mode, findings, warnings and limits, one
   line per named path, then the outcome:

   ```text
   Path src/main.ts: checked (content; module app)
   Path fixture-project/src/index.ts: not analyzed (owned-ignored fixture-project; module app)
   Path notes/design.md: not analyzed (owned-non-source; module app)
   Path external-project/file.ts: not analyzed (external external-project)
   Path tsconfig.json: not checked (configuration-changed; module app)
   Outcome: checked (1 checked, 3 not analyzed, 0 not checked); checked set: …; wait: … ms; findings: N
   ```

   A not-analyzed path names its exclusion (kind and directory) when it has
   one, else its reason; reserved paths read `packages node_modules`,
   `output dist`, `generated <dir>`. Only a checked path reads as checked:
   before this slice the summary line began `Checked:` and listed excluded and
   inert paths after it. A not-checked outcome reads `Outcome: not checked
   (<reason>; …)`. A path with a control character, such as a newline, is shown
   JSON-quoted (in every warning line as well).
2. **JSON.** `ramify.check/2` is unchanged by this slice: iteration 15 already
   replaced `changed[].covered` with `paths` dispositions carrying the identity
   only for checked paths. Exit codes are unchanged from iteration 15: a
   coherent covering revision gives 0 or 1 exactly as the complete check,
   whatever paths are not analyzed; any not-checked path gives 2 with the
   verified findings retained; a classification that goes stale after its one
   retry is not checked (`classification-changed`).
3. **Affected human seed line** states the seed's status, as the specification
   requires ("each path seed states whether the path is owned, excluded or
   outside the project"): `Path p: owned by m (basis[, kind dir])`,
   `Path p: excluded (kind dir)`, `Path ../p: outside the project`. The
   `ramify.affected-cli/2` document is unchanged (iteration 14 already added
   `status` and `exclusion` to each seed).
4. **Help.** `check --changed` no longer says it hashes the named paths: the
   daemon classifies them, the CLI hashes those the classification analyzes,
   each path is checked, not analyzed or not checked, and the result is the
   complete check's. The changed-check exit wording reads "0 no findings and 1
   findings or an invalid revision, exactly as the complete check, whatever
   paths are not analyzed; 2 the result could not be established: a path not
   checked (cold, deadline, unobserved or superseded content, a named
   configuration file, or a classification that changed again)". A line states
   the Git advice. `ramify --help` and `ramify check --help` print the same text.

### Git advisory warning (deliverable 2)

5. **Port.** `CliEnvironment.git?: GitPort`, `(root, control) =>
   Promise<GitAnswer>`; `GitAnswer` is `listed` (Git's raw output bytes),
   `not-repository`, `unavailable` or `failed`. Without a port a check gives no
   advice (every existing test environment). Root's `cli-process.ts` injects the
   production port for both entries; it is root code, bundled in the compiled
   client, and loads no analysis module (the compiled-client bundle check
   passes).
6. **Production adapter** (`src/git-command.ts`, the only real Git
   invocation). It looks for `.git` (directory or worktree link file) at or
   above the selected root by `lstat` alone; with none it returns
   `not-repository` and starts nothing. Otherwise it runs
   `git ls-files --others --ignored --exclude-standard --directory -z` once,
   with `cwd` the selected root, a 5 s timeout and a 16 MiB output bound,
   inheriting the environment. ENOENT is `unavailable`; "not a git repository"
   on stderr is `not-repository`; every other failure, a timeout or an oversized
   answer is `failed`; an interrupt aborts it and the CLI exits 130 as before.
7. **Advice** (`subs/cli/src/git-advice.ts`). Git's output is split on NUL
   bytes only; each entry ending in `/` is a directory, decoded as UTF-8
   (invalid UTF-8 skipped) and kept exactly, spaces, tabs, leading and trailing
   blanks and newlines included; the root itself (`./`), empty, `.` or `..`
   segments, absolute paths, backslashes and duplicates are skipped. A directory
   is walked when, walking from the root, no rooted exclusion of the report's
   `scope.ownership` and no reserved segment is reached; the nearest module
   then owns it. Each walked directory gives one `ignored-but-walked` warning
   at that directory, with no `files` or `count`: "Git ignores this directory,
   but Ramify walks it as part of module <id>; declare it owned-ignored or
   external in that module's description if Ramify should leave it out". The
   warnings join the report's warnings in path-then-code byte order and the
   summary's warning count; outcome, findings, limits, `inputId`, scope and the
   exit code are untouched. A port that throws gives no advice.
8. **Where it applies.** Complete checks only: resident `check`, `check
   --batch` and batch fallback, human and JSON. `--changed`, `watch` and
   `affected` ask Git nothing (decision 2 below). An unresolved report (no
   scope) gives none.
9. **Classification source.** The lightweight client may load no analysis
   module (I2-19, I5-11; the compiled client's build refuses any
   `dist/subs/analysis/` input), so it cannot call `classifyProjectPath`. It
   uses the report's ownership facts for rooted exclusions and a mirror of
   Project's canonical reserved-segment rule (`.git`, `node_modules`,
   `bower_components`, `jspm_packages`, `.ramify`, `.ramify-architect` and
   their `.tmp-`/`.old-` siblings); an owner test compares the result with
   `classifyProjectPath` over 33 paths of the written topology (decision 1).
10. **Project vocabulary.** `ProjectWarning.code` gains `ignored-but-walked`,
    as iteration 8B anticipated ("not declared until something produces it");
    a type-only change in Project's interface, documented as CLI-produced.

### Root selection (PB1-30)

11. No selection code changed: iteration 3B's Project selection is qualified
    here through real built batch and resident processes.

## Document shapes and consumers

No document changes shape. `ramify.check/2` and `ramify.affected-cli/2` keep
their iteration 14–15 shapes; the "17 CLI output" extension in the schema table
consists of human output only. The complete check's `ramify.analysis/2` report
may carry a new value of the open `ProjectWarning.code` set, which the
contracts state is no shape change. Consumers: the CLI renderers and help, the
CLI owner's tests, the root process test, Plan 1's I1-28 `no-servers` handler
(below). The hook example reads the JSON document and needs no change; no
measurement script reads human output or warnings; the harness's
`session-expectations` invariant (`summary.warnings` equals the warning count)
holds with the advice.

## PB1-10, PB1-20, PB1-26 and PB1-30 through real processes

`src/tests/project-boundary-cli.test.ts` (5 tests; built Node entry; a resident
daemon in a private `/tmp/rpb-*` endpoint stopped in `afterAll`; projects in a
private temporary directory; the written topology of `fixtures.md` with `app`
marked, `a`, `grand`, `a-extra`, `b` unmarked, `fixture-project` and
`subs/a/fixtures/sample` marked ignored projects, `external-project` external):

| Test | Independent expectation |
| --- | --- |
| PB1-30 | batch and resident, human and JSON: from `subs/a/subs/grand` and `scripts` the root `app`, found; from `subs/a/fixtures/sample/src` the root `sample`, found; from `fixture-project` that project; `--root .` `app`, given; each `Root:` line and `scope.root/selection/invokedFrom`; the enclosing project owns exactly `app, app/a, app/a-extra, app/a/grand, app/b` with no error or denial; `--root subs/a` exit 1, one `unmarked-root-description` (layout) with the exact add-the-marker message; a directory with no description above exit 2 `root-not-found` naming it, no hint; beneath an unmarked `lib/module.ramify` exit 2 with the hint naming it |
| PB1-20 changed | warm resident: each of 12 paths alone and all together exit 0 with no finding: `src/main.ts` and `src/with space.ts` checked/content with a sha256; `notes/design.md`, `notes/with space.md` owned-non-source; owned-ignored `fixture-project/...` (module app) and `subs/a/fixtures/sample/...` (module app/a); external; both scratch directories; `node_modules`, `dist` (output) and `subs/b/src/.ramify` reserved, none with an identity; the human lines and outcome line; nothing reads `Checked`. An edited `tsconfig.json` beside an excluded and an inert path: exit 2 `configuration-changed`, the excluded path keeps its not-analyzed disposition, the inert one is not checked (its inertness needs a covering revision); `../outside.ts` exit 2 `unobserved-input`. With a definite violation the complete check exits 1 with one `not-visible`; a mixed request (checked, owned-ignored, inert) and requests naming only excluded or inert paths exit 1 with exactly the complete check's findings |
| PB1-20 affected | batch and resident, human and JSON: seeds byte-ordered: `../outside.ts` outside-project, `external-project/file.ts` excluded external, `fixture-project/src/index.ts` owned app with owned-ignored, `notes/with space.md` owned app containment, `subs/a/scripts/report.ts` owned app/a inventory; all-modules, `unowned-path`; the five human seed lines |
| PB1-10, PB1-26 | a project in a directory named `nested app` beneath a directory holding an empty `.git` (no Git runs); a scripted `git` on `PATH` answers only the reviewed command, logging its working directory and arguments. Batch and resident, human and JSON: of 16 listed entries exactly `build output`, `coverage`, `line\nbreak` (shown `"line\nbreak"`), `subs/b/gen out` (module app/b) and `tools` warn; `dist`, `fixture-project`, its `node_modules`, `node_modules`, the sample and its `dist`, both scratch directories, `external-project`, `subs/a/src/.ramify` and a file do not; exit 0, check passed, 5 warnings; `tools/tmp/helper.ts` still inventoried as app's auxiliary source; one Git call per check, in the canonical root. A listing reduced to `coverage/` changes only the advice: the reports are equal otherwise, `inputId` included. A violation keeps exit 1 with the advice; the hook check asks Git nothing. No `git` on `PATH`, a Git command failing with exit 128, and a project outside any repository (no Git call at all): no advice, exit 0, empty stderr |
| help | both help forms carry the new text and no longer "Hashes the named paths" |

`subs/cli/src/tests/git-advice.test.ts` (5 tests, scripted Git ports that
answer only configured roots and record every call): NUL-safe parsing (spaces,
tab, newline, leading and trailing blanks, non-ASCII, an unterminated last
entry; invalid UTF-8, `./`, `../`, absolute, empty or `.`/`..` segments,
backslashes, files and duplicates skipped); agreement with
`classifyProjectPath` (11 walked directories with their modules, 22 excluded
ones of every kind); the warning text and Git's order; merging into a report
(byte order, summary count, outcome untouched); `not-repository`,
`unavailable`, `failed`, an unconfigured root and a missing scope give no
advice; an aborted signal rethrows; through `runCli` with the quick
environment: batch and resident human and JSON show exactly the two walked
directories, a violation keeps exit 1, and `--changed` makes no Git call.

**Negative control.** With the seven changed source files replaced by the base
commit's and the two new source files moved out, a base build was made and the
new process test run against it: 4 of 5 tests failed (the changed-check human
lines, the affected seed lines, the Git advice, help;
`negative/base-negative-control.out`). PB1-30 passed on the base build, as
iteration 3B implemented selection; this slice qualifies it through processes.
The candidate files were restored, their SHA-256 verified
(`negative/restored.txt`), and the candidate rebuilt.

**Process check** (`process-check.sh`, run `process2/`, the installed launcher
`dist/src/ramify`, which runs the compiled client, a resident daemon in the
private endpoint `process2/endpoint/`; `process/` is a first attempt refused
because the endpoint directory had mode 0755):

- complete check human and JSON (0), batch (0); `--changed`: source checked
  (0), inert and whitespace inert not analyzed (0), five excluded kinds not
  analyzed (0), mixed checked/owned-ignored/inert (0), `../outside.ts` not
  checked (2); after a `tsconfig.json` edit, source + owned-ignored +
  `tsconfig.json`: not checked `configuration-changed`, the owned-ignored path
  not analyzed (2), then the complete check (0); with a violation: mixed
  request 1 with the `[new] not-visible` finding, owned-ignored path alone 1,
  complete check 1; restored 0;
- `affected` resident human and JSON with outside, whitespace, external,
  owned-ignored and auxiliary seeds (0, all-modules), batch (0);
- `--root .` given (0); `--root subs/a` exit 1 resident and batch with the
  add-the-marker message; from `subs/a/subs/grand` `app` found (0); from inside
  the ignored `sample` `sample` found (0); no description above: exit 2 naming
  the directory, resident and batch; beneath an unmarked description: exit 2
  with the hint, resident and batch;
- Git advice with real Git in a copy (`git init`, `.gitignore` for
  `coverage/`, `build output/`, `line*/`, `dist/`, `node_modules/`,
  `fixture-project/`, `subs/b/generated/`, `tools/`; `git-listing.txt`):
  batch and resident, human and JSON warn about exactly `build output`,
  `coverage`, `"line\nbreak"`, `subs/b/generated` (module app/b), `tools`; exit
  0, same `inputId` in both modes; `--changed` carries no advice; with `PATH`
  lacking `git` (compiled client and batch child) batch and resident give no
  advice, exit 0, empty stderr; the same project outside a repository gives
  none;
- the toolkit itself (a repository): `check --root . --batch` 0 warnings; the
  built port lists `.reference-work`, `dist`,
  `examples/collection-review/.reference-work`,
  `examples/collection-review/node_modules`, `node_modules`, all excluded
  (`toolkit-git-advice.out`); `check:reference` 0 warnings (the example
  declares `.reference-work` external);
- `ramify --help` and `ramify check --help` identical; daemon stopped (exit 0),
  status afterwards not running, no process left.

## Re-reasoned expectations and instance rows

Each from the contracts and the CLI specification, never from candidate output:

- `subs/cli/src/tests/changed-command.test.ts`: the configuration case asserts
  the `Path tsconfig.json: not checked (configuration-changed; module fixture)`
  line and the not-checked outcome line instead of `Not checked
  (configuration-changed): tsconfig.json`.
- `subs/cli/src/tests/affected-command.test.ts`: seed lines `owned by
  example/core (declaration)`, `outside the project`, `owned by example
  (containment)`, `excluded (packages node_modules)`.
- `scripts/reference-harness/cli-cases.ts`, `I1-28:no-servers`: inside a Git
  repository, as the run copy in the checkout's work area is, the CLI also
  runs the advisory Git command once; the handler now allows at most one such
  child of the CLI process (exact arguments) and requires every other child to
  be compiler integration, as before. In the harness's copies Git itself fails
  (the copies lie inside an ignored directory, where Git 2.39.5 reports
  "directory entry not superset of prefix"), so no copy gains advice and no
  other expected output changes.

**Instance rows.** No `plan*-instances.ts` row, count or identity changed.
`I1-28:no-servers` ("No listen/bind or daemon spawn and prompt process
release") still describes its instance. Already stale before this slice and
untouched: I5-11 `changed-delta-document` (`ramify.check/1`) and
`plain-check-unchanged` (`ramify.analysis/1`, "no added member": still no added
member; inside a repository the report may carry advice warnings).

## Commands and results

Focused commands ran without the lock. The harness files, single instances
and `reference:cases` held `/tmp/ramify-audit-tests.lock` (`run-locked.sh`:
requested 2026-10-04T23:54:05Z, acquired 2026-10-05T00:08:15Z after the
milestone gate released it, harness and instances to 00:21:16, cases
00:21:07–00:27:01 UTC). `git status` and the diff hash (`ccff92d9…`) were
identical before the locked runs, before and after `reference:cases`.

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check`; new files checked for trailing whitespace | 0 | clean | `diff-check.log` |
| `npm run build` (final, after the last source edit) | 0 | built, compiled-client bundle check included | `build.out`, `build.exit` |
| `npm run type-check` | 0 | four scopes | `type-check.out` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 608 files | `validate-final-contracts.out` |
| `npm run check:self` | 0 | passed, partial; 15 owners, **591** source files (587 + `git-advice.ts`, `git-command.ts` and the two new tests), 17 resources, 8779 accesses, 0 errors, 0 warnings (Git ran: every ignored toolkit directory is excluded), 41 limits, 5627 allowed, 0 denied, 3108 external | `check-self.out` |
| `npx vitest run src/tests/project-boundary-cli.test.ts` (current build) | 0 | 5 tests | `pb-cli-run2.out`; run 1 failed on two expectations of mine, re-reasoned above (`pb-cli-run1.out`) |
| Negative control (base sources built, new test) | 1 | 4 of 5 failed; PB1-30 passes on base (iteration 3B); restored, SHA-256 verified, rebuilt | `negative/` |
| `npx vitest run subs/cli/src/tests/` | 0 | 9 files, 250 tests (245 + the 5 new) | `vitest-cli.out` |
| `npx vitest run subs/analysis/subs/project/src/tests/` (type-only change) | 0 | 14 files, 315 tests | `vitest-project.out` |
| `npx vitest run` ten root files, each its own argument: `project-boundary-cli`, `resident-cli`, `batch-cli`, `cli-process`, `compiled-client`, `entry-boundaries`, `affected-batch`, `companion-cli`, `quick-environment`, `launcher-script` | 0 | **10 files, 75 tests** | `vitest-root-files.out` |
| Process check, built launcher (compiled client), resident daemon in a private endpoint, real Git in one copy | as listed | stopped explicitly, no process left | `process-check.sh`, `process-summary.txt`, `process2/` |
| Harness `final-contracts.test.ts`, `plan5-completion.test.ts`, `cli.test.ts` (locked) | 0 | 3 files, 17 tests | `h-final-contracts-plan5-completion-cli.log` |
| Harness `plan5-live.test.ts` (locked) | 0 | 6 tests | `h-plan5-live.log` |
| Harness `resident-fixtures.test.ts` (locked) | 0 | 18 tests | `h-resident-fixtures.log` |
| Harness `equivalence.test.ts`, `lifecycle-fixtures.test.ts` (locked; real CLI checks and watch) | 0 | 2 files, 35 tests | `h-equivalence-lifecycle.log` |
| Plan 1 single instances (locked): all 22 iteration 13 CLI handlers (I1-26 ×7, I1-28 ×15, incl. the re-reasoned `no-servers`) and I1-01 `baseline` | 0 | 23/23 passed | `p1-instances.out` |
| Plan 2 single instances (locked): I2-19 `cli-check-boundary`, `daemon-entry-boundary`, `status-no-start`; I2-20 ×9; I2-23 ×5 | 0 | 17/17 passed | `p2-instances.out` |
| Plan 5 single instances (locked): I5-11 ×9, I5-14 `declarations-final`, `documents-revised` | 0 | 11/11 passed | `p5-instances.out` |
| Plan 2A single instances (locked): I2A-10 ×9 | 0 | 9/9 passed | `p2a-instances.out` |
| `npm run reference:cases` (locked, after the build, frozen tree) | 0 | **37 files, 393 tests** | `cases.stdout`, `cases.stderr`, `diff-*.sha`, `status-*.txt` |

`reference:verify` was not run; it is left to the coordinator's gate (plans 1,
2, 5 and 2A). No `*.test.mjs` changed, so no `node --test` run was due.

## Protected documents and proposed patch

No `.principles.md`, `.spec.md` or glossary file was edited.
`proposed-spec-patches.diff` (sha256 `7e909845…`, seven hunks, `git apply
--check` clean in the worktree) changes `docs/architecture/cli-invocation.spec.md`:

1. *Compiler configuration*: drops "The outside-module file inventory
   described below is separate." (stale since iteration 8C: auxiliary source
   is analyzed, no outside-module inventory exists).
2. *Files outside modules*: removes the "Pending Git advice" note.
3. *Files outside modules*: a new paragraph defining the Git advice: code
   `ignored-but-walked`, located at the directory, no files; complete checks
   (resident, batch, batch fallback) only; `.git` at or above the root; the
   exact command, bounded, run once in the root; NUL-terminated entries read as
   they are; a warning for each listed directory beneath the root that the
   revision's ownership leaves Ramify to enter, naming the module; excluded
   directories, descendants, the root and outside entries give none; no
   repository, no executable, a failed or oversized command give none and print
   nothing; never an input, identity, scope, ownership, selection, finding or
   exit-code influence; in the human warnings and the JSON `warnings` with the
   summary count; the hook check, `watch` and `affected` ask Git nothing.
4. *Output and exit*: the JSON report is "unchanged apart from the Git advice
   warnings"; the "When project boundaries are implemented" version paragraph
   becomes past tense ("Project boundaries moved every machine document … to its
   next version"). No passage of the specification names `ramify.analysis/1`
   or describes `covered` at the base; the stale passages were these.
5. *ramify affected*: the human output prints one line per path seed with its
   status, module, basis and exclusion.
6. *Hook and complete checks*, table: the hook waits for a revision covering
   "the identities of the named paths its classification analyzes", and a
   classification that changes again after its one retry is among the
   not-checked answers.
7. *Hook and complete checks*: exits 0 and 1 "whatever paths are not
   analyzed", 2 "when the result could not be established"; the human output
   (one line per path, an outcome line, only a checked path reads as checked);
   drops "When project boundaries are implemented,".

## What iterations 18–19 still lack

- 18: architect metadata, API-view selection and measurement buckets (no CLI
  output of this slice is involved).
- 19: the coordinator's application of this patch if authorized; the checked-in
  `CLAUDE.md` edit (not touched here). Teaching pages that describe the CLI:
  none found (`site/src/pages` teaches the model: `explorer.mdx`,
  `glossary.md`, `index.mdx`, `model.mdx`, `modularity.mdx`, `tags.mdx`; none
  describes `check --changed`, `affected` or Git ignores). Development guides
  that describe the CLI and should be reviewed for the advice and dispositions:
  `docs/development/batch-verification.md`, `testing.md`,
  `engineering-practices.md` (this slice corrected only the
  `resident-verification.md` row that called the batch report unchanged).
- 20: requalification of PB1-10/20/26/30.

## Deviations, gaps and decisions needed

1. **Classification in the lightweight client (decision).** The contract says
   to classify Git's directories "with Project facts". The client cannot load
   Project's classifier (I2-19 and I5-11 forbid analysis modules in the CLI
   process; the compiled client's build refuses them), so the CLI uses the
   report's ownership facts plus a mirror of the reserved-segment rule, which an
   owner test keeps equal to `classifyProjectPath`. Alternatives: admit
   Project's pure classifier (`ownership.js`, `generated-path.js`, `data.js`)
   into the lightweight boundary (changes I2-15/I2-19 and compiled-client
   exclusion rules), or carry the reserved segments as data in the scope (a
   shape change iteration 14 gap 2 named), or classify through a daemon request
   (a protocol member) and a batch-side binding.
2. **No advice on `--changed` (decision).** The contract says "at CLI check
   time"; this slice runs Git for complete checks only, keeping the hook's
   latency budget and its document's warnings to the revision's. `watch` and
   `affected` are not checks. The coordinator may ask for the hook too (one
   `git` spawn per hook inside a repository).
3. **Repository detection.** `.git` is found by `lstat` at or above the root
   before Git runs, so no process starts outside a repository. A repository
   reached only through `GIT_DIR` gets no advice; inside a Git hook whose
   environment sets a relative `GIT_DIR` or `GIT_INDEX_FILE`, the command may
   fail and the advice is silently absent. The environment is inherited
   unchanged.
4. **Root inside an ignored directory.** Git 2.39.5 fails there with "directory
   entry not superset of prefix", so a project inside an enclosing repository's
   ignored directory (the harness's copies, scratch copies) gets no advice, and
   no warning ever names the root itself; a Git child still starts (I1-28
   re-reasoned).
5. **Configuration answer and inert paths.** An owned inert path named beside an
   edited configuration file is `not-checked` (`configuration-changed`), not
   `not-analyzed`: the daemon's classification analyzes owned paths outside
   exclusions, and only a covering revision finds a file to be no analysis
   input. Excluded paths keep `not-analyzed`. Exit 2 either way.
6. **Owner touched beyond CLI and root.** Project's `ProjectWarning.code` union
   (type only), as iteration 8B said the code would be declared when produced.
7. **Bounds.** 5 s and 16 MiB for the Git command are internal constants,
   not options.
8. **Human escaping.** Any warning or path field containing a control character
   is printed JSON-quoted in human output (only such paths change).
9. **Schema.** No document changed shape; `ramify.check/2` and
   `ramify.affected-cli/2` needed no new member for this slice.

## Coordinator review

Pending.

## Coordinator review

The coordinator reviewed the human output, the Git advice and its production
adapter, the new process test and the migrated expectations against the
brief, the contracts and R4 and R7, authorized
`proposed-spec-patches.diff` unchanged (`cli-invocation.spec.md`, seven
hunks) and applied it with this slice. This iteration ran one iteration ahead
in the second worktree and was merged after iteration 16's milestone gate.
Two choices are reported to the user through the relay session. The CLI
classifies Git's ignored directories from the report's ownership data plus a
copy of Project's reserved-name rule, which an owner test keeps equal to
`classifyProjectPath`, because the lightweight client may not load an
analysis module. Git advice is produced on complete checks only, not on
`--changed`, `watch` or `affected`, which keeps a Git process out of every
hook. The agent did not run `reference:verify`; the coordinator's gate runs
the audit, `reference:cases` and the full Plan 1 and Plan 2 verification on
the committed candidate.

The CLI's copy of the reserved-name rule is the one deliberate exception to
"no second ownership algorithm outside Project": the lightweight client may
not load an analysis module, and `git-advice.test.ts` enforces that the copy
equals `classifyProjectPath`. The relay session accepted both choices under
the user's standing instruction; the user was told and may override them.
