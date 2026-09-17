# Iteration 7: Connect the page and run the gate

**Plan:** [Plan 6D: Behavioral dependency diagram](../main-plan.md).
**Prerequisites:** iterations 1–6 and every BD01–BD38 row passing on the source
revision used for this iteration.
**Owners:** `explorer [ui, browser, dispatch]`,
`integration-tests [testing, ui, dispatch]`, documentation.

## Goal

Coordinate the published module model with its exact dependency result and
prove the complete workflow, lifecycle bounds and hook isolation through the
real daemon, explorer server and browser.

## Read first

- [Contracts C6–C7](../contracts.md#c6-wire-result-router-and-client) and BD39–BD43.
- `subs/explorer/src/ProjectExplorerPage.tsx`, `published-project-view.ts`,
  `revision-freshness.ts`, browser client assembly and their tests.
- `subs/integration-tests/src/browser-acceptance.ts` and Plan 6B/6C browser
  evidence patterns.
- Iteration 3's analyzer measurements, iteration 4's counters, iteration 5's
  server state handoff and iteration 6's component handoff.
- Roadmap Plan 6D row/brief, [processes and clients](../../../architecture/processes-and-clients.md),
  [daemon](../../../architecture/daemon.md#service-operations-and-client-behavior)
  and [memory lifecycle](../../../architecture/memory-lifecycle.md).

## Deliverables

1. Add the C7 dependency state/hook. Begin only after a ready project view; poll
   pending while visible; stop on ready, superseded or unavailable; verify the
   revision and input identities before rendering.
2. Wire dependency phase/data/settings into `ProjectExplorerView`. Refresh first
   loads the newest project revision and then requests its dependency result.
3. Preserve a coherent ready old graph as stale; discard late mismatched
   responses; never mix a new project model with old dependency counts.
4. Add `forwarding` and `mutation` real-project fixtures to browser acceptance,
   including an edit during analysis that supersedes or changes the job's inputs.
5. Exercise project/module/both edge panels, both controls, scopes,
   out-of-view nodes and waiting/analyzing/partial/unavailable/superseded states
   over actual HTTP.
6. Record ten-refresh `behaviorRuns` and `dependencyDiagrams` counts, daemon
   retained bytes, daemon settled memory with and without a retained result,
   analyzer and helper peak memory, server memory, listeners/timers, close
   timing and hidden-page polling.
7. Rerun the zero-`behaviorRuns` ordinary/changed-file evidence and the BD24
   isolation evidence on the same source revision.
8. Update the daemon service operation table, processes-and-clients and memory
   lifecycle documents with the on-demand `dependencyDiagram` operation, its
   daemon-started analyzer process and its retention, then roadmap status only
   after the gate. Write `iteration7-results.md` mapping every BD row to evidence, exact commits,
   input IDs, commands, measurements, deferrals and remaining limits.

## Matrix rows executed here

BD39–BD43, plus regression confirmation of BD06, BD13, BD24, BD29 and BD38.

## Verification

```sh
npx vitest run subs/explorer/src/tests/ProjectExplorerPage.test.tsx
npx vitest run subs/explorer/src/tests/revision-freshness.test.ts
npx vitest run subs/service-api/src/tests/dependency-view.test.ts
npx vitest run subs/daemon/subs/contexts/src/tests/dependency-diagram.test.ts
npx vitest run subs/analysis/src/tests/dependency-behavior-capability.test.ts
npm run type-check
npm run build
npm run check:self
npm run measure:project-explorer
```

The browser command must use an isolated endpoint/project copy, a real daemon
and actual Chromium. Preserve the raw measurement artifact. Full-suite/audit
verification follows the implementation workflow; do not label a focused run as
the full gate.

## Exit criteria

Every BD row has current evidence; the two baselines and browser data share
recorded exact identities where compared; lifecycle limits hold; ordinary and
changed-file checks record zero `behaviorRuns`; type-check, build and self-check
pass.

## Handoff

The completion report hands off the public contracts, both clean baselines,
real-browser fixtures, analyzer time and memory, daemon and server memory
measurements, coverage limitations and explicit deferrals. It identifies
whether a later MCP/CLI client, test-filter, trends or module-redesign plan can
reuse the daemon operation without another compiler feature.
