# Iteration 10 results: auxiliary original exposure

**Date:** 2026-10-04. **Status:** implementation receipt for
[iteration 10](iteration10.md). It awaits the coordinator's review,
protected-file comparison and gate. Changes are uncommitted in the working
tree. PB1-13 is produced here; its final qualification stays with iteration 20.
`reference:verify` was not run: the coordinator's gate runs it.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `307e86fa` (tree `29aebc0e…`), clean at assignment |
| Contract revision | `contracts.md` blob `ea76b4ec…`; `module-description.spec.md` `3a0c90c8…`; `cross-module-importability.spec.md` `6eb1ca6c…`; `typescript-source-interpretation.spec.md` `945ad6bd…`; `glossary.md` `0fff2124…` (all unchanged; patches proposed below) |
| Configuration | unchanged: `package.json`, `package-lock.json`, `ramify-audit.json`, every `tsconfig*.json` and Vitest configuration; nothing under `ramify-agent/` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Evidence | `/home/app/ramify-pb1-evidence/iteration10/` |

## Changed behaviour

Linking (`subs/analysis/subs/descriptions/src/link.ts`,
`src/interfaces/linking.ts`) reports a selection whose export denotes an
original defined in auxiliary source as the new link issue code
`auxiliary-original-exposure`. The catalog has already followed every
forwarding export to its original (the TypeScript source interpretation), so
one check on the selected export's original covers each path:

| Path | Behaviour |
| --- | --- |
| Exact named `expose-src` or `expose-test` selection of a file that re-exports or forwards an auxiliary original | Finding at the selected name (`name` or `name as alias`) |
| Same-owner forwarding chain of any length, including star re-exports | Same finding; the chain length does not matter |
| `expose-src *` of an interface file forwarding one | Finding at the `*`, one per auxiliary export; the file's other exports are unreported |
| `expose-sub` re-exposure of a child's name denoting one, by name or wildcard | Finding at the parent's selected name or `*` as well as at the child's selection |
| `expose-src` path that itself points outside `src/` | Unchanged: Project's `invalid-path` error, and linking's `invalid-prerequisite` for the non-file reference; no auxiliary finding |
| Export of another owner's auxiliary original | Unchanged `foreign-original`, which is checked first |
| Chain through auxiliary source ending at an original beneath `src/` | Exposable, unchanged: a forwarding alias keeps its original's ownership |

The original keeps its ownership, auxiliary origin and tags: a tag clause on a
rejected selection is still validated for unknown tags, as before, but is not
assigned to the auxiliary original. The rejected selection stays declared in the child's
contract, so a parent's re-exposure names the same original rather than
producing a cascading `missing-export`.

**The finding.** Code `auxiliary-original-exposure`; severity error (the
module description specification's validation table lists the condition among
the errors from which no valid model is published). Location: the selection
(the selected name's span, or the wildcard's span), followed by the original's
declaration locations; in an analysis report that is `location` and `related`,
category `description`. Message, for example: `Export "tool" in
subs/a/src/forward.ts denotes the original tool of app/a, defined in auxiliary
source subs/a/scripts/tool.ts; an auxiliary original cannot be exposed`; for a
re-exposure it begins `Name "tool" from child app/a`.

**What a bad selection invalidates.** The whole linked description set, as
for every other condition in that table: linking returns `invalid` with no
model, so the analysis run's execution is `invalid`, its check `failed` and its
access coverage `not-run`. It does not stop linking: every other statement and
selection is still validated and its own error reported, and ordinary
selections in the same statement or file raise nothing.

**Re-exposure reports each statement.** The glossary says re-exposing is not
different from exposing, and the validation row names any exposure selecting an
auxiliary original, so each statement that selects one is reported, as the
model refuses each such `Exposure`. A grandchild, child and root relaying one
original therefore give three findings.

**Model.** `buildModel` already refused, since iteration 8C, any exposure of
an auxiliary original, owned or re-exposed, as `ungrounded-exposure` located at
the exposure's evidence. That check is unchanged (comment updated); new tests
cover forged owned, root-to-descendants and re-exposure inputs with
`src/` positive controls. The model keeps `ungrounded-exposure` because the
contracts name a code only for linking (see decisions).

