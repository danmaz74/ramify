# Iteration 2 implementation evidence

Status: provider 0.3.2 is released and pinned; audit-consumer integration is
implemented in commits `488be829` and `72fc2a8d`. Focused checks pass. The
full-project audit and live Plan 18 acceptance remain separate pending evidence.

The provider released 0.3.1 from `c19a5b2a6afdef77185328a715831bff619e9e7f`
with dirty parsed dispatch, exact completed-request lookup, Cucumber parsing,
aggregation and raw artifact retrieval. It released 0.3.2 from
`3cb7acf248f0efa183dc67dcb71104a4a37f76a1` with producer-reported
executed Vitest files. The 0.3.2 release passed the provider's fresh full
0.3.1-produced source audit at
`refs/audited/runs/2026-09-29T15-35-50Z-3cb7acf24`, report
`8754c97c4453b3c5ab4f48f0255a9c10b3c1e00a`, and registry pack smoke.
The consumer pins `ramify-audit@0.3.2` exactly in package and lock files.

The audit child retains the complete published provider result and check
payload, actual check IDs, report commit and raw Cucumber artifact paths. It
writes local exact command and completion receipts; recovery asks the provider
for the completed request by request/source identity before considering another
execution. The Cucumber host bridge exists because it alone owns scenario
selection, profile setup/teardown and frozen tracked-scenario association. It
passes each actual raw message stream to the provider parser and uses the
provider aggregate. The old harness runner-status reducer was removed.

Readiness, standalone and engineer focused commands use the public parsed
dispatcher on dirty source without certifying HEAD. Focused commands use the
provider's focused lock mode, preserving the ordinary suite lock for gate
execution. Full diagnostics and explicit unknown/malformed reporter outcomes
flow to the repair brief. The new gate cause `check-failed` records command or
rule failure without inferring a path or owner; historical cause values remain
readable. The same engineer receives ordinary repair evidence.

Focused validation: TypeScript type-check and Ramify structural check passed
(zero structural errors or warnings). Scenario checks and briefings passed
58 tests; scenario state/materialization passed 26; audit, focused and gate
evidence passed 41 with 3 skipped; hook, acceptance and breaking-work passed
25 with 2 skipped after reporter fixture correction. The registered real
Vitest audit test passed against 0.3.2 and asserted both actual executed file
paths and passed states in the retained published check payload. Cause-routing
tests passed 83/85 initially; two prompt-string expectations were corrected
and their focused rerun passed 12/12. These checks do not replace the final
full audit, live Pi trial or served-browser artifact retrieval acceptance.
