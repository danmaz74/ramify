# Capability flows: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `4531e00a0afdad8bf43de273664d4085a5781acb`, containing committed Plan21 runtime and tests through `f2968d17`. No unfinished target work was included.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures. Discovery, configured coverage and the failure ledger are complete. Vitest: **261 files passed, zero failed, one skipped; 2,017 tests passed, zero failed, two skipped**. Existing optional fixture trials account for the skips. All preserved capability cases, the unchanged CA30 actual Git witness, strict controls, recovery cases and new event-reader controls ran. Type checking, structure, web build, patch integrity and the configured scenario command passed. That scenario command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `5af8eedd3aee77a0324a221d94555f96de9b9f58`. Durable report: `185cf09995f1172771a6a0487a29962ad2f9ab2e`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T07-29-17Z-4531e00a0`.

Total audit duration: 363.071 s; full test check: 324.249 s. Shared-host load and changing coverage prevent a controlled aggregate speed comparison. Raw report and stderr: `/tmp/plan22-opt08-audit.{json,stderr.log}`. [Compact source, coverage and check data](08-premerge-audit.json).

The separate Plan21 audit finished before this run began. Its first failed run remains recorded in the [implementation receipt](08-capability-flows-results.md); it is not passing delivery evidence. Its subsequent pass on `f2968d17` does not erase the demonstrated partial-append polling defect. This candidate includes the narrowly qualified test-helper and cleanup correction. During this audit, target commit `bbf897c6` added only Plan21 completion documents and evidence; its complete diff passed whitespace validation and changed no production, test, dependency or runner inputs.

This passing audit precedes integration and qualifies its exact candidate. Remaining migrations and global ordinary-process enforcement are still outstanding.
