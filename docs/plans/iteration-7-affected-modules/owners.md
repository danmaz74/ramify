# Ownership and consumer access

This is the proposed ownership package for [Plan 7](main-plan.md). Apply these
additions after the completed Plan 5/4 provider manifests; preserve all existing
clauses, original identities and tags. Iteration 1 verifies the final paths.
No files migrate between owners and no new owner is introduced by Plan 7.

## Source and test placement

| Owner | Implementation | Consumer contract and tests |
| --- | --- | --- |
| `analysis`, untagged | New `src/interfaces/affected.ts`, private `src/affected-query.ts`; extend Plan 5 `session-facts.ts`, `retained-session.ts`, worker protocol/dispatch and `src/index.ts`. Add only private readiness metadata if missing. | Existing `RetainedSession` gains `affected`; owned `src/tests/affected-query.test.ts`, `affected-session.test.ts`, `affected-worker.test.ts` and `affected-fixtures.ts`. |
| `contexts`, untagged | Extend `src/interfaces/contexts.ts`, manager and covering-revision scheduler. | New neutral `AffectedRequest`/`AffectedOutcome`; `src/tests/affected.test.ts`. No filesystem/compiler/transport imports. |
| `daemon`, dispatch | Extend service, wire validation/dispatch, connection and `src/client-entry.ts`. | New service capability; existing connection method surface; `src/tests/affected.test.ts`. |
| root, dispatch | Extend `src/interfaces/service.ts`, resident assembly and package type relays; adapt existing quick environment. | Existing `ramify.ts/client` export; `src/tests/affected-{ipc,cli,mcp,integration}.test.ts` and `affected-fixture.ts`. |
| `cli`, dispatch | New private `src/affected-command.ts`, `affected-format.ts`; extend arguments/help and command dispatch. | Existing injected CLI entry; `src/tests/affected.test.ts`. |
| `mcp`, dispatch, supplied by Plan 4 | New private `src/affected-tool.ts`; extend tool registration. | Existing Plan 4 serving entry and client injection; `src/tests/affected.test.ts`. Paths bound to accepted provider in iteration 1/5 handoff. |
| Independent integration tooling scope | Add `scripts/verify-affected.mts`, `scripts/measurements/affected.mjs` and package scripts in their existing compiler scopes. | Finite case evidence gate and raw measurement runner; drive public sessions or launch owned measurement tests, without importing private production helpers. |

Production source never imports another owner's tests. Cross-owner tests use
root's existing `createQuickEnvironment` testing exposure or public real client
interfaces. Private graph fixtures stay in analysis tests. Disposable source
fixtures are files written by the test, not a new tracked application owner.

## Manifest additions

Add the new neutral types at their original owner and relay them unchanged:

```text
// subs/analysis/module.ramify
expose-src * from "interfaces/affected.ts" to parent

// module.ramify
expose-sub AffectedQuery, AffectedModule, AffectedSelection, AffectedUnavailableReason, SessionAffectedOutcome from analysis to descendants

// subs/daemon/module.ramify: extend the existing contexts named selection
expose-sub AffectedRequest, AffectedOutcome from contexts to parent

// module.ramify: extend the existing daemon named selection
expose-sub AffectedRequest, AffectedOutcome from daemon to descendants
```

The snippets for named selections show additions to merge into their existing
clauses. Contexts already has `expose-src * from "interfaces/contexts.ts" to
parent`; the new locally defined types are included automatically. Root's
existing `interfaces/service.ts` wildcard includes the extended service
interface. Preserve Plan 5's `RetainedSession` exposure and worker wrapper.
No `expose-src` is added for private `affected-query.ts`.

`ProjectScope`, `SourceLimit`, `RunControl`, `ContextToken`, `Freshness`,
`FreshnessRecord`, `ContextRevision`, `UnavailableReason`, `ServiceResult` and
lease types keep their original owners and existing exposure chains. New
interface files import these as types; they do not redefine or re-export
foreign originals from an owned wildcard file. Untagged contexts consumes
neutral analysis vocabulary; it receives no dispatch runtime responsibility.

## Package entries

`ramify.ts/analysis` exports the five new analysis types and its existing
session entry with the added method. `ramify.ts/client` exports
`AffectedRequest`, `AffectedOutcome`, `AffectedQuery`, `AffectedModule`,
`AffectedSelection` and `AffectedUnavailableReason`, alongside the existing
context/freshness/service types needed to call the connection. Keep root
exports consistent with its existing public analysis vocabulary policy.

No new package subpath is necessary. Type-only client relays must not pull
analysis runtime/compiler code into the lightweight entry. Verify with built
package consumer imports and Plan 5's client dependency audit. The same rules
apply to CLI and MCP; neither builds graphs. No new browser capability or
browser-safe claim is introduced.

## Purpose paragraph additions

Append the applicable sentence to each owner's first purpose paragraph at
implementation, preserving the completed predecessor's other responsibilities:

- Analysis: "It also derives affected-module test selections on demand from
  one committed revision's retained dependency facts."
- Contexts: "It schedules affected-module queries against the requested
  covering revision and preserves explicit freshness and unavailable outcomes."
- Daemon: "It exposes the affected-module query through the same bounded
  service and lightweight client connection."
- Root: "It assembles the affected-module service and makes its neutral
  vocabulary available to CLI and MCP consumers."
- CLI: "Its affected command prints module test selections from the resident
  service with revision and coverage information."
- MCP: "Its affected-module tool exposes the resident selection through the
  host's existing context and cancellation lifecycle."

Update CLI invocation and daemon architecture documentation in their owning
iterations with the final reviewed syntax, capability and outcomes. Do not
change the authoritative model rules to document a query implementation.
