# Main-target reconciliation: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `378d5ffea4a472750a2c5c264d8735735c34e409`. No unfinished target work was included.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures. Discovery, configured coverage and the failure ledger are complete. Vitest: **266 files passed, zero failed, 1 skipped; 2,039 tests passed, zero failed, 2 skipped**. Existing optional fixture trials account for the skips. The original twenty readiness and forty-one hook/CLI cases, their strict controls, eleven composition checks and seventeen session-page cases retain the focused 111-case reconciliation evidence. The full audit ran their exact combined committed tree; native witnesses retain actual process/provider behavior. Type checking, structure, web build, patch integrity and the configured scenario command passed. That command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `dbc84ed6adb0d76061bb8efb5b7cde9d3f07a01d`. Durable report: `178ff89ff99339c259ec3849b27048db76f41072`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T08-45-34Z-378d5ffea`.

Total audit duration: 361.462 s; full test check: 323.134 s. Shared-host load and evolving coverage prevent a controlled aggregate speed comparison. Raw report: `/tmp/plan22-main-adoption-audit.json`. [Compact source, coverage and check data](main-target-premerge-audit.json).

This passing audit precedes integration and qualifies its exact candidate. Remaining migrations, global ordinary-process enforcement, runner partition and final qualification are still outstanding.
