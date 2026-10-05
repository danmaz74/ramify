# Inert-wording slice results: compiler source, inert files and captured inputs

**Date:** 2026-10-05. **Status:** receipt for the documentation-and-small-fix
slice that applies the wording package the user accepted on 2026-10-05. It
awaits the coordinator's review, protected-file comparison and commit. Changes
are uncommitted in the main worktree. `reference:verify` and the audit were not
run.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `f342133a`, clean at assignment |
| Protected documents | `docs/model/glossary.md` `1cd8cbf3…` → `4bfc4361…`; `docs/model/module-description.spec.md` `20d42a00…` → `ae657596…`; `docs/architecture/cli-invocation.spec.md` `d57b7f41…` → `d55df21a…`; `CLAUDE.md` `e57362b4…` → `ae29199f…`; complete diff at `protected.diff` (`a474eedd…`) |
| Configuration | unchanged: every `package.json`, lockfile, `tsconfig*.json`, Vitest configuration, `ramify-audit.json` and `module.ramify`; nothing under `ramify-agent/`, `/ramify-audit` or `/ramify` |
| Node / tools | v22.23.3; TypeScript 7.0.2; Vitest 4.1.11 |
| Changed (source) | `subs/analysis/subs/project/src/inventory.ts`, `subs/analysis/subs/typescript/src/resolution.ts`, `subs/analysis/subs/typescript/src/tests/fixtures.ts`, `scripts/reference-harness/self-cases.ts`, `scripts/reference-harness/plan5-catalog-cases.ts` |
| Changed (prose) | the four protected documents above, `site/src/pages/glossary.md` (the four entries, verbatim), `docs/plans/project-boundary-ramify/handoff.md` (Follow-ups) |
| Added | `subs/analysis/subs/project/src/tests/source-extensions.test.ts`, this receipt |
| Evidence | `/home/app/ramify-pb1-evidence/inert-wording/` |

## Verification of the package against the implementation

A scratch project (`scratch/` in the evidence directory: a marked root,
`tsconfig.json` with `resolveJsonModule` and no `allowJs`, a module
`package.json`, a `package-lock.json`, `data/config.json` imported by
`src/main.ts`, `notes/design.md`, `scripts/tool.ts`, `scripts/legacy.js`) was
checked with the HEAD build through an isolated daemon endpoint
(`RAMIFY_ENDPOINT_DIR` in the evidence directory), then stopped.

| Case | Implementation | Evidence |
| --- | --- | --- |
| Capture versus inventory | Inventory files are exactly `src/` files (kind `source` or `resource`) and auxiliary source. `tsconfig.json` is read with role `configuration` (`configuration.ts:82`), a module's `package.json` with role `dependency` (`inventory.ts:217`), a compiler read of any other file with role `dependency` (`retained-source-analysis.ts` `#role`); none is inventoried. Lockfiles are never read. | `measure.json`: inventory is `README.md`, `module.ramify` (documentation), `scripts/tool.ts`, `src/main.ts` only |
| `module.ramify`, module `README.md` | Read with roles `description` and `readme`, listed by `measure` as documentation, and `checked`/`content` in a hook | `hook-checks.log` |
| Imported data file outside `src/`, captured | `checked`/`content`, before and after an edit; `decide` treats a `dependency` read with bytes as an analysis input | `hook-checks.log` |
| Uncaptured inert file (`notes/design.md`, `scripts/legacy.js` without `allowJs`) | `not-analyzed`/`owned-non-source`, exit 0 | `hook-checks.log` |
| Root `tsconfig.json`, module `package.json` (captured) | `checked`/`content` when the published revision covers the request with nothing pending; edited, or with anything pending, `not-checked`/`configuration-changed`, exit 2, and every other analyzed path in that request is not checked | `hook-checks-2.log`, `hook-checks-3.log` |
| `package-lock.json` (uncaptured) | Always `not-checked`/`configuration-changed`, exit 2, even on a settled daemon: the configuration pattern (`context-manager.ts:38`) names it and `expectationMismatch` never finds it captured, so the request is never covered | `hook-checks-3.log` |
| JavaScript inside `src/` without `allowJs` | Inventoried as source (`inventory.ts:243` applies no admission rule there) and reported as a `compiler-blocked` analysis limit | `js-in-src.log` |

Discrepancies with the package, stated in the specification as implemented
and left for the user:

