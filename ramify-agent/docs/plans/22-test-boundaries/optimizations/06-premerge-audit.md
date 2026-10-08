# Capability recovery: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `80cd98c208925a4b1ac61d57bbbe5048768aba62`, containing committed Plan21 target `fcc89393`. The candidate contains no unfinished target changes.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures. Discovery and configured file coverage are complete. Vitest: **255 files passed, zero failed, one skipped; 1,994 tests passed, zero failed, two skipped**. Skips are the existing optional fixture trials. All three retained actual recovery witnesses and ten strict-script controls ran. Type checking, structure, web build, patch integrity and the configured scenario command passed. The latter discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `e856c7d892f373c32cf49c7d3396ef937a55526c`. Durable report: `51ddd84a03322dc62bd3960a8843fe75415e6c55`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T06-22-00Z-80cd98c20`.

Total audit duration: 329.951 s; full test check: 286.313 s. Shared-host timings and changing coverage do not establish a controlled aggregate speedup. Raw report and stderr: `/tmp/plan22-opt06-audit.{json,stderr.log}`. [Compact exact source, coverage and check data](06-premerge-audit.json).

The target had concurrent unfinished Plan21 edits during this run. They were excluded from the clean candidate and must be preserved on integration; this audit does not qualify those unfinished edits. Receipt-only commits after this audit do not change the qualified runtime. Remaining migrations and global enforcement are outstanding.