**Signature companions.** A companion that is an auxiliary original is visible
only in its owner and can never be exposed. The companion rule (importability
specification, "Exposure Requires Available Signature Companions") then makes
any exposure of its symbol an `exposed-without-companion` violation (reason
`not-visible`) at the first exposure step, leaving the model valid. The
auxiliary finding applies only to an exposure *selecting* an auxiliary
original, which a companion is not. The specifications therefore give
`exposed-without-companion` only; no code was needed and tests pin it.

READMEs: Descriptions (the linker paragraph) and Model (the stale sentence
saying the model rejects every auxiliary origin, left from before 8C). Neither
first paragraph changed; no exposure statement changed, so the final-contract
validator needs no layer.

No document changes shape: link and analysis codes are open sets, and no closed
status field gains a value. `ramify.analysis/2` is extended.

## PB1-13 evidence

| Test | Independent expectation |
| --- | --- |
| `subs/analysis/subs/descriptions/src/tests/auxiliary-exposure.test.ts` (17 tests, new) | Written facts of root `app` and child `a`; locations computed from the description texts. Denials, each exactly one finding at the selection plus `tool`'s declaration: exact via `forward.ts`, a three-file chain, an alias, an interface wildcard, `expose-test`, a tag clause. A statement `api, tool` reports `tool` only, and an unrelated `missing-export` is still reported. Named and wildcard `expose-sub` give findings at both the root's and the child's selections. The root's own auxiliary `helper` to descendants. A path escaping `src/` stays `invalid-prerequisite`; the child's auxiliary original forwarded by a root file stays `foreign-original`. Positive controls: `api` through each of the same paths, an auxiliary relay ending at `api.ts`, both re-exposure forms; auxiliary originals stay catalogued with owner, origin and tags `[]`. Forged model inputs: owned to parent, root to descendants, child plus re-exposure, each refused at every forged exposure; the same shapes for `src/` originals accepted. Companions: `make` (companion auxiliary `tool`) to parent and `configure` (companion root auxiliary `helper`) to descendants give `not-visible` violations; `build` with exposed `api` none; the model and exposures stay valid and effective |
| `subs/analysis/src/tests/auxiliary-source.test.ts`, "through the real catalog" (3 tests added) | The written topology plus mutation 4 through `analyzeProject`: `src/forward.ts` forwards `tools/tmp/helper.ts`, `chain.ts` star-re-exports it, `interfaces/contract.ts` aliases it as `tool`, `a`'s `relay.ts` forwards `scripts/tool.ts`, root re-exposes it. Five `auxiliary-original-exposure` description diagnostics at the computed locations with the defining file related; execution `invalid`, check `failed`, coverage `not-run`. Positive control: the same chains and wildcard for `main`/`api` link and give the expected exposures. `expose-src helper from "../tools/tmp/helper.ts"` gives only `invalid-path` |

Negative control: with `link.ts` restored to `307e86fa`, the nine linking
denials and the real-catalog denial fail (the base linker reported the model's
unlocated `invalid-prerequisite`), and the twelve controls, forged-model and
companion tests pass (`negative-control-final.log`; first run
`negative-control-base-link.log`, `negative-control-base-link-analysis.log`).
`link.ts` was restored byte-identically (`cmp`).

## Toolkit and example self-checks

`npm run check:self`: exit 0, passed, coverage partial; 15 owners, **575 source
files** (574 + the new test file), 17 resources, 8442 accesses, 0 errors, 0
warnings, **41 analysis limits**, 5433 allowed, 0 denied, 2965 external. The
new file accounts for the differences from iteration 9 (+20 accesses: 16
application, 4 external). Link completed with no finding, so no toolkit
description exposes an auxiliary original. Example
(`examples/collection-review`): exit 0, passed, complete; 56 files, 318
accesses, 0 limits, unchanged; no auxiliary original exposed.

## Re-reasoned expectations

None. Existing tests keep their expectations; `auxiliary-source.test.ts`'s
`report()` gained an optional mutation parameter. No harness file changed, no
reviewed instance row, count or identity changed, and no row became stale.
Single instances run as regression evidence for the new toolkit test file, all
passed: I1-27 `self-check`, `self-negative`; I2-30 `self-check-fifteen`,
`self-negative-contexts`.

## Commands and results

