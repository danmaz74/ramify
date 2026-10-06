# Iteration 3 results: Audit reader and release candidate

Iteration 3 prepares ramify-audit 0.7.0 with the `/4` affected reader and both owned nested tree kinds. NT-12 through NT-15 pass. Nested discovery retains its existing logic; only its comments and renamed acceptance inputs change.

## Source identity and approved patches

- Worktree `/home/app/ramify-audit-nk`, branch `feat/nested-tree-kinds`, from clean main `38cfb308a5f1dad79af1e28eb82db1fdbc597f74`. The main checkout remains untouched.
- First commit `425d263`: approved R1/R2 phrases, after baseline hash checks.
- `a7fd505`: reader, tests, fixtures, current README and version 0.7.0.
- `cad7f76`, `331b424`: isolate the real nested-project fixture variant and align CLI help expectations; re-record its fixtures from the actual artifact.
- Final release source `5e5228da63fcab934dbb72622798b01482789344`: align only the current-writer producer fixtures with 0.7.0. The four historical schema-4 producer 0.5.0 fixtures remain unchanged and their compatibility checks pass.
- Every iteration commit is pushed; final release HEAD equals `origin/feat/nested-tree-kinds`. This results file is committed separately on Ramify's `plan/nested-tree-kinds` branch.

| Protected file | Before SHA-256 | After SHA-256 |
| --- | --- | --- |
| `docs/partial-audit.principles.md` | `7537032783b4d1cd1b8a803075fa71f518228f7c78e9d6c352a2387c1a9b4ff5` | `7be0159f6ee896bb4455eea3db5990b1aeb7721b5c5687f89abc66ba9cc8f913` |
| `docs/partial-audit.spec.md` | `07b36c55c72d0bed19a1d78be56e1cc2196a8584dfa575c37f098f76471ad13a` | `92fff95f2610206c8127931a8a8024068229a6d13f7a389b5cb4740fb6cfa02c` |

Only the approved phrases change. No other protected document or `/ramify` file was edited.

## Reader, fixtures and nested discovery (NT-12, NT-13)

The wrapper and embedded selection require `ramify.affected-cli/4` and `ramify.affected/4`. The exclusion type, allowed list, owned-kind list, owned-seed validation and rooted-topology list all accept `owned-unwired` and `owned-nested-project`. Each carries a required owner; owned seeds require that owner to match the seed's module. Both `/3` versions are refused as `unsupported-schema`.

The recorder and real/partial helpers pin Ramify 0.4.0. The recorder emits 22 actual documents from the immutable artifact, including distinct `owned-unwired-path` and `owned-nested-project-path` fixtures; the nested-project variant keeps the common topology unchanged. Direct tests exercise both kinds' empty selections and topology, null/mismatched owners, unknown topology owners, invalid exclusion kind and excluded-seed misuse. Existing ignore-list, configuration refusal, drift-cap and reuse checks remain covered. Four nested-discovery cases cover both kinds through `runAudit` and CLI while external definitions remain skipped.

Commands executed:

```sh
npm ci --no-audit --no-fund
npm run type-check
npm run build
RAMIFY_TARBALL=/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/artifact/ramify.ts-0.4.0.tgz \
RAMIFY_TARBALL_SHA256=9d608b1322f5b36b6b7ad518b000215f45f425a39152cf76a1127add4bfd5284 \
  node scripts/record-ramify-affected.mjs
npx vitest run test/expected-files.test.ts test/nested-audits.test.ts --maxWorkers=1
RAMIFY_TARBALL=/home/app/ramify-audit-pb-evidence/ramify-0.4.0-prod/artifact/ramify.ts-0.4.0.tgz \
RAMIFY_TARBALL_SHA256=9d608b1322f5b36b6b7ad518b000215f45f425a39152cf76a1127add4bfd5284 \
  npm run test:ramify-real
```

The corrected focused expected-file/nested check passed 67 tests in 2 files. Final real suite: 56 tests in 5 files passed, zero failures. The final full release gate below covers all corrected reader, service, help and evidence fixtures. The standard full suite ran through ramify-audit; the explicitly required opt-in real suite ran directly.

## Packed candidate

[Candidate receipt](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/candidate-final/RECEIPT.md), [identity](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/candidate-final/identity.json) and [manifest-bearing dry run](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/release-dry-run.json).