1. **Configuration files in the hook check.** The package says an inert file
   the covering revision captured is `checked` and an uncaptured one is
   `not-analyzed`. A configuration-named path (`tsconfig*.json`,
   `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, or a
   file captured with the configuration role) follows the configuration rule
   instead. A captured one is `checked` only when already covered; an
   uncaptured lockfile is never `not-analyzed` and can never be checked by a
   hook.
2. **JavaScript inside `src/`.** The glossary's compiler source admits
   JavaScript only with `allowJs`; inside `src/` every file with the eight
   extensions is inventoried as source regardless, so an unadmitted `.js` file
   there is source but not compiler source.
3. **Captured input versus `CapturedInput`.** The glossary term covers a
   file's content or absence; the code's `CapturedInput` list also records
   directory listings and existence probes. A probed-only file is not a
   captured input under the glossary, and the hook answers it `not-analyzed`,
   which agrees.

## Changed behaviour

None at the product level. The compiler-source pattern `/\.(?:[cm]?[jt]sx?)$/`
also matched `.mtsx`, `.ctsx`, `.mjsx` and `.cjsx`; it is now
`/\.(?:[cm]?ts|tsx|[cm]?js|jsx)$/`. The same tightening applies to
`resolution.ts` (`codeFile`, a new `codeExtension`, the resource-like
specifier test and both extension stems), the TypeScript owner's test
inventory fixture, the harness self-case's auxiliary-source assertion and the
Plan 5 harness's editable-target filter. `scripts/production-artifacts.ts`,
`test-titles.ts` and `session-revision.ts` already listed exact extensions. No
file in the toolkit, the example, the harness fixtures or `ramify-agent/` has
one of the four non-extensions.

## Commands

| Command | Exit | Result | Evidence |
| --- | --- | --- | --- |
| `git diff --check` | 0 | clean | |
| `npm run type-check` | 0 | | `type-check.log` |
| `npm run build` | 0 | | `build.log` |
| `npm run check:self` | 0 | 15 owners, 598 source files (597 tracked at HEAD plus the new test), 17 resources, 0 errors, 0 warnings, 41 analysis limits, 5668 allowed, 0 denied | `check-self.log`, `measure-self.json` |
| `npx vitest run subs/analysis/subs/project/src/tests/source-extensions.test.ts` | 0 | 1 file, 2 tests | `vitest-new-test.log` |
| `npx vitest run subs/analysis/subs/project/src/tests` | 0 | 15 files, 317 tests | `vitest-project-dir.log` |
| `npx vitest run subs/analysis/subs/typescript/src/tests` | 0 | 20 files, 222 tests | `vitest-typescript-dir.log` |
| `npx tsx scripts/validate-final-contracts.ts` | 0 | 15 owners, 615 files | `validate-final-contracts.log` |
| `npm run site:build` | 0 | | `site-build.log` |
| `npm run reference:cases` (locked) | 0 | 37 files, 393 tests | `reference-cases.log` |

## Proposed, not applied

- `module-description.spec.md`, "Ownership does not imply analysis": "inert
  owned files need not be listed, hashed or watched" is false for an inert
  captured input. Proposed: "Inventory only the source and resources the
  analysis reads and fingerprints; an inert file is never inventoried, and it
  is hashed and watched only when an analysis revision captures it."
- `cli-invocation.spec.md`, configuration rule: the code names every
  `tsconfig*.json`, not only `tsconfig.json`, and the lockfiles
  `package-lock.json`, `yarn.lock` and `pnpm-lock.yaml`.
- `glossary.md` status line: it could record the 2026-10-05 adoption of the
  four entries.
- The three `CLAUDE.md` sentences iteration 19 found stale, with replacements
  in the coordinator's report.

## Coordinator review

The user accepted the wording package on 2026-10-05 and authorized the
specification changes that follow from it. The coordinator reviewed the
verification, reported the two discrepancies before committing, as the user
had asked, and applied the answers:

- The user reworded the glossary's "Compiler source" entry so that it carries
  the `src/` scope itself: a JavaScript file is compiler source when it lies
  beneath a module's `src/` or the root compiler configuration admits
  JavaScript. The layout specification drops the exception sentence and keeps
  the analysis limit for a JavaScript file in `src/` the compiler does not
  load. The site glossary carries the same entry.
- The user authorized one sentence in
  `cross-module-importability.principles.md`: "Ramify's checks implement
  them." replaces the statement that the tooling changes are not yet
  implemented. No principle changed.
- The relay session, under the user's standing instruction, accepted the
  specification's statement of today's configuration rule in the hook check,
  the exact list of configuration-named files, the sentence that an inert
  file is hashed and watched only when a revision captures it, and keeping
  the lockfile behaviour for this phase; the handoff lists that behaviour
  under known defects. The user was told and may override these.

No behaviour changed except the source-extension pattern, which no existing
file exercises. The glossary's status line now states what is implemented.
The three other out-of-date sentences of `CLAUDE.md` wait for the user's
wording and land separately.
