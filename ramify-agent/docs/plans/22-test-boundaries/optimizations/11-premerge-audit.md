# Settlement, shell and session boundaries: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `f87c640f58ce1a20b6f844730bf88ed34ce189d8`. No unfinished target work was included.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures. Discovery, configured coverage and the failure ledger are complete. Vitest: **270 files passed, zero failed, 1 skipped; 2,051 tests passed, zero failed, 2 skipped**. Existing optional fixture trials account for the skips. All 30 original settlement/shell/session cases, nine real-process witnesses and strict controls remain configured. Type checking, structure, web build, patch integrity and the configured scenario command passed. That command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `764f7140a2118099ee80fbf5a89870eb14b75bd3`. Durable report: `494ae46ba2f983f307ef2feb2439789fccf93210`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T09-18-37Z-f87c640f5`.

Total audit duration: 364.137 s; full test check: 325.692 s. Shared-host load and evolving coverage prevent a controlled aggregate speed comparison. Raw report: `/tmp/plan22-opt11-audit.json`. [Compact source, coverage and check data](11-premerge-audit.json).

This passing audit precedes integration and qualifies its exact candidate. Remaining migrations, global ordinary-process enforcement, runner partition and final qualification are still outstanding.