| Item | Value |
| --- | --- |
| Tarball | `/home/app/ramify-audit-pb-evidence/nested-tree-kinds/candidate-final/ramify-audit-0.7.0.tgz` |
| SHA-256 | `4f0d8acc3565f625de64c908cfcd1a8d8d3fd413422b90b3931311c6f41b4217` |
| Integrity | `sha512-2/1uFifIYfoN4FPf4hK4imBOBwyWyGhWvaBOdAnAnZKCJFWEV14AJMklG1QC1qVfynr+1y6pEpWqTGPYXE7Wzg==` |
| SHA-1 | `0dd0dae7f3f4291af2f8de6e656af14009fca2b2` |
| Bytes / files / unpacked bytes | 416957 / 251 / 1876909 |

The candidate was installed into the external scratch prefix `candidate/install/`. Its initial provisional source and final source produce the same exact tarball bytes; all qualification uses that identical payload. The final tarball is frozen mode 0444.

## Toolkit qualification (NT-14)

A clean detached clone at Ramify release `eaa156ec51ed47eae0c8d06efc2df422a25ba0e5` ran root and example `npm ci`; its audit definition, ignore list and declarations are unchanged. The packed candidate first ran `audit --cwd <clone> --full --force --json`: every check passed, 204 files / 2,838 tests passed, no failures/skips, `composition.verdict: pass`, outstanding failures 0, and expected-file verification **complete** (204 expected, 204 run). Baseline report `0f5533b43767d1c6095b45f6eb9f8fcf8aef9392`, run `refs/audited/runs/2026-10-06T22-22-17Z-eaa156ec5`. Durable evidence lives in the qualification clone's Git refs.

One commit per change, each branching from the exact release commit:

| Case | Selected modules | Report commit | Run ref |
| --- | --- | --- | --- |
| qualification-docs-full-reuse | reuse of baseline | `0f5533b43767d1c6095b45f6eb9f8fcf8aef9392` | `refs/audited/runs/2026-10-06T22-22-17Z-eaa156ec5` |
| qualification-docs | 0 | `7798c5f0cf2e8a2ae55babe99fba6c4e5a872021` | `refs/audited/runs/2026-10-06T22-32-06Z-648dc40f4` |
| qualification-example | 0 | `0b323c886f7ad5bcbd7dc1c7dc75186a4155dbdd` | `refs/audited/runs/2026-10-06T22-32-39Z-720e6344b` |
| qualification-tsconfig | 15 | `28bc1c32b3a28b44418dfa0a73e44776d833d0f6` | `refs/audited/runs/2026-10-06T22-46-24Z-3f47fda01` |
| qualification-source | 4 | `ec6f1c51ca55303a9acbaeba09fddf502da76788` | `refs/audited/runs/2026-10-06T22-47-28Z-0249771c1` |

The docs case uses `--force` for its partial request to record a zero-selection link, with an ordinary `--full` request first proving reuse of the original baseline. The example case changes a new source file beneath the already-declared nested project and selects nothing. An internal JSON-spacing edit of `tsconfig.json` selects all 15 modules. A comment edit of `subs/presentation/subs/project-view/src/dependency-graph.ts` selects `ramify/presentation/project-view` and its three importers (`ramify/explorer`, `ramify/integration-tests`, `ramify/presentation`). The configuration case passed 204 files / 2,838 tests with expected-file verification complete (204 / 204); the source case passed 25 files / 333 tests with expected-file verification complete (25 / 25). Both zero-selection cases have complete expected-file verification (0 / 0) and pass their configured non-test checks. All composed verdicts pass. The clone is returned to the exact release commit afterward.

[Qualification records](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/qualification-cases.json), [initial commands](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/qualify-cases.py), [remaining commands with preflight](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/qualify-remaining.py), [remaining-case transcript](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/qualification-cases.log), [docs/example and rejected preliminary fixture transcript](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/qualification-rejected-eof-cases.log). Partial-coverage notes remain diagnostic: the wider aggregate `testModules` does not replace the known changed/affected closure. Iteration 2's seed evidence remains authoritative for the owned exclusion semantics. Expected-file checks are complete wherever required; no fallback or declaration was added.

## Final release gate and dry run (NT-15)

