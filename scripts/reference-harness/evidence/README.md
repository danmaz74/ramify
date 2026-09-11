# Reference harness evidence

## Plan 2 iteration 14 incomplete checkpoint

`plan2-iteration14-incomplete.json.gz` retains the unfiltered Plan 2 gate from
2026-09-11: 176 required, six passed, fourteen failed and 156 not executed.
`planComplete` is false. It records all independent instance metadata,
assertions, process observations and source/build identities. It does not
replace Plan 1's completion archive or establish resident acceptance.

The five newly registered I2-30 handlers fail on the actual resident connection,
service type, final declaration and eight-entry package requirements. The two
external copies complete frozen dependency installation, build, type-check,
compiled batch reference checks and `npm pack`, then fail the independent entry
list before installing that incomplete archive. The contexts compiler diagnostic
is retained. All eleven observed sequence/completion process lifetimes have no
leaks. `I2-30:plan1-regression` remains unexecuted.

The compressed report is an exact, lossless copy of
`.reference-work/reports/plan2-full-fbbe2457-c208-4195-b36e-9ec23b7ceaeb.json`.
The report's source identity precedes adding this archive and README entry;
the compiled build is unchanged. Read the report with:

```sh
gzip -dc scripts/reference-harness/evidence/plan2-iteration14-incomplete.json.gz
```

The [iteration-14 report](../../../docs/plans/iteration-2-resident-verification/iterations/iteration14-results.md)
separates these failures, the passing batch self-check, measurement checkpoint,
automation-owned regression runs and the missing macOS evidence.

## Plan 1 completion gate on main

`plan1-complete.json.gz` retains the portable report of the unfiltered
`npm run reference:verify -- --plan 1` run on the merged `main` at
`f5b0939d6dcce369375ea5b206f50c87ec510ac6` on 2026-09-10, with a clean tree.
Result: passed, `planComplete: true`, 308 required, 308 passed, 0 failed,
0 not executed, in 902,129 ms. Source SHA
`5271fb2e34c4f4a6209d574f9242e681b085ca7529f56ca16c2f1322c461ddad`, build SHA
`a2a0148124f14bad145e8779f0be66731ab3e6cdd83ebd41ea4b0b110f9c91b4`, Node v22.23.2,
TypeScript 7.0.2. The payload is retained without edits: 11,607,583
bytes, SHA-256 `9ef0d8f78897b9f337ac44c0b2ea94c0eb4e2653156c3e82bf040368864acbb0`; the gzip stream
uses level 9 and timestamp zero, 967,269 bytes, SHA-256
`205420f22e6bcfaa45d866712805554bf0a7ab92b9117a1c692d8035dceddcde`. Read it with:

```sh
gzip -dc scripts/reference-harness/evidence/plan1-complete.json.gz
```

## Iteration 15 local evidence

`iteration15-local.json.gz` retains ten focused architectural/lifecycle instance
executions and the separately labelled relocation smoke. Read it with:

```sh
gzip -dc scripts/reference-harness/evidence/iteration15-local.json.gz
```

The ten cases retain 356 actual assertions, including their clean baselines.
The two toolkit cases contribute 109; the remaining cases cover cancellation
during acquisition/catalog work, read failure, completed/in-flight disposal,
report retention and input changes that stabilize or exhaust the retry budget.
The negative is the reviewed visible root `BatchInvocation` type imported by
layout without `dispatch`. The 61 relocation assertions cover frozen dependency
installation, clean build, type-check, all seven installed package entries and
clean/denied/restored CLI checks. Relocated Vitest is explicitly unrun in this
local smoke; the full registered handler requires it. This artifact has
`planComplete: false` and does not replace the 308-instance gate or regression.

The runtime build digest is
`435bd02d03e953fd753479b086365e8e5a2570af9d8c9a6564b8412746df4cb4`
using the harness's sorted path/NUL/bytes/NUL recipe. Revision and dirty source
identity are retained inside; source/build stability was checked across the
focused run. The source hash predates this artifact's final archive and README
update. Root and scratch paths are portable labels.
The uncompressed payload SHA-256 is
`2123ff38d2daaef3702ea90055c3c3bd05c715b1e1696180fc47cfb204f33fce`.

Separate [batch measurement evidence](../../measurements/README.md) records
resource costs and their exact runtime/fixture identities. The workflow
[completion report](../../../docs/plans/done/iteration-1-project-verifier/iterations/iteration15-results.md)
distinguishes locally established results from automation-owned acceptance.
