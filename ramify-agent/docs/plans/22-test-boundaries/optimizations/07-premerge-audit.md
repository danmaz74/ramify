# Nonfunctional lifecycle: pre-merge released audit

The coordinator ran installed released `ramify-audit` 0.7.2 on clean committed candidate `42a2f37a0fae19718b38e3f7f35646309d890c80`, containing committed target `5c62119f`. No unfinished Plan21 edits were included.

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

The audit completed with exit 0 and **passed**. Composition is unscoped, chain depth 0, with zero outstanding failures; discovery and configured coverage are complete. Vitest: **257 files passed, zero failed, one skipped; 2,002 tests passed, zero failed, two skipped**. The skips are existing optional fixture trials. All twenty original NFR lifecycle cases, seven controls and the retained actual audit/tree witness ran. Type checking, structure, web build, patch integrity and the configured scenario command passed. The scenario command discovered zero scenarios and is not scenario acceptance evidence.

Audited tree: `a1e057711cf1813405209750e4e641c0dd0c2162`. Durable report: `d1a2a0e75cfa58fe07c079a16ef0bbf66e1fb73e`. Run ref: `refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-08T06-51-44Z-42a2f37a0`.

Total audit duration: 369.738 s; full test check: 320.749 s. Shared-host load and changing coverage prevent a controlled aggregate speed comparison. Raw report and stderr: `/tmp/plan22-opt07-corrected-audit.{json,stderr.log}`. [Compact source, coverage and check data](07-premerge-audit.json).

The coordinator first caught an extra EOF newline with the complete committed-diff check; a multiline command incorrectly continued into an audit on `1f0c20cf`. That own audit was cancelled via its verified PID/cwd, exit 130, with an indeterminate result. Its raw report is `/tmp/plan22-opt07-audit.json` and is retained separately in the compact evidence. Two private analysis supervisors remained after cancellation; their deleted audit-source cwd and unique endpoints proved ownership. Only those supervisors were terminated, and both they and their compiler children were confirmed gone. No Plan21 process or other audit was stopped. The subagent corrected the EOF newline and complete committed diff before this fresh passing run.

This passing audit precedes integration and qualifies its exact candidate. Plan21's unfinished working changes remain outside this full-audit claim. Remaining migrations and global ordinary-process enforcement are still outstanding.
