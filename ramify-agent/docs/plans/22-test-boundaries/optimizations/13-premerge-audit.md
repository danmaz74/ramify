# Automatic ordinary process enforcement and native runner partition: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `ce70bf386386e41326b43a4944f32137fae7fc24`. No unfinished target work was included.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures. Discovery, configured coverage and the failure ledger are complete. Vitest: **281 files passed, zero failed, 1 skipped; 2,088 tests passed, zero failed, 2 skipped**. Existing optional fixture trials account for the skips. All 234 ordinary files execute with automatic process enforcement; 48 exact registered native files remain selected. Type checking, structure, web build, patch integrity and the configured scenario command passed. That command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `97b0cbdf2a902a39fbb232f46d30a33c22c49811`. Durable report: `8b7da054b06e1f4c2a86d133adae0ba8d753ca8d`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T11-15-27Z-ce70bf386`.

Total audit duration: 368.413 s; full test check: 329.071 s. Shared-host load and evolving coverage prevent a controlled aggregate speed comparison. Raw report: `/tmp/plan22-opt13-audit.json`. [Compact source, coverage and check data](13-premerge-audit.json).

This passing audit precedes integration and qualifies its exact candidate. Automatic enforcement and the complete runner partition are qualified. Full-audit telemetry verifies zero allowed/refused process calls in all 234 ordinary files; all observed audit worker PIDs settled. Both failed predecessor audits remain retained. Safe MAIN integration, integrated focused verification and final documentation remain outstanding; the controlled aggregate timing comparison remains unresolved.
