# Optimization 4: write guard ownership responses

The ten ordinary write guard cases now run real filesystem, symlink resolution,
canonical scope capture and placement decisions with strict literal ownership
provider responses. Both existing seams are injected: `resolveWriteScope`'s
`ramify` and `guardedScopeOf`'s third argument. No production source changed.

The original six PB3/F1 tests moved to `write-guard.boundary.test.ts`. Each title,
callback body and expectation remains unchanged, including PB3-S07's actual
ownership lookup. They continue to verify installed Ramify 0.4.1 physical owners,
independent projects, hard exclusions, changed/removed declarations, unavailable
placement/bootstrap authority, captured inputs and independent configuration.
The fixture writing helper is shared; it reads no provider answer from disk.

The ordinary helper declares literal module and candidate path facts. Every
scenario supplies exact required ownership queries, consumed without imposing
an order on independent reads. Wrong roots, unknown/exhausted queries and unknown
seed facts retain violations even if guard code catches them. Teardown checks
these violations and unused required answers, removes fixtures on failure, and
asserts zero process attempts after cleanup. Four helper negative tests prove
these refusal paths. The preimport `child_process` mock refuses every process
launch export. The later global guard will replace per-file installation.

All 16 original titles and 86 original `expect` calls are represented. The six
boundary callbacks compare byte-for-byte with the original. Exact mapping,
callback hashes, source/configuration hashes, per-case durations and compact
raw runner summaries are committed in [the evidence JSON](04-write-guard-evidence.json).

Focused commands ran from `ramify-agent/`, which the actual installed-provider
fixtures require. The baseline `write-guard.test.ts` passed 16/16 in 42.004 s;
ordinary rows summed 21.192 s and actual rows summed 20.812 s. The first converted
ordinary run passed 10/10 in 0.110 s. The final three-file run passed all 20
cases, with no skip: ordinary 0.174 s, strict controls 0.014 s and actual boundary
33.235 s. The final run overlapped compiler and self-check activity, so its actual
boundary duration is not a controlled speed comparison. The ordinary matrix's
21.192 s to 0.174 s comparison is approximately 122 times faster on these runs.
This optimization removes external calls from ordinary cases; retained actual
provider cases still pay their real execution cost.

`npm run type-check` passed all four configured compiler scopes. `npm run
check:self` passed with 0 errors, 0 warnings and 310 analysis limits (partial
coverage, unchanged limitation count). `git diff --check` passed after correcting
an extra EOF blank line. No executable test failed during authoring. An attempted
TypeScript AST comparison encountered the native package's missing former API;
an independent callback scanner verified the preservation record instead.

Baseline source is commit `19c9c3cf3a93f6927088302a539b71a565ab5d9c`.
No full audit was run here; the coordinator owns final qualification and semantic
preservation remains responsible-architect review. The new boundary path is a
candidate for the later exact registry and is currently included by existing
runner discovery. The qualified branch then adopted concurrent Plan21 commit `292154763c95d5338405fad41c27dd06caefb914` through merge `aec0c0569a619ee13d2b1f3e4049cc7183c4c906`. Exactly three `composition.test.ts` inventory paths now point to the moved F1 test; their titles and union values and the concurrent CA08 corrections remain unchanged. A search found no other executable consumers of its old location. Historical Plan21 evidence keeps its original provenance.

The reconciled focused four-file run passed all 31 cases with no skip, including all original guard cases, four strict controls and the complete composition file. Type-check passed all four scopes and check:self passed with 0 errors, 0 warnings and 313 analysis limits after Plan21 adoption (partial coverage). All 35 declared ordinary ownership queries were consumed, and the ordinary process-attempt assertions stayed zero. Exact reconciled commands, cases, durations and hashes are in [the reconciliation evidence](04-write-guard-reconciliation.json).
