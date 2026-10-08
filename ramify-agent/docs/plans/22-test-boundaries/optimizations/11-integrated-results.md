# Settlement, shell and session optimization: main integration

The released full nested audit passed on candidate `f87c640f58ce1a20b6f844730bf88ed34ce189d8`
**before** integration. [Audit receipt](11-premerge-audit.md) records complete
271-file coverage, 2,051 passing tests, zero failures and two existing optional
skips; report `494ae46ba2f983f307ef2feb2439789fccf93210`.

The coordinator merged receipt commit `e78959d1f34d8c84626db13c8d7a8b7807f943a7`
into `/ramify`, branch `ramify-agent`, at
`dfc8b4f2e62c3c798650a149a5ed41a726f32cd2`. Parents are the former main
`7eda41ad266a0f0c9a0d14b528c231620b515caa` and that receipt commit. The merged
committed tree equals the qualified tree plus its audit receipts. All 13 dirty
tracked and four untracked working files were preserved by byte/mode checks;
the index remains free of unrelated staged changes. Preservation evidence:
`/tmp/plan22-opt11-main-integration-preservation.json`.

Integrated verification ran from `/ramify/ramify-agent` against the refreshed,
matching pinned dependencies and the working tree:

```sh
node_modules/.bin/vitest run --maxWorkers=4 --reporter=default --reporter=json --outputFile=/tmp/plan22-opt11-integrated.json subs/harness/src/tests/writer-settlement.test.ts subs/harness/src/tests/writer-settlement.boundary.test.ts subs/harness/src/tests/shell-tool.test.ts subs/harness/src/tests/shell-tool.boundary.test.ts subs/harness/src/tests/single-session.test.ts subs/harness/src/tests/single-session.boundary.test.ts subs/harness/src/tests/settlement-boundaries.test.ts subs/harness/src/tests/composition.test.ts
```

**53 passed, zero failed/skipped**: all 30 originals, 12 strict controls and 11
composition cases. Ordinary files recorded zero process attempts. Their file
execution times were shell 0.021 s, session 1.424 s and settlement 0.642 s;
actual boundary files took 1.206 s, 0.363 s and 0.201 s. Raw JSON/log:
`/tmp/plan22-opt11-integrated.json`, `/tmp/plan22-opt11-integrated.log`.
Shared-host timings are observations, not a controlled aggregate speedup.

Coordinator review found all original assertion lines preserved, the eight
unchanged native registrations retained, and the PB3-S04 fixture gap explicitly
corrected while preserving its actual shell and protected-file/write-scope/
zero-commit claims. Automated audit health does not establish semantic plan
completion. Remaining mixed consumers, global enforcement, runner partition
and final qualification remain outstanding.
