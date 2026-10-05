# Iteration 2 results: nested-tree parser and statement partition

**Date:** 2026-10-03. **Status:** implementation receipt; see the coordinator review below. At the time of writing it awaited the
coordinator's review, protected-file comparison and iteration gate. Changes are
uncommitted in the working tree. PB1-01 and PB1-02 pass at this slice's focused
evidence boundary; tree validation, discovery and ownership are not claimed.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit / tree | `f61213ae76a8e763a3c2aad8a7d257f036a06573` / `78b32d2601280098c4b69884ae29ea7eb7d04c06` |
| Contract revision | `contracts.md` blob `2aa469b0651d7dc39c7e7ab17d88135f1cc1db25`; `module-description.spec.md` blob `47d5dd14b858f3ddebfd996ebb6f432eeac6317a` |
| Audit configuration / lockfile | `ramify-audit.json` blob `b59f28f6…`; `package-lock.json` blob `fd3c84ba…` (both unchanged) |
| Working-tree diff at the reference run | `git diff` sha256 `5d22b190f01f5e4fbf514b82cd0eb6bde5d6dce0aad729565bda9ba15ccdaad6`, plus the new test file (sha256 `45229360…`) |
| Evidence | `/home/app/ramify-pb1-evidence/iteration2/` |

## Changed behavior

1. **Grammar.** `parseDescription` accepts `owned-ignored "directory"` and
   `external "directory"` after both headers, before, between or after
   exposure statements. Each yields a `NestedTreeStatement` with `index`
   among all statements, `kind`, the statement `span` (keyword through closing
   quote) and `directory: { value, span }`, where `value` is the decoded string
   as written; normalization, containment and filesystem checks stay with
   project acquisition. The existing UTF-8 scalar, escape, comment,
   physical-line and span rules apply unchanged.
2. **Reserved names and tags.** Both words joined the tokenizer's keyword set,
   so they need quotes in every name position. The tag parser admits them as
   lowercase tag names, like `testing`, `browser` and `ui`; they resolve only
   through the registry, and a declaration defines no tag.
3. **Malformed statements** are description errors with existing codes:
   an unquoted, missing or non-string directory is `invalid-name`, an empty one
   `empty-name`, a decoded control character `invalid-name`, any further token
   `unknown-clause` (or `trailing-token` for punctuation), a missing separator
   `invalid-whitespace`, a statement before the headers `invalid-order`.
   No new issue code was added.
4. **Statement union.** `DescriptionStatement` is now
   `ExposureStatement | NestedTreeStatement`; the exposure member keeps every
   existing field. The linker (`link.ts`), exact source references
   (`project/src/references.ts`) and the report's diagnostic location lookup
   (`analysis/src/report-data.ts`) read exposure members only. Narrowing uses
   `'directory' in statement`: with `kind` a two-value union on both members,
   TypeScript 7.0.2 does not narrow by eliminating kind values.
5. **Relays.** `ExposureStatement` and `NestedTreeStatement` are added beside
   `DescriptionStatement` in `subs/analysis/module.ramify` (from descriptions,
   to parent and descendants) and root `module.ramify` (from analysis, to
   descendants). `scripts/validate-final-contracts.ts` records them as a named
   layer, and its manifest lists a tree statement by kind and directory.
6. **Report identifier.** `AnalysisReport.schemaVersion` and the producer are
   `ramify.analysis/2`. Readers updated: toolkit tests (`session`,
   `modularity`, `modularity-fixture`, daemon `service`, `measure-driver`,
   contexts `history-fixture`, service-api `project-view`, root `cli-process`,
   `resident-cli`, `compiled-client`), `scripts/measurements/resident-driver.mjs`,
   `resident-failure.test.mjs`, and the harness's expected values in
   `relocation.ts`, `resident-cli-cases.ts`, `plan5-hook-cases.ts`,
   `equivalence.test.ts`, `cli-cases.ts`, `equivalence-comparison.ts` and
   `session-expectations.ts`. The analysis and CLI READMEs now name `/2`, and
   the descriptions README describes the union.
7. **Harness typing.** `parser-cases.ts` and `final-contracts.test.ts` narrow
   to exposure members; a tree statement in their fixtures would fail the
   statements comparison. No case was added, removed or skipped.

## Tested case instances

`subs/analysis/subs/descriptions/src/tests/project-boundary-grammar.test.ts`
(42 tests). Expected offsets were counted from the fixture texts, independently
of the parser, in UTF-16 code units.

- **PB1-01:** both kinds interleaved with `expose-src` and `expose-sub`, with
  exact statement, directory, selection and source spans and indices 0–4;
  keyword tokens and comment exclusion; BOM, CRLF, tab separators, `é` and
  `\/` escapes and an astral directory; directories kept as written; three
  statement orders; both keywords in module and exposure tag clauses; reserved
  in all five name positions and accepted quoted; prefixes and other letter
  cases left unreserved.
- **Positive exposure controls:** four exposure forms keep their meaning when
  three tree statements are interleaved. In `linking.test.ts` a linked
  description with interleaved trees equals the control in which each tree
  line is a comment of equal length, and the exact reference carries index 1.
  In `project/src/tests/references.test.ts` acquisition produces one reference,
  at statement index 1, from injected tree and exposure statements.
