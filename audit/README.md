# Toolkit audit requests

[`plan7-affected-modules.request.json`](plan7-affected-modules.request.json)
is the ramify-audit request that binds the toolkit suite to one commit for
[Plan 7](../docs/plans/iteration-7-affected-modules/main-plan.md). It runs the
patch check, the build, the type-check, the complete Vitest suite and the
self-check in the existing checkout. From a clean commit:

```sh
ramify-agent/node_modules/.bin/ramify-audit audit \
  --request audit/plan7-affected-modules.request.json --cwd . --json
```

The full suite runs only through such a request, never as a bare `npm test`
during an iteration. ramify-agent's own requests live in
[`ramify-agent/audit/`](../ramify-agent/audit/README.md).
