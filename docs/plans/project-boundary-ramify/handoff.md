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

## Known flaky tests

The user's policy of 2026-10-05: a failing test is run alone three times; if
all three pass it is flaky, the gate counts as passed for it, and the
occurrence is listed here with its failing output.

| Test | Date | Gate | Failing output | State |
| --- | --- | --- | --- | --- |
| `src/tests/compiled-client.test.ts`, A7-11:compiled-child: the compiled client's result for `affected example/mid --path docs/notes.md --batch` differed from the Node entry's, in the relocated copy only | 2026-10-04 | Iteration 14, Plan 1 `I1-28:relocated-package` | `.reference-work/evidence/7cf05b52-22e2-42df-a7e6-b196b78231c2.json.gz` in the phase worktree; investigation in [the receipt](iterations/iteration14-fix-results.md) | Not reproduced; cause unknown. The test now records both outputs. |
| `subs/explorer/src/tests/ModuleTreePage.test.tsx`, MT09 | 2026-10-04 | Iteration 16 milestone, audit | Audit run `refs/audited/runs/2026-10-04T23-24-54Z-3b5c168fa` | Resolved: a product defect, repaired in `e3c10dc8`. |
| `subs/analysis/src/tests/session-worker.test.ts`, "cancels queued and active calls without losing the last published revision" | 2026-10-05 | Iteration 17 rerun, Plan 1 `I1-28:relocated-package` | `.reference-work/evidence/f030a68f-8c50-4572-82f9-e2f026a5d3b0.json.gz` in the phase worktree | Resolved: a product defect in the session host, repaired with [this receipt](iterations/session-cancel-repair-results.md). |
