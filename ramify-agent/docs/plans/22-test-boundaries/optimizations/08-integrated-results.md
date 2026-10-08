# Capability flow integration

After the [passing pre-merge released full nested audit](08-premerge-audit.md), the coordinator merged audited candidate `4531e00a0afdad8bf43de273664d4085a5781acb` plus receipt-only `113cd27a` into target `bbf897c6` as `25ea4b8b64cac016647e4b018f6fa01227ff32e3`.

The target was clean before and after integration. Its advance from adopted `f2968d17` added only Plan21 completion documents and evidence. All production, test, dependency and runner inputs in the merged tree equal the audited candidate; their comparison is recorded in `/tmp/plan22-capability-flows-integration.json`. No unfinished user work was committed or discarded.

From the target package directory, the four converted files, seven strict controls, unchanged actual CA30 Git witness, eleven composition checks, all thirty-five recovery cases and four event-reader controls passed **86 tests, zero failed, zero skipped**. Report: `/tmp/plan22-capability-flows-integrated.json`; log: `/tmp/plan22-capability-flows-integrated.log`. Ordinary guarded setup/flow/cleanup attempted zero processes. The four converted ordinary files totalled 6.174 s in this integrated focused run; shared-host timing is advisory.

All twenty-nine original capability cases remain represented: twenty-eight ordinary cases and the unchanged actual Git callback. Plan21's independent retirement of two obsolete assertions is preserved and distinguished from this optimization. Original recovery test bodies remain unchanged. The event-reader correction preserves missing-file and completed-corruption failures and only defers an unfinished trailing append; recovery cleanup settles services before fixture deletion.

Cut 8 is integrated. Readiness and remaining consumer migrations, global automatic enforcement, runner partition and final qualification remain outstanding.