All test and harness commands ran under `flock /tmp/ramify-audit-tests.lock`.
Final results after the last source edit (first runs in `run1/`, identical counts).

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` | 0 | clean | `diff-check.log` |
| `npm run build` | 0 | built | `build.log` |
| `npm run type-check` | 0 | four scopes | `type-check.log` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 592 files | `validator.log` |
| `npm run check:self` | 0 | passed, partial; 575 files, 8442 accesses, 41 limits, 0 errors, 0 denied | `check-self.log` |
| `dist/src/ramify check --root examples/collection-review --batch` | 0 | passed, complete; 56 files, 318 accesses | `example.log` |
| `npx vitest run subs/analysis/subs/descriptions/src/tests/auxiliary-exposure.test.ts` | 0 | 17 tests | `t-aux-exposure.log` |
| `npx vitest run subs/analysis/src/tests/auxiliary-source.test.ts` | 0 | 5 tests | `t-aux-source.log` |
| `npx vitest run subs/analysis/subs/descriptions/src/tests` | 0 | 7 files, 309 tests | `t-descriptions.log` |
| `npx vitest run subs/analysis/subs/model/src/tests` | 0 | 11 files, 232 tests | `t-model.log` |
| `npx vitest run subs/analysis/src/tests --maxWorkers=4` | 0 | 41 files, 472 tests | `t-analysis.log` |
| Negative control (base `link.ts`, both PB1-13 files) | 1 | 10 failed, 12 passed | `negative-control-final.log` |
| Plan 1 instances I1-27 ×2 (`some-instances-p1.mts`) | 0 | 2/2 passed | `p1.log` |
| Plan 2 instances I2-30 ×2 (`some-instances.mts`) | 0 | 2/2 passed | `p2.log` |
| `npm run reference:cases` (frozen tree, 12:08:36–12:14:53 UTC) | 0 | **37 files, 393 tests**; tree unchanged during the run (`diff-*-cases.sha`) | `cases.stdout`, `cases.stderr` |

`reference:verify` was not run (left to the coordinator's gate).

## Protected documents

No `.principles.md`, `.spec.md` or glossary file was edited. Proposed patch
`/home/app/ramify-pb1-evidence/iteration10/proposed-spec-patches.diff` (sha256
`5a5d0bc3…`, 4 files, 5 hunks, `git apply --check` clean), status wording only:

- `module-description.spec.md`, status and implementation note: linking
  rejects an exposure selecting an auxiliary original, directly or through
  forwarding aliases, with the located `auxiliary-original-exposure` error; the
  declared-tree import rule (and the rest of whole-tree ownership) remains.
- `typescript-source-interpretation.spec.md`, status: the rejection is
  implemented; the definite project-boundary finding and the excluded-target
  limit remain.
- `cross-module-importability.spec.md` and `glossary.md`, status lines:
  auxiliary originals are never exposed.

## What iteration 11 still lacks

The denied outcome, `project-boundary-import` for nested-tree targets
(including type-only and symbol-free loads and re-exports), and the
`excluded-target` limit; unchanged here.

## Gaps and decisions needed

1. **Model code.** A forged auxiliary exposure handed to `buildModel` is
   refused as `ungrounded-exposure` (since 8C), not `auxiliary-original-exposure`.
   The contracts name the code only for linking. In a real run linking reports
   first, so the model code surfaces only for direct model callers. Renaming it
   would add the code to the closed `ModelIssue['code']` union and to the
   linker's model-code mapping; left to the coordinator.
2. **Re-exposure findings.** Each statement selecting an auxiliary original is
   reported (see above). If only the first exposure step should be reported,
   as for companions, the child's rejected selection would leave the contract
   and the parent would need an explicit suppression, not a `missing-export`.
3. **Namespace re-exports.** `export * as ns from '../scripts/x.js'` gives an
   export without a single original, which the linker (by reading its code,
   not tested here) already rejects as `incomplete-expansion`; no
   auxiliary-specific finding is produced for it.

## Coordinator review

The coordinator reviewed the linking check, the model tests and the companion
outcome against the brief and the specifications, authorized
`proposed-spec-patches.diff` unchanged (status wording) and applied it with
this slice. Accepted: the model keeps `ungrounded-exposure` for a forged
exposure, since the contracts name the located code for linking only; every
statement that selects an auxiliary original is reported, because each is an
exposure of it; a namespace re-export of an auxiliary file stays an incomplete
expansion. The agent did not run `reference:verify`; the coordinator's gate
runs the audit, `reference:cases` and the full Plan 1 and Plan 2 verification
on the committed candidate.
