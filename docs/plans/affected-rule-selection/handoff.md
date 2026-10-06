# Handoff: affected-rule selection, `ramify.ts` 0.3.0

**Date:** 2026-10-06. **Plan:** [Affected-rule selection for audits](main-plan.md).
**Status:** released. `ramify.ts` 0.3.0 is published, and this file states
Ramify's side of the joint adoption.

The toolkit and ramify-agent adopt `ramify.ts` 0.3.0 together with
ramify-audit 0.6.0, in one adoption commit per project. Adoption is not part
of this plan. Adopters follow ramify-audit's own handoffs:

- Plan 7, Phase 3: `/home/app/ramify-audit-pb/docs/plans/07-ramify-only-partial-audits/phase3-handoff.md`,
  section 8;
- Plan 8: `/home/app/ramify-audit-pb/docs/plans/08-ignore-paths/`, whose
  `handoff.md` is written at its iteration 4. Its plan lists that file's
  contents under "Handoff contents".

Where ramify-audit's handoffs and this file differ about the audit, theirs
win. This file is authoritative only for Ramify's answer.

## Release

| Item | Value |
| --- | --- |
| Package | `ramify.ts` 0.3.0 on `https://npm.braimax.com`, `dist-tags.latest` |
| Published | 2026-10-06T17:47:14Z, by the coordinator, after ramify-audit Plan 8's qualification (`a4483a35`) and Dan's approval |
| Release commit | `63cb7ccf003522d92bbdd6f1a94894e906c5217f` on `feat/affected-rule`, tree `fe96ee22f5b181d0223b3935f469b1cb8b99a9c0`; its full audit passed (run ref `refs/audited/runs/2026-10-06T14-51-49Z-63cb7ccf0`) |
| Tarball SHA-256 | `aaaf41272fb1337477a01cf15210283c1e9bed141f57870d7a98e1c6686745d3` |
| npm integrity | `sha512-D35L+Mc9tzhxdqZLdBQqAOeAx3spw5hUfEVUoFQoOWbrr9aJe38YlxbbgI2T99uHEzn80eBaKbI6o6V0nR3LGA==` |
| shasum | `521e0f79a174f281345c871aa2a1f824d2ce3932` |
| Receipt | `/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/RECEIPT.md`, with the registry verification in its "Publication" section |

The registry serves the receipt's tarball byte for byte: its `integrity` and
`shasum` equal the receipt's, and a downloaded copy has the artifact's
SHA-256.

### Schema change

- The selection is `ramify.affected/3` and the CLI document is
  `ramify.affected-cli/3`. Each path seed gains `kind` and `selects`, and a
  seed selects exactly the modules in its `selects`.
  [Contracts](contracts.md) are the complete reader contract.
- No `/2` reader or writer remains. The installed ramify-audit 0.5.0 answers
  `unsupported-schema` for every 0.3.0 answer, so its audits fall back to full
  with `ramify-unavailable`.
- The IPC protocol `ramify.ipc/2` is unchanged.

In brief: owned-ignored and scratch paths, module READMEs, every `.md` path
(beneath `src/` too) and inert files select nothing. A captured input selects
the modules it governs, so the root `tsconfig.json` and `package.json`
select every module. Source-area, auxiliary-source and description seeds
select their owner, and the owner's importers follow as affected modules.

### Qualification on a toolkit clone

