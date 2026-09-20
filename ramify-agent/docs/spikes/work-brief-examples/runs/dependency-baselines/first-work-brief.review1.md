# First work brief: terminal baseline comparison

You are the first scoped implementation agent for dependency baselines. Work only in `ramify/cli` beneath `subs/cli/src/`. Do not change `subs/cli/module.ramify`, another owner, a foreign contract or generated `.ramify` files. Missing provider behavior may be represented by a provisional fake in CLI-owned tests only.

## Work item and iteration

The terminal work item will let a person save, list, compare and explicitly delete named dependency baselines using readable human output and deterministic JSON. It is one consumer of a larger feature requiring durable storage, coherent analysis and browser behavior.

This first iteration delivers only `baseline compare <name>`: grammar and help, human rendering, deterministic JSON and exit behavior against an injected provisional dependency. The observable result is a terminal user who can understand supplied complete changes and honest incomplete or unavailable outcomes. Do not implement save, list, delete, persistence, comparison analysis, direct baseline-file access or browser behavior.

Read `CLAUDE.md`; `subs/cli/README.md`; the read-only `subs/cli/module.ramify`; `subs/cli/src/arguments.ts`; `run-cli.ts`; `interfaces/cli.ts`; `command-support.ts`; `measure-command.ts`; and the argument and measure command tests. Inspect the current `subs/cli/src/.ramify/_meta.json`, `external/src/interfaces/service.ts.md` and `external/subs/analysis/src/interfaces/dependency-diagram.ts.md`. The planning snapshot was revision `rev/1:c0f289c6-2132-4574-a035-d16b1f73fd48:4`, input `input/1:9ca31c2bf2f66f17d0a67b2adcba33af79e9c59821900865c32637c2c876f3f9`, with catalog coverage `1`; this is provenance, not guaranteed current state. Use the current requester view during execution and follow project guidance to refresh it if missing or stale.

The relevant capability is `terminal-baseline-interface`, owned here. It consumes future behavior that returns a named baseline comparison against one coherent current analysis. Do not invent that foreign API. Let the provisional fake and consumer tests establish required behavior, evidence and constraints, then report the external need without nominating its owner or prescribing methods or type names.

## Requirements

Accept `baseline compare <name>` with existing root-selection and `--format human|json` conventions. Reject missing names, duplicate or unsupported flags and ambiguous grammar before connecting. Add accurate help text. Do not fall back to batch analysis.

For complete supplied data, both formats identify the baseline and both analyzed inputs or revisions, label production dependency scope and side-specific coverage, and report modules added or removed plus directed consumer/provider relationships added, removed or changed. A relationship present on both sides with different supplied values shows labeled before and after counts and classifications. Preserve canonical IDs. A rename appears as removal plus addition.

Distinguish retained historical evidence from current source evidence. Removed entities remain inspectable. The CLI must not compare imports, locations or reports; repeated-original and line-move normalization belongs upstream.

Only sufficiently complete sides produce an unqualified “no dependency changes” result. Partial or unavailable evidence cannot become zero, proven removal or a clean result. Qualified observed differences may print. Distinguish missing or deleted baselines, incompatible data, corrupt data, retryable current-input races and resource-limit refusals in both formats with non-success exits.

Emit one versioned JSON document. Identical logical results produce identical bytes even if fake collections arrive in different orders. Human output stays compact and readable.

## Acceptance evidence

Create owned grammar/help tests and a focused command test with a provisional injected fake. Cover complete mixed changes, complete no-change, partial, unavailable, missing, incompatible, corrupt, retryable and resource-limit cases in human and JSON forms. Prove pre-dispatch rejection, no source scan or batch fallback, deterministic JSON bytes, exit behavior and cleanup.

Run from `/ramify`:

```sh
npm test -- subs/cli/src/tests/arguments.test.ts subs/cli/src/tests/baseline-command.test.ts
npm run type-check
npm run build
npm run check:self
git diff --check -- subs/cli
```

Record actual results. These checks have not run. Passing fake-backed tests completes only this consumer iteration, never an external delegation, persistence, restart behavior, cross-surface behavior or the feature.

## Outcome and restart protocol

Close with exactly one semantic outcome:

- `goal-reached`: all iteration acceptance and verification passed.
- `partial-with-needs`: useful coherent consumer behavior exists, with unfinished acceptance or an external behavioral need.
- `contract-revision-needed`: available contracts cannot express consumer-proven behavior without revision.
- `cannot-satisfy`: the iteration goal cannot be met within its constraints, with evidence.
- `map-wrong`: evidence contradicts the accepted capability owner or relationship.

Crashes, timeouts and malformed submissions are adapter events outside these semantic outcomes; do not force them into a semantic report. Resolve ordinary compile and test failures within the invocation. Include `iterationCompletion` with conditions and exact files/commands/results; `localContinuation` for remaining CLI responsibilities without fixing future iteration goals; and `externalNeeds` containing required behavior, supporting evidence and constraints only. Do not nominate another owner or invent a foreign API.

Record any provisional fake and replacement need. Leave coherent repository state so a fresh agent can restart from files and recorded evidence. Stop at any cross-owner or declaration change and report it through this protocol.
