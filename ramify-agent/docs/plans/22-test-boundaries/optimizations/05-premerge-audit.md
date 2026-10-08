# Measurement optimization: pre-merge released audit

The coordinator ran the installed released `ramify-audit` 0.7.2 on clean committed candidate `6124e256a609ffda94ddb0f6126758dd206d80f7`, after adopting Plan21 target `42253094` and its production nested-readiness correction. No other audit was active when this run started.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures; project discovery and the complete configured file union passed. Vitest: **253 files passed, zero failed, one skipped; 1,984 tests passed, zero failed, two skipped**. The skipped cases are the existing optional fixture trials. Both actual installed-producer measurement witnesses ran. Type checking, structure, web build, patch integrity and the configured scenario command passed. The scenario command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `427593c120950c8f86ede4a012db8bf3441109fa`. Durable report: `7f6db1d2a43080a46062708a6eb5588c1f93b327`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T05-58-17Z-6124e256a`.

Total audit duration: 301.776 s; full test check: 264.956 s. This is execution-health evidence for the exact candidate, not a controlled performance comparison against the evolving Plan21 branch. Raw report and stderr: `/tmp/plan22-opt05-reconciled-audit.{json,stderr.log}`. [Compact durable identities and check results](05-premerge-audit.json).

This audit precedes the target merge. Receipt-only commits may follow it; they do not change the qualified runtime. Global ordinary-process enforcement and the remaining migrations are still outstanding.
