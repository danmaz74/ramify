# Released full audit of integrated optimizations 1–4

The coordinator ran the installed `ramify-audit` 0.7.2 from a clean detached checkout of `68cde9ecc8a2f29f2a01121f6357586c2b99c484`, after the active Plan 21 audit finished. This source contains all four merged optimizations and Plan 21's `8dc6068c` policy/protocol fixture corrections.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The released full audit **passed**, unscoped, chain depth 0, with no outstanding failures. Vitest: **252 files passed, 0 failed, 1 skipped; 1,975 tests passed, 0 failed, 2 skipped**. The skipped cases are the existing optional fixture trials. Structure, four-scope type checking, web build, patch integrity and the configured scenario command passed. The scenario command discovered zero scenarios; this is not scenario acceptance evidence.

Durable report: `b83c479c94cfcd581607e14a60eb9825de9af3a7`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T05-38-51Z-68cde9ecc`.

```sh
git show refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T05-38-51Z-68cde9ecc:reports/audit/summary.json
```

Total audit duration was 338.575 s; the complete test command took 296.677 s. This test-command time is approximately unchanged from the failed post-cleanup baseline's 297.123 s. Input identities and coverage differ: Plan 21 continued implementation and the optimized suites added actual witnesses/negative controls. This run also overlapped measurement-focused checks on the shared host. It establishes execution health of its committed source, not a controlled whole-suite speed improvement. Final performance analysis remains required.

This audit happened after cuts 1–4 were merged. It does not retroactively establish pre-merge auditing. Following the user's question, every subsequent optimization now requires a passing released full nested audit before integration; measurement is the first branch under that gate.

[Compact audit evidence](04-released-audit.json) retains source/tree identities, actual selection/composition, configuration digest, check statuses/counts/durations and durable report references. Raw CLI files: `/tmp/plan22-cuts01-04-audit.{json,stderr.log}`. Automatic ordinary-process enforcement and exact runner partition remain future work.
