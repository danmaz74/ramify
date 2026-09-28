# Ownership and consumer access

Revised 2026-09-28 for [Plan 7](main-plan.md). Apply these additions to the
manifests at `5a1934aa`; preserve every existing clause, original identity and
tag. No files migrate between owners and no owner is introduced.

## Source and test placement

| Owner | Implementation | Contract and tests |
| --- | --- | --- |
| `subs/analysis/`, untagged | New `src/interfaces/affected.ts` and private `src/affected-query.ts`; extend `interfaces/session.ts`, `session-engine.ts`, `session-host.ts`, `session-messages.ts`, `session-worker.ts` and `src/index.ts`. | `RetainedSession.affected`; owned `src/tests/affected-query.test.ts`, `affected-session.test.ts` and `affected-worker.test.ts`, reusing `session-test-fixture.ts` and `session-worker-fixture.ts`. |
| `subs/daemon/subs/contexts/`, untagged | Extend `src/interfaces/contexts.ts` and `context-manager.ts`. | `AffectedRequest`, `ContextAffectedOutcome`; `src/tests/affected.test.ts` with the controlled ports. |
| `subs/daemon/`, dispatch | Extend `service.ts`, `codec.ts`, `connection.ts`, `context-types.ts` and wire validation. | Capability `affected`; `src/tests/affected-service.test.ts` following `measure-service.test.ts`, plus an IPC case in `ipc.test.ts`. |
| root, dispatch | Extend `src/interfaces/service.ts`, `src/interfaces/batch.ts`, `resident-assembly.ts`, `batch.ts`, `batch-entry.ts`/`batch-process.ts`, `cli-process.ts` and `compiled-entry.ts`. | `src/tests/affected-batch.test.ts` and an `affected` case in `batch-cli.test.ts` and `resident-cli.test.ts`. |
| `subs/cli/`, dispatch | New private `src/affected-command.ts`; extend `arguments.ts`, `run-cli.ts`, `interfaces/cli.ts` and help text. | `src/tests/affected-command.test.ts` and `arguments.test.ts` cases through the injected environment. |

Production source never imports another owner's tests. Cross-owner tests use
root's `createQuickEnvironment` testing exposure or the public client. Private
graph fixtures stay in analysis tests. Disposable source fixtures are files
written by the test into a temporary directory, not a tracked owner.

## Manifest additions

```text
// subs/analysis/module.ramify
// A19: affected-module selection vocabulary shared with the daemon and its clients.
expose-src * from "interfaces/affected.ts" to parent

// module.ramify (root), extend the R3 analysis relay
expose-sub AffectedQuery, AffectedModule, AffectedPathBasis, AffectedPathSeed, AffectedWideningReason, AffectedSelection, AffectedUnavailableReason, SessionAffectedOutcome from analysis to descendants

// subs/daemon/module.ramify, extend the N5 contexts relay
... AffectedRequest, ContextAffectedOutcome ...

// module.ramify (root), extend the daemon relay of context vocabulary
... AffectedRequest, ContextAffectedOutcome ...
```

Contexts already has `expose-src * from "interfaces/contexts.ts" to parent`, so
its new locally defined types are included automatically. Root's
`interfaces/service.ts` and `interfaces/batch.ts` wildcards include the
extended service and batch interfaces. Every foreign type an exposed signature
names must already be visible on the same channel, or `npm run check:self`
reports `exposed-without-companion`; run it after each manifest edit.

## Package entries

`ramify.ts/analysis` exports the new types through `export type * from
'./interfaces/affected.js'` and the session entry with the added method. The
lightweight client entry relays `AffectedRequest`, `ContextAffectedOutcome`
and `AffectedSelection` as types only; verify with the existing entry-boundary
tests that no analysis runtime enters the client entry.

## Purpose paragraph additions

Append at implementation, preserving the rest of each paragraph:

- Analysis: "It also selects the modules affected by changed paths or modules
  on demand from one revision's retained dependency facts."
- Contexts: "It schedules affected-module queries against the covering
  revision with explicit freshness and unavailable outcomes."
- Daemon: "It exposes the affected-module query through the same bounded
  service and lightweight client connection."
- Root: "It assembles the affected-module service and its batch form."
- CLI: "Its affected command prints module test selections from the resident
  service or a fresh batch session."

Update the [CLI invocation contract](../../architecture/cli-invocation.spec.md),
[daemon architecture](../../architecture/daemon.md) service table and the
README's command list in iteration 3. Do not change the model principles to
document a query.
