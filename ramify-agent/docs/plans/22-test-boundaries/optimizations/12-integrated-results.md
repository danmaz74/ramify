# Provider and executor partition: main integration

The released full nested audit passed on candidate
`3a9d471b2302e0b676fc78892033f063a48c0772` **before** integration.
[Audit receipt](12-premerge-audit.md) records complete 275-file coverage,
2,051 passing tests, zero failures and two existing optional skips; durable
report `7d8be000d2e6b760777c60304c195a8f2cb90f5b`.

The coordinator merged receipt commit `b9d0ec86e8722254122b779799af8dfd7aaf5f35`
into `/ramify`, branch `ramify-agent`, at
`d27e3839034f59510026fed05ec690e0d55e4850`, from former main
`58579fe4e54326b6195e032cb70b956b1c41fa09`. The committed merge tree equals
the qualified candidate plus audit receipts. Twelve dirty tracked files and
four untracked files retained their bytes/modes. The dirty harness README's
independent user hunks were preserved by a clean three-way merge while applying
the native witness filename correction; its resulting bytes matched the
independently prepared expectation. No unrelated staged content was introduced.
Preservation evidence: `/tmp/plan22-opt12-main-integration-preservation.json`.

Integrated verification ran from `/ramify/ramify-agent`, using four workers and
exact paths for the four ordinary files, four native files and composition:
**53 passed, zero failed/skipped**. All 42 original cases and 11 composition
cases passed. Six ordinary cases verified zero process attempts. Raw evidence:
`/tmp/plan22-opt12-integrated.json`, `/tmp/plan22-opt12-integrated.log`.

| File | Observed execution time |
| --- | --- |
| `audit-check-execution.boundary.test.ts` | 39.259 s |
| `audit-check-execution.test.ts` | 0.003 s |
| `composition.test.ts` | 4.568 s |
| `test-lock.boundary.test.ts` | 0.124 s |
| `test-lock.test.ts` | 0.006 s |
| `workspace-preparation.boundary.test.ts` | 0.628 s |
| `workspace-preparation.test.ts` | 0.004 s |
| `run-command.boundary.test.ts` | 1.471 s |
| `run-command.test.ts` | 0.004 s |

These shared-host observations establish execution, not a controlled aggregate
speedup. Coordinator source review confirms all 39 original registration
sources and 191 assertion calls preserved, including the four expanded cleanup
probes. Real provider publication/execution, process lifecycle and kernel-lock
claims retain their original actual witnesses. Current composition/README/todo
addresses follow those moves; historical evidence remains unchanged.

Global ordinary-process enforcement, configured runner partition and final
qualification remain outstanding. Audit health and source preservation do not
automatically establish semantic plan completion.