```sh
env -u FORCE_COLOR /home/app/tools/ramify-audit-0.6.0/node_modules/.bin/ramify-audit \
  audit --cwd /home/app/ramify-audit-nk --full --force --json
npm run release -- --audited-source 5e5228da63fcab934dbb72622798b01482789344 \
  --audit-run-ref refs/audited/runs/2026-10-06T22-24-54Z-5e5228da6 --audit-producer 0.6.0
```

The exact clean release commit passed, `composition.verdict: pass`, outstanding failures 0, scoped false, chain depth 0; CLI exit 0. Every configured check completed:

| Check | Result | Evidence |
| --- | --- | --- |
| deps-check | pass | completed |
| packed-smoke | pass | completed |
| tests | pass | 49 files, 1306 tests; zero failed/skipped |
| type-check | pass | completed |

Run `8cc0a786-385b-432d-89ad-143c8d6c0c97`, report `872229d70cca1dd9e604f3b56a0e96560192cc2c`, run ref `refs/audited/runs/2026-10-06T22-24-54Z-5e5228da6`, tree ref `refs/audited/by-tree/6c236d732d5094220e5de4d4982aed8531bcbff9`. [Gate JSON](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/audit-release-gate-final.json), [summary](/home/app/ramify-audit-pb-evidence/nested-tree-kinds/release-gate-summary.json). The release dry run exited 0, clean source and detached checkout packed contents match, and both packed digests equal the qualified candidate digest. No package was published.

## Preliminary evidence and corrections

The first focused run exposed a stale expected-file exclusion count after adding the nested-project tree to the shared base fixture. CLI startup failures in that preliminary run were caused by a concurrent local `dist/` rebuild; its transcript is preserved and is not acceptance evidence. The nested-project fixture was isolated as its own variant, preserving the common topology. A later preliminary focused run found the two corresponding narrowed-command exclude expectations and a CLI help wording expectation; all were corrected.

A provisional full audit of `a7fd505` failed five tests: those two narrowed-command expectations, the help expectation, and two current-release producer golden files still naming 0.6.0. Report `bf5c7b851a5e11e4d45d8085d5c1b7beacf174bc`, run `refs/audited/runs/2026-10-06T22-16-57Z-a7fd50578`; preserved in `audit-release-gate.json`. These were concrete migration defects, not flakes. The final exact-source gate passes all of them.

One real-suite rerun was stopped before completion because its internal audit checks were waiting behind the toolkit baseline's machine test lock; `real-suite-final.log` is incomplete/unaccepted. Only that verified process tree was terminated. The accepted final real suite and all subsequent audits ran sequentially without contention. The initial queued toolkit baseline acquired the lock after waiting 110258 ms and completed; it was never called unrun or passing while waiting. A preliminary qualification forced the docs partial before requesting full reuse. The inherited lookup considers only the nearest audited commit; that partial record cannot answer a full request, so a new full run correctly occurred. Its complete evidence is preserved separately. The accepted case checks full reuse before forcing the zero-selection partial, on the same docs-only commit, and reuses the original baseline. No reuse policy changed. The first captured-input fixture appended a blank line at EOF: its 204 files / 2,838 tests passed, all 15 modules were selected and expected-file verification was complete, but the patch-integrity check correctly failed. Rejected report `dd5b090d3710754ca9ca509a3accb3fa73ebac53` and full output are retained in `qualification-rejected-eof-tsconfig.json`. The corrected fixture changes internal JSON spacing without changing its meaning. Both remaining cases preflight the exact changed path, `git diff --check`, final newline, and an actual-artifact seed/closure against independent expectations before expensive audit execution. No final flaky-test reruns or lock-wait-exceeded results occurred.

## Iteration 4 handoff

Use release source `5e5228da63fcab934dbb72622798b01482789344`, the exact final candidate tarball and SHA-256 above, and release-gate run `refs/audited/runs/2026-10-06T22-24-54Z-5e5228da6` with producer 0.6.0. The candidate already demonstrates complete `/4` expected-file verification on the toolkit release clone. Iteration 4 still owns the requested Ramify gate in its publication workflow, both publications, registry integrity checks, installed 0.7.0 tool, toolkit adoption and authorized agent documentation. No provider defect, unresolved implementation decision or substitute remains in iteration 3.
