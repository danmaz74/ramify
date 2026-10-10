# Baseline: full nested audit of the implementation base

[Plan](../main-plan.md)

The implementation base is `0656317a` (ramify.ts 0.4.2). The plan documents
were committed on top of it as `da22da99`; the audit ignores `docs/**`, so
the base audit applies to that commit as well.

Command, from the repository root of the worktree
`/home/app/ramify-plan30-harness-steps`:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit --project-root ramify-agent --cwd . --full --nested --json
```

Result on 2026-10-10: `overall: pass`, mode full executed, 0 outstanding
failures, discovery complete, by reuse of the full audit of `0656317a` taken
at 06:06:08Z (522 s). Report commit `90232ae6`; run ref
`refs/audited/projects/ramify-agent-f25e9a298228/runs/2026-10-10T06-06-08Z-0656317ad`.
