# Phase 2 handoff and publication lifecycle

**Status:** required receipt format; no provider handoff exists yet.

## Immutable Phase 1 receipt

The local artifact and receipt name:

- Toolkit source commit/tree and exact plan/contract review revision; clean
  checkout status and committed configuration/lockfile digests.
- Package name/version, every public export entry and packed artifact SHA-256.
  Build/pack commands, complete file manifest and build-input identity.
- Installed-package smoke evidence from an isolated directory using only the
  tarball, without source aliases or imports back into the toolkit checkout.
- Every PB1 case's fixture, independent expectation, actual provider answer,
  command/configuration and receipt digest; full audit or direct-gate identity,
  explicit reference-command and full reference acceptance results.
- The root-marker rule (R7) as a contract every consumer adopts: each project
  a consumer checks, including its own root, fixtures and generated target
  projects, declares its root with `root module <name>`, or the published
  Ramify rejects it.
- Current schema/CLI/API documents and the written [fixture topology](fixtures.md),
  including normalized exclusions, containment seeds, outside paths and expected
  reverse-import closure. Consumer tests rebuild it; no fixture files are copied.
- The performance report for the user: every earlier timing target with its
  baseline value, candidate value and whether it was met, and every capacity
  limit that was raised with its measurement. A missed target is reported
  here and does not withhold the handoff.
- Explicit limitations and remaining Phase 2/3 work; next execution root is
  `/ramify-audit`. Old partial-audit and agent incompatibility is intentional,
  not an unresolved Phase 1 regression.

Produce the candidate build, then pack it to an external artifact directory:

```sh
npm run build
npm pack --ignore-scripts --pack-destination "$PB1_ARTIFACT_DIR"
```

`PB1_ARTIFACT_DIR` is a task-specific absolute directory outside the source
checkout. Packing does not publish. Install the tarball in an isolated consumer
probe and use `ramify.ts/analysis` and the installed `ramify` CLI to run PB1-36
against locally built topology. Assert actual expected ownership/exclusion/
affected outputs and public typing; successful package installation alone is
insufficient. Run the installed daemon with an owned endpoint and clean it up.

Evidence lives in durable audit refs and/or a content-addressed archive. The
handoff document links those artifacts and separates audited source identity
from report commits. If any code changes after packing, rebuild, rerun affected
qualification and issue a new artifact digest; never silently replace it.

## Consumer development and publication

Phase 2 starts against the handed-off local artifact. Its own temporary install
or fixture setup can use that tarball; no local artifact path is committed as
its dependency. The audit's detailed plan is authored against this plan's PB1 cases,
iteration identities and actual contracts before audit implementation begins.

A provider defect found during audit development is fixed in a toolkit-owned
iteration, verified in full under [execution.md](execution.md), and delivered as
a rebuilt local artifact. That repair does not grant permission to change
`ramify-agent/` or weaken the new model. Update affected receipts explicitly.

The Phase 1 package is `ramify.ts` 0.2.0: the contracts change incompatibly,
which under 0.x versioning is a minor version. Iteration 19 sets that version
in the package manifest and lockfile, so the candidate qualified in iteration
20 and the artifact packed in iteration 21 already carry it. A provider repair
before publication is rebuilt as 0.2.0 with a new digest and receipt; once
0.2.0 is published, repairs take 0.2.1 onward.

Before Phase 2's completion gate, publish the qualified Ramify artifact as
0.2.0 and verify the downloaded package matches its release receipt. The release record names the version, registry, artifact integrity,
source revision and acceptance evidence. The audit's committed toolkit pins
must use that exact version, never a file path or floating range. Registry
publication is not needed for Phase 1 merge or Phase 2 startup; it is required
for consumer completion. This plan does not execute publication.

The toolkit-owned site also consumes the candidate through exported package
entries. Before publication, root-owned setup installs the candidate tarball
in the site's `node_modules` with no-save/no-lock options. Record the artifact
digest and introduce no committed `file:` dependency or invented registry
integrity. Install the site, then prepare the candidate package before site
build; root build does not depend on site build. `site:build` runs that
root-owned preparation itself, because `npm --prefix site ci` removes the
installed candidate and the site's manifest does not name it. A later independent site
release can adopt the actual registry version after publication. Phase 1 site
acceptance binds to the local candidate artifact.

After Phase 2's first audit release, toolkit audit usage adopts that executable
from an external tool location without changing the agent's install. Full-audit
inputs and the reference command enter the toolkit's audit definition only
through that Phase 2 integration. Phase 3 later pins both published providers.

