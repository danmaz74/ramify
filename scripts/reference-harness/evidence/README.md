# Iteration 15 local evidence

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