- **PB1-02:** 31 located malformed inputs: unquoted, path-shaped, keyword,
  single-quoted, wildcard and missing directories; empty and control-character
  directories; a multiline string; tag, `to` and `from` clauses; a second
  directory; comma and semicolon; missing and non-ASCII separators; wrong-case
  and quoted keywords; statements before the headers; repeated version and
  module headers after a tree statement; bare CR; isolated surrogate escapes
  and characters; a raw control character; an unknown escape. One test reports
  every malformed tree line in order without publishing the valid ones.

Byte-level UTF-8 failures are detected before parsing by acquisition
(`invalid-encoding`, unchanged and already tested in `project.test.ts` and
`observer.test.ts`); the parser receives a string.

## Commands and results

All runs used the working tree above, with `FORCE_COLOR` unset; vitest and
reference runs held `/tmp/ramify-audit-tests.lock`.

| Command | Result | Evidence |
| --- | --- | --- |
| `git diff --check` | Exit 0; the new test file has no trailing whitespace | `diff-check.out` |
| `npm run type-check` | Exit 0 (all four compiler scopes) | `type-check.out` |
| `npm run build` | Exit 0 | `build.out` |
| `npm run check:self` | Exit 0: passed, complete; 15 owners, 450 source files, 0 errors, 0 warnings, 0 analysis limits, 0 denied | `check-self.out` |
| `npx vitest run …/project-boundary-grammar.test.ts` | Exit 0, 42/42 | `vitest-project-boundary-grammar.out` |
| `npx vitest run` descriptions and project test directories | Exit 0, 14 files, 401/401 | `vitest-descriptions-project.out` |
| `npx vitest run` analysis report, modularity, validation and inventory files; daemon `service`, `measure-service`, `ipc`; contexts directory; service-api `project-view` | Exit 0, 29 files, 366/366 | `vitest-analysis-daemon.out` |
| `npx vitest run src/tests/cli-process.test.ts src/tests/resident-cli.test.ts src/tests/compiled-client.test.ts` | Exit 0, 28/28 | `vitest-root-cli.out` |
| `node --test scripts/measurements/resident-failure.test.mjs` | Exit 0, 5/5 | `resident-failure.out` |
| Harness `final-contracts.test.ts` and `equivalence.test.ts` | Exit 0, 44/44 | `reference-focused.out` |
| `npm run reference:cases` (once, after build) | Exit 1: 389/390 pass; `I5-12:burst-coalesced` failed with `SyntaxError: Unterminated fractional number in JSON` in `readTrace` | `reference.stdout`, `reference.stderr`, `reference.exit` |
| Harness `plan5-live.test.ts` alone | Exit 0, 6/6, including `I5-12:burst-coalesced` | `reference-plan5-live-rerun.out` |

The failure is the harness reading the daemon's trace file while a line is
being written: `readTrace` (`equivalence-process.ts`) parses every line,
including a partial last one. It involves no report identifier or description,
and the isolated rerun passes. It was not fixed here; the full audit gate was
not run by this agent.

## Protected documents

No `.principles.md` or `.spec.md` file was edited.
`proposed-spec-patches.diff` (sha256 `d3ca9962…`, four hunks, `git apply
--check` clean) proposes `ramify.analysis/2` at
`docs/architecture/cli-invocation.spec.md` lines 158 and 171, and a status
update in `docs/model/module-description.spec.md` (lines 3–7 and 1046–1048)
saying the parser accepts the statement syntax while validation remains
pending, for application after the gate passes.

## Remaining for later slices

- Tree statements are parsed and ignored by acquisition: no containment,
  overlap, existence or symlink validation, no exclusion from inventory, no
  `invalid-nested-tree` or related Project issue (iterations 3, 7, 8). Until
  then a declared tree's contents are still treated as before.
- No toolkit description declares a tree yet (iteration 7).
- `ramify.analysis/2` is extended by iterations 3, 4, 8 and 11.

## Gaps for the coordinator

1. Left at `/1` deliberately: the reviewed instance rows
   `scripts/reference-harness/plan2-instances.ts` (`I2-20:json-bare-report`) and
   `plan5-instances.ts` (`I5-11:plain-check-unchanged`), compared byte for byte
   with their plans' `subcases.md` rows; recorded probe outputs under
   `scripts/probes/results/modularity/`; non-protected documents
   `docs/architecture/daemon.md` (339, 699),
   `docs/architecture/processes-and-clients.md` (153),
   `docs/development/resident-verification.md` (10) and historical plans.
2. `ramify-agent` reads `ramify.analysis/1` from its pinned published package;
   it is unaffected until it adopts a build of this phase.
3. The modularity report's `analysisSchema` value now reads
   `ramify.analysis/2`; its type and shape are unchanged, so
   `ramify.modularity/2` stays until iteration 8.
4. The `I5-12:burst-coalesced` partial-trace race needs an owner if it recurs
   at the gate.
5. Until iteration 8, a description may declare a tree that acquisition
   ignores. No toolkit file does; rejecting declarations early was not asked
   for and was not added.

## Coordinator review

The coordinator reviewed the source diff against the brief and the adopted
grammar, authorized `proposed-spec-patches.diff` unchanged and applied it with
this slice. The protected comparison against `f61213ae` lists exactly
`cli-invocation.spec.md` and `module-description.spec.md`. The three
non-protected architecture and development documents that named
`ramify.analysis/1` now name version 2. The partial-trace race behind the
`I5-12:burst-coalesced` failure was repaired separately in `3b73122b`: the
harness's trace reader skips a line still being written. Reusing the existing
description issue codes for malformed tree statements is accepted; the
contracts name none. The iteration gate runs on the committed candidate and
its result is recorded in the evidence directory named by that commit.
