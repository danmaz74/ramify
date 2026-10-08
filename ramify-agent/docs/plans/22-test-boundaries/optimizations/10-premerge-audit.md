# Hook and CLI responses: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `0e6e2e475bc332f2a411e3fdb40fb270e09ef789`. No unfinished target work was included.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures. Discovery, configured coverage and the failure ledger are complete. Vitest: **266 files passed, zero failed, 1 skipped; 2,039 tests passed, zero failed, 2 skipped**. Existing optional fixture trials account for the skips. All 41 original hook/CLI cases, thirteen strict controls and eleven composition checks ran. Ordinary setup/flow/cleanup attempted zero processes through the local guards. The retained native timeout callback is unchanged and verifies retirement of its owned producer. Type checking, structure, web build, patch integrity and the configured scenario command passed. That command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `af832ede28d13e22431040412366c1d1aa8fdaba`. Durable report: `b3ffa41d9150c600fec01fa6c60307cc0ba4f8cc`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T08-28-16Z-0e6e2e475`.

Total audit duration: 361.88 s; full test check: 322.92 s. Shared-host load and evolving coverage prevent a controlled aggregate speed comparison. Raw report: `/tmp/plan22-opt10-audit.json`. [Compact source, coverage and check data](10-premerge-audit.json).

This passing audit precedes integration and qualifies its exact candidate. Remaining migrations, global ordinary-process enforcement, runner partition and final qualification are still outstanding.