## Known defects carried forward

Defects found during Phase 1 that predate it and lie outside its scope. Each
stays open until a toolkit-owned slice repairs it with its own verification.

- **High priority for the first follow-up plan: the daemon does not recover a
  context whose session worker died.** Every later hook check of that context
  answers not checked, `unavailable`, until the daemon restarts. In the fast
  recipe's S1000 workload on `a5b377e8`, the worker exited (1) during the retry
  after a retained-limit refusal (see [known limitations](#known-limitations)).
  Every later hook answered `unavailable` in about 33 ms, and the context
  never published again. The failure branch of `analyze` in
  `subs/daemon/subs/contexts/src/context-manager.ts` (around lines 778–790)
  keeps the failed session; the same branch exists at `640583cc`, before the
  phase. Evidence: `/home/app/ramify-pb1-evidence/a5b377e8/fast-diagnosis/`
  (`s1000.json`) and the failed run's outputs in
  `/home/app/ramify-pb1-evidence/a5b377e8/measurements/`.
- **A daemon whose working directory is deleted fails later requests.** The
  resident daemon inherits the working directory of the command that starts
  it and never changes it. Once that directory is deleted, every later
  request that opens a project, including one for a different, intact
  project, returns `internal-error` "analysis-failed: ENOENT: no such file or
  directory, uv_cwd" with exit 2 and a null `inputId`; a batch check of the
  same project passes. Reproduction: start the daemon with a resident check
  from inside a project copy, delete that copy, then run a resident check of
  another project. It reproduces at `33d8a739`, before Phase 1, and at
  `a8d99307`. Evidence:
  `/home/app/ramify-pb1-evidence/verify-repair/i2a13-t-check5.out` and
  `i2a13-t-check5-base.out`, produced by `i2a13-t-check.mts` in the same
  directory with `WITH_R`, `DELETE_R` and `EXACT_COPY` set. The harness case
  `I2A-13:self-reference-checks` now keeps every copy until its daemon has
  stopped; the runtime is unchanged.

The project explorer page loses an interaction made before a newly rendered
model settles: in `subs/explorer/src/ProjectExplorerPage.tsx`, the effects
that set the presentation-class filter and the `?module=` focus from the
first model overwrite a class toggle or selection made between that model's
first render and those effects. The module tree page had the same defect and
was repaired in `e3c10dc8`
([receipt](iterations/mt09-repair-results.md)); this page is not, because
until its effect runs every class shows unchecked, so the repair needs the
filter computed during rendering.

The hook check never passes on a lockfile. A lockfile is never a captured
input, and a configuration-named file the covering revision did not capture
is never treated as covered, so `ramify check --changed package-lock.json`
(or `yarn.lock`, `pnpm-lock.yaml`) outside every exclusion always answers
not checked with the reason `configuration-changed`, exit 2. The repair is to
answer such an uncaptured file `not-analyzed`; it is left for after the
phase, so that the hook check does not change before the measurements.

## Known limitations

- **Inert files count toward the acquisition limit.** Discovery records every
  file in an ordinary directory by kind and path, and acquisition counts
  those entries against its limit of 50,000 captured files. A project with
  10,000 inert and 5,000 excluded files checks with the same analyzed files,
  accesses, findings, inventory and captured bytes as without them, but
  50,001 inert files give an explicit `resource-limit` error, exit 2, in
  batch and resident checks. The remedy is to declare the directory
  `owned-ignored` or `external`. Evidence:
  `/home/app/ramify-pb1-evidence/iteration20/workflow/` (`scale.sh`,
  `limit.sh`).
- **The per-context retained-fact limit of 96 MiB, 100.7 MB
  (`maxRetainedBytesPerContext`).** When a new revision would exceed it, the
  session refuses the revision and marks itself stale; the daemon discards the
  revision history and retries once, on the broad path. Measured by the fast
  recipe on `a5b377e8`:
  - S500: each create or delete save added about 6.88 MB of retained facts
    (77.7, 84.5, 91.4 and 98.3 MB; the next would reach about 105 MB). The
    first crossing came at 98.3 MB, and from then on every fifth such save
    crossed the limit, from 95.3 MB. Each broad retry took about 14 s against
    about 2.1 s on the membership path. All eight retries completed correctly.
    Every second configuration save crossed it too; that path is broad anyway.
  - S1000: body edit 5 crossed the limit at 95.5 MB with five revisions
    retained. The broad retry ran about 27.6 s, then the session worker exited
    (1), probably at its 512 MiB heap; that is unproven, because the recipe
    captures neither daemon nor worker stderr. The hook answered
    `analysis-failed: Session worker exited (1)` after 29.0 s, and the context
    never published again ([known defect](#known-defects-carried-forward)).
  - The phase adds roughly 3% (X100) to 10% (reference) retained facts.
  - The S500 and S1000 fast workloads were waived in Plan 5 and are first
    measured here. `I5-13:hook-latency-s1000` is a measurement gap, and so are
    `I5-13:checked-set-bounded` and `I5-13:cold-open`, which use S1000's
    process.
- **Not measured in this phase.** The architect view's size and timing
  measurements of Plans 2B and 2C lie outside the three recipes the user
  approved for iteration 20, and no reference instance needs them.

## Follow-ups

Deferred by the user to a later plan, not Phase 1:

- **Module purpose from `module.ramify`.** Decided by the user on 2026-10-05:
  a module's purpose is to come from its `module.ramify`, not from the first
  prose paragraph of its `README.md`.
- **Primitive-literal constants as declared signatures.** After Phase 1, a
  constant whose initializer is a primitive literal counts as a declared
  signature, with no `signature-inferred` note. That turns fixture F's
  verification baselines, which decision 10 of the
  [main plan](main-plan.md) keeps expecting the note on F's exposed `value`,
  back to "no note".

Left open by this phase, without an owning slice:

- **Count only files whose content is read** toward the acquisition limit,
  which fits the glossary: an inert file is not inventoried.
- **Lockfiles in the hook check**: answer an uncaptured configuration-named
  file `not-analyzed`, as [known defects](#known-defects-carried-forward)
  describes.
- **A symlinked path in the hook check and in `affected`.** The hook check
  resolves a named path through symbolic links and reports its real path and
  owner; `affected` reports the same spelling as an installed package with no
  owner. Disposition and exit code are right either way; the two should
  agree.
- A scope without a root module answers an in-project path as `invalid-path`.
- A compiler-selected file reached through a link into a declared tree still
  becomes a compiler root, and a `#` import-map entry pointing at a
  dependency is not recognised as a package import.
- The membership refusal for a failed resolution into an absent directory is
  broader than needed.
- A warm session publishes a new revision, with the same input identity and
  findings, for an inert edit.
- Three historical probe scripts build compiler hosts without `realpath` and
  `directoryExists`; no gate runs them.
- **Daemon and worker stderr in the fast recipe.** Capture both, so that the
  cause of a session worker's exit, its heap limit or another, can be proven.
- Optionally, after a retained-limit refusal clears the history, retry the
  narrow path instead of marking the session stale.

## Wordings settled through the relay session

The user's decisions reached the coordinator through a relay session, which
also settled questions it judged clear-cut under the user's standing
instruction. These are the ones the relay settled itself; the user was told
of each and may override any of them:

- The JavaScript rule first applied outside `src/` only (iteration 8C). The
  user then worded the glossary's "Compiler source" entry on 2026-10-05,
  which settles it.
- The two `I5-01` instances compare two pinned Plan 5 builds, no longer the
  current engine (`c99db9c4`).
- The unused `referenced-resource` placement is removed (iteration 14).
- Each hook check makes one classification round trip, with no client-side
  cache, and `cli-invocation.spec.md` says a client hashes an owned file
  before the revision shows it to be no analysis input, which narrows a
  sentence of review decision R4 (iteration 15).
- `module-description.spec.md` no longer says owned-ignored contents are never
  "watched"; `daemon.md` states that the watcher prunes declared trees from a
  context's first completed revision on (`86c1a7f2`).
- The CLI keeps a copy of Project's reserved-name rule for the Git advice,
  guarded by a test, and gives that advice on complete checks only
  (iteration 17).
- The `entry-footprints` measurement check accepts a help run recorded as
  completed below sampling resolution (`befc5e77`), which relaxes a reviewed
  pass/fail check.
- Iteration 18's gate also ran the Plan 2A verification.
- PB1-31 states the implemented production rule: files beneath `src/` with a
  production profile (iteration 19).
- In the wording package of 2026-10-05: the specification's statement of the
  configuration rule in the hook check, its exact list of configuration-named
  files, the sentence that an inert file is hashed and watched only when a
  revision captures it, and keeping the lockfile behaviour for this phase.
- The acquisition limit and the unmeasured Plan 2B and 2C views are accepted
  for this phase, as [known limitations](#known-limitations) states.
- After `measure:fast` failed on `a5b377e8`, option (a): the repair changes the
  fast recipe only, and the candidate's source is not changed. A broad created
  or deleted revision passes only when the daemon telemetry shows its
  retained-limit refusal and history reset, and the workload lists each such
  retry. A workload whose daemon can no longer publish stops at once and
  records where; it stays a measurement gap.

## Reference rows whose prose is stale

Every reviewed instance row stays byte-identical, because the instance tables
are compared with the archived plans. These rows' prose no longer describes
what their instance asserts; each instance asserts the behavior in the third
column and passes. The table collects the lists in the receipts of iterations
2, 3, 3B, 4, 8B, 8C and 17, baseline repair 2, the final-gate repair, the
entry-footprints repair and the measurement-recipe repair.

| Row | Prose now stale | What the instance asserts | Since |
| --- | --- | --- | --- |
| I1-01:baseline | "the two configuration warnings are separate" | no warnings; both files are root auxiliary source | 8C |
| I1-02:stray-description | "alongside ordinary outside-source warning" | no warning; the file beneath the stray marker has no owner | 8C |
| I1-02:loose-subs-source | "One aggregated `subs` warning count 1; no ... owner" | root auxiliary source, no warning | 8C |
| I1-02:sibling-tests | "One `tests` warning count 1" | root auxiliary, ordinary; still no testing classification | 8C |
| I1-02:sibling-interfaces | "One `interfaces` warning count 1; no owner" | root auxiliary; still no exposure or third area | 8C |
| I1-27:self-check | "independent scripts/site/example absent from program" | scripts are analyzed auxiliary source; site and example stay absent | 8C |
| I1-28:compiled-cli-warnings/human, /json | "Visible aggregated warning" / "Same warning/count" | no warning; exit 0 unchanged | 8C |
| I1-28:compiled-cli-stray-description/human, /json | "marker not included in ordinary-file warning count" | no warning exists | 8C |
| I1-29:nested-project-root/root-example, /child-example | "enclosing subs ancestry does not cross nearer non-subs boundary" | the nested project is selected because its description carries the root marker | 3B |
| I1-29:outside-module-target | "Warning plus located outside-scope analysis limit" | a definite `not-visible` denial; still no allowed verdict, no external | 8C |
| I1-29:stray-files | "Warnings root config-extra count 1 and tests count 2 only; ... ignored file silent" | all four files root auxiliary, no warning | 8C |
| I1-30:production-selection/toolkit | "build consumes identical selected set" | the build also emits the explorer bundle from inputs outside the selection and does not emit the selected ambient `styles.d.ts` | `d5c24982` (baseline repair 2) |
| I2-01:cold-context | "two warnings" | zero warnings | 8C |
| I2-19:batch-no-daemon | "finite compiler helpers remain permitted" (also its Plan 2 subcase text) | the handler also permits the one advisory Git child when a `.git` entry is at or above the root | 17 (iteration 17 fix) |
| I2-20:json-bare-report | "One `ramify.analysis/1` document" | `ramify.analysis/2` | 2 |
| I2-21:json-lines | "One `ramify.watch/1` object per line" | `ramify.watch/2` | 3 |
| I2-29:entry-footprints | "Idle CLI help, … CLI check client." / "Within the budget table; recorded raw." | help has no budget, and a fast exit is recorded without an RSS figure; the raw samples are kept | entry-footprints repair |
| I2-30:self-check-fifteen | "no findings or limits" | 38 nonblocking limits, all in auxiliary source; still no finding | 8C |
| I2-30:declarations-final | "Eleven declarations match owners.md" | fifteen owners, the eleven archived declarations plus named layers | final-gate repair |
| I2-30:package-entries | "Resolve all eight entries" | nine import entries and a stylesheet entry | `26bba1e2` (baseline repair 2) |
| I2A-02:explicit-config-excluded | "as application or outside-module source" | generated output never becomes application source; outside-module source no longer exists | 8C (named in 4) |
| I2A-12:toolkit-scale | "with all eleven owners" | a completed toolkit materialization with nonzero output, sampled memory and filesystem metrics; no owner count is asserted, and the toolkit has fifteen owners | Plan 6 (named in the measurement-recipe repair) |
| I2A-13:declarations-package | "Eleven declarations and eight package entries validate" | fifteen layered owners, the eight reviewed entries and the recorded additions | final-gate repair |
| I5-01:namespace-lazy-equal | "the reference reports ... two configuration warnings"; "the toolkit ... no finding" | the reference expects no warning (8C); today's engine reports 18 companion findings on the pinned toolkit input (Plan 8) | 8C, final-gate repair |
| I5-01:decide-indexed-equal | "the reference keeps its two warnings" | no warning | 8C, final-gate repair |
| I5-06:export-removed-missing | "Remove the export `revisionScopeSchema` from the vocabulary file" | removes `resolvePredecessors` from the catalog core's `history.ts`; the checked set is that file and its importers | final-gate repair |
| I5-06:wide-fanin-bounded | "which 56 importing accesses reach"; "at most those 56" | 61 importing accesses | `ff01212e` (final-gate repair) |
| I5-11:changed-delta-document | "Exactly one `ramify.check/1` document" | `ramify.check/2` | 8B |
| I5-11:plain-check-unchanged | "One bare `ramify.analysis/1` document" | `ramify.analysis/2` | 2 |
| I5-13:entry-footprints | "Plan 2's entry footprint workloads on this build: idle CLI help, …" / "Each footprint is within Plan 2's recorded limit" | as for I2-29:entry-footprints | entry-footprints repair |
| I5-13:repeated-edit-plateau | "Two hundred alternating edit and revert cycles"; "over the last hundred cycles" | 40 cycles on each of the reference and S100, with growth recorded over the last 30 | `14c5c2a8`, before the phase (named in the measurement-recipe repair) |
| I5-14:declarations-final | "All eleven declarations match owners.md, including the six added lines and the removed increment line" | fifteen layered owners | final-gate repair |
| I5-14:package-entries-unchanged | "all eight package entries"; "entry map is unchanged from Plan 2" | nine import entries and a stylesheet entry | `26bba1e2` (baseline repair 2) |

Archived prose outside the instance tables, not edited: Plan 1's
`subcases.md` exact-reason table uses "root marker" for the root description
file, and its I1-29:nested-project-root subcase keeps the `subs/`-ancestry
wording (3B); Plan 7's `cases.json` A7-02 `unowned-root-file`, `docs-path` and
`dotdot-rejected` and its `contracts.md` "Query validation" and "Path
resolution" describe affected answers before containment (iteration 14).

## Known flaky tests

The user's policy of 2026-10-05: a failing test is run alone three times; if
all three pass it is flaky, the gate counts as passed for it, and the
occurrence is listed here with its failing output.

| Test | Date | Gate | Failing output | State |
| --- | --- | --- | --- | --- |
| `src/tests/compiled-client.test.ts`, A7-11:compiled-child: the compiled client's result for `affected example/mid --path docs/notes.md --batch` differed from the Node entry's, in the relocated copy only | 2026-10-04 | Iteration 14, Plan 1 `I1-28:relocated-package` | `.reference-work/evidence/7cf05b52-22e2-42df-a7e6-b196b78231c2.json.gz` in the phase worktree; investigation in [the receipt](iterations/iteration14-fix-results.md) | Not reproduced; cause unknown. The test now records both outputs. |
| `subs/explorer/src/tests/ModuleTreePage.test.tsx`, MT09 | 2026-10-04 | Iteration 16 milestone, audit | Audit run `refs/audited/runs/2026-10-04T23-24-54Z-3b5c168fa` | Resolved: a product defect, repaired in `e3c10dc8`. |
| `subs/analysis/src/tests/session-worker.test.ts`, "cancels queued and active calls without losing the last published revision" | 2026-10-05 | Iteration 17 rerun, Plan 1 `I1-28:relocated-package` | `.reference-work/evidence/f030a68f-8c50-4572-82f9-e2f026a5d3b0.json.gz` in the phase worktree | Resolved: a product defect in the session host, repaired with [this receipt](iterations/session-cancel-repair-results.md). |
| `scripts/reference-harness/self.test.ts`, "checks the real toolkit and detects the independently specified dispatch type violation": timed out at its 180,000 ms limit | 2026-10-05 | Iteration 20 qualification, locked `npm run reference:cases` on `befc5e77` in the second worktree, while unlocked focused runs and another session's gate were running | `/home/app/ramify-pb1-evidence/iteration20/cmd/reference-cases.err` | Flaky: three locked runs of the file alone passed in 85 s, 94 s and 86 s (`iteration20/flaky-self/run{1,2,3}.out`). |