Iteration 2, step 4. The clone is `63cb7ccf` with six case commits, one
harmless edit each. The artifact and the clone's own build gave equal
answers, apart from `inputId` and `scope.selection`; see the
[deviations](iterations/iteration2-results.md#deviations).

| Case | Seed | Kind | Selects | Changed | Affected | 0.5.0 verdict |
| --- | --- | --- | --- | --- | --- | --- |
| Q1 docs edit | `docs/agents/README.md` | ignored | [] | [] | [] | unavailable, `ramify-unavailable`, `unsupported-schema` |
| Q2 module README edit | `subs/presentation/subs/layout/README.md` | readme | [] | [] | [] | as Q1 |
| Q3 configuration edit | `tsconfig.json` | captured-input | all 15 | all 15 | [] | as Q1 |
| Q4 auxiliary script edit | `scripts/build-production.ts` | auxiliary-source | [ramify] | [ramify] | cli, daemon, explorer, integration-tests, service-api | as Q1 |
| Q5 declared probe-fixture edit | `scripts/probes/fixtures/compiler-api/src/consumer.ts` | ignored | [] | [] | [] | as Q1 |
| Q5b undeclared probe fixture | `scripts/probes/fixtures/synthetic-owners.ts` | auxiliary-source | [ramify] | [ramify] | cli, daemon, explorer, integration-tests, service-api | as Q1 |

Every toolkit answer keeps `selection: all-modules` and the widening
`partial-coverage`. The reason is the toolkit's 41 coverage notes, which are
existing behavior. All 18 paths of the
[expected toolkit table](contracts.md#expected-toolkit-answers-with-030)
answered as expected through the artifact. Plan 8's qualification found no
differences from that table, using 0.6.0 audits on its own clone of the
release commit.

## What ramify-audit 0.6.0 does with `/3`

This is the audit's behavior, as
[how ramify-audit 0.6.0 consumes `/3`](contracts.md#how-ramify-audit-060-consumes-3)
states it:

- It reads `ramify.affected-cli/3` and `ramify.affected/3` strictly. It pins
  `ramify.ts` 0.3.0 and has no `/2` reader.
- A queried path selects only when its seed's `selects` is non-empty. Only
  those paths count toward the drift cap.
- An empty answer is a selection of zero modules, never `ramify-unavailable`.
- An `undetectedConfigFilesForcingFullAudit` entry is accepted only when its
  seed has `kind: 'inert'`. Every other kind is refused, and the refusal
  names the kind: `source-area`, `auxiliary-source`, `description`, `readme`,
  `captured-input`, `ignored`, or `null` for excluded or outside-project
  paths.
- `ignorePaths` applies before the query, independently of this contract.

A Ramify project still on `ramify.ts` 0.2.0 gets `ramify-unavailable` from
ramify-audit 0.6.0 wherever the audit asks Ramify. Plan 8's handoff states
the consequences.

## Toolkit changes

The toolkit's audit asks the checkout's own `dist/src/ramify`. Its adoption
commit therefore needs this plan's branch merged, so that its own Ramify
answers `/3`.

- **`ramify-audit.json`:**
  - set `ignorePaths` to `["docs/**", "ramify-agent/**", "scripts/probes/**"]`;
  - drop the twelve `fullAuditPaths` patterns;
  - declare no undetected configuration file unless a literal inert file
    qualifies under D7, meaning a file that no tool detects.
    `undetectedConfigFilesForcingFullAudit` takes literal files only, never
    globs, and stage 2 refuses every kind but `inert`.
- **Probe fixtures.** Keep the two probe-fixture declarations in
  `module.ramify`, `owned-ignored "scripts/probes/fixtures/compiler-api"` and
  `owned-ignored "scripts/probes/fixtures/plan2a-symbol-details"`. Do not
  declare `scripts/probes` as owned-ignored. Q5b shows why:
  `scripts/measurements/materialize.ts` imports
  `scripts/probes/fixtures/synthetic-owners.ts`, which is root auxiliary
  source.
- **Executable.** Change the executable path in `CLAUDE.md` from 0.4.0 to
  the installed 0.6.0 (`/home/app/tools/ramify-audit-0.6.0` in Plan 8's
  handoff contents).
- **Baseline.** Expect a new full baseline, because the audit definition
  changes.
- **Interim audits.** From iteration 1 of this plan until adoption, toolkit
  audits in default mode under ramify-audit 0.4.0 or 0.5.0 cannot read `/3`.
  They fall back to full with `ramify-unavailable`. `--full` audits are
  unaffected.

### The old `fullAuditPaths` patterns under 0.3.0

These kinds were measured, not derived. The method: list the files tracked
at the release commit `63cb7ccf`, match them against each pattern with
ramify-audit 0.4.0's own matcher (root-anchored, `*` within one segment),
and ask the published artifact `ramify affected --batch` for every matched
path. The clone was at that commit. The answer is `ramify.affected-cli/3`
from 0.3.0, with `analysisCheck: passed` and 282 seeds. The evidence is in
`/home/app/ramify-audit-pb-evidence/ramify-0.3.0-prod/handoff-kinds/`.

| Pattern | Files matched | Kind | Selects |
| --- | --- | --- | --- |
| `ramify-audit.json` | `ramify-audit.json` | inert | [] |
| `package.json` | `package.json` | captured-input | all 15 |
| `package-lock.json` | `package-lock.json` | inert | [] |
| `tsconfig*.json` | `tsconfig.json` | captured-input | all 15 |
| | `tsconfig.scripts.json`, `tsconfig.build.json`, `tsconfig.portable.json` | inert | [] |
| `vitest.config.*` | `vitest.config.ts` | auxiliary-source | [ramify] |
| `vitest.*.config.*` | none | | |
| `vite*.config.*` | `vite.explorer.config.ts`, `vitest.config.ts` | auxiliary-source | [ramify] |
| `scripts/build-production.ts` | itself | auxiliary-source | [ramify] |
| `scripts/production-*.ts` | `scripts/production-artifacts.ts`, `scripts/production-files.ts`, `scripts/production-selection.ts` | auxiliary-source | [ramify] |
| `scripts/compiled-client.ts` | itself | auxiliary-source | [ramify] |
| `scripts/reference-harness/**` | 172 files | ignored, owned-ignored `scripts/reference-harness` | [] |
| `examples/collection-review/**` | 96 files | ignored, owned-ignored `examples/collection-review` | [] |

Every owned seed above is owned by `ramify`. The kinds equal the brief's
expectations. `package-lock.json` is `inert`, as iteration 0 recorded: the
revision holds it only as a 0-byte existence probe. The same holds for the
three inert `tsconfig.*.json` files.

Facts for the D7 decision, without making it:

- Only `inert` files can be undetected configuration files. Here they are
  `tsconfig.scripts.json`, `tsconfig.build.json`, `tsconfig.portable.json`,
  `ramify-audit.json` and `package-lock.json`.
- `ramify-audit.json` and the preparation lockfile are refused at the
  audit's stage 1, whatever their kind. That leaves the three
  `tsconfig.*.json` files as the only candidates.
- Under 0.6.0, other files are already covered by other means, according to
  Plan 8's qualification. A root `package.json` edit ran in full as a
  `preparation-input` (T4-08b). `vitest.config.ts` is a recorded runner
  configuration file. A `tsconfig.json` edit selects all 15 modules (T4-09).
- The `auxiliary-source` files select `ramify` and its importers. Files under
  `scripts/reference-harness/` and `examples/collection-review/` are
  `ignored`, so stage 2 would refuse them.

## ramify-agent changes

- Pin ramify-audit 0.6.0 and `ramify.ts` 0.3.0 exactly.
- Set `ignorePaths: ["docs/**"]` in `ramify-agent/ramify-audit.json`.
- Remove `"enclosingProject": "ignore"`, which 0.6.0 refuses.
- Prerequisite: the R7 root marker (`root module ramify-agent`) and
  declarations for its nested trees. At the release commit,
  `ramify-agent/module.ramify` still opens with `module "ramify-agent"`.
- Expect a new full baseline.
- Its source never invokes `ramify affected` directly. It consumes answers
  only through ramify-audit.
- Its prompt `.md` files beneath `src/` are `inert` and select nothing (J5).
  An edit to only one of them is an accepted miss under D1, which full audits
  catch.

## Open items

- **J5.** The planner proposed J5 and the coordinator settled it, quoting
  Dan's decision ("that's a consequence of being classified as inert"). No
  reversal was reported, and 0.3.0 implements it. No explicit confirmation
  from Dan of the consequence for ramify-agent's prompts beneath `src/` is
  recorded.
- **Deviations, iteration 0**
  ([results](iterations/iteration0-results.md)):
  - The contracts' "one seed per kind" row for `data/limits.json` did not
    show the data variant's `partial-coverage` widening. The coordinator
    corrected the contracts; the widening is existing behavior.
  - The plan-start audit reused the full audit of `b4858aec`.
  - The answers went to the evidence directory instead of the scratchpad.
  - The 169 recorded nested `package.json` absences now govern by directory
    (revised J3), not every module.
- **Deviations, iteration 1**
  ([results](iterations/iteration1-results.md)):
  - Test files beyond the brief's list changed.
  - The PB1-17 query with `package.json` and `tsconfig.json` now expects all
    five modules.
  - A missed PB1-20 touch point failed the first gate and was fixed in
    `cb292684`.
- **Deviations, iteration 2**
  ([results](iterations/iteration2-results.md#deviations)):
  - The brief's Q5 path does not exist. Q5 used the tracked
    `scripts/probes/fixtures/compiler-api/src/consumer.ts`.
  - The artifact and clone answers differ in `inputId` and
    `scope.selection`. `inputId` depends on where the analyzing `ramify.ts`
    package is installed.
  - The qualification answers are stored outside the receipt directory.
- **Post-release contract correction.** A description seed beneath its
  owner's `src/` has basis `area`, not `containment`. Plan 8's iteration 3
  found the error, and the engine was already right; the
  [execution record](main-plan.md#execution-record) records the change.
- **Follow-ups outside this plan:**
  - one captured-input predicate shared by analysis and contexts (J8);
  - historical base-revision dependency graphs;
  - moving a module's purpose from README into `module.ramify`.
