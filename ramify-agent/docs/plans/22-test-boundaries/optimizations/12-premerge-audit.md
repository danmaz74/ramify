# Provider and executor test partition: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `3a9d471b2302e0b676fc78892033f063a48c0772`. No unfinished target work was included.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures. Discovery, configured coverage and the failure ledger are complete. Vitest: **274 files passed, zero failed, 1 skipped; 2,051 tests passed, zero failed, 2 skipped**. Existing optional fixture trials account for the skips. All 42 original cases, six guarded ordinary cases and 36 native witnesses remain configured. Type checking, structure, web build, patch integrity and the configured scenario command passed. That command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `9607fac61aa143829950c3ee57b78232f7c71abe`. Durable report: `7d8be000d2e6b760777c60304c195a8f2cb90f5b`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T09-37-48Z-3a9d471b2`.

Total audit duration: 358.548 s; full test check: 320.188 s. Shared-host load and evolving coverage prevent a controlled aggregate speed comparison. Raw report: `/tmp/plan22-opt12-audit.json`. [Compact source, coverage and check data](12-premerge-audit.json).

This passing audit precedes integration and qualifies its exact candidate. Remaining migrations, global ordinary-process enforcement, runner partition and final qualification are still outstanding.
