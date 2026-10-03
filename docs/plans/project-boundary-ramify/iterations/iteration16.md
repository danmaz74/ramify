# Iteration 16: Daemon wire and watcher integration

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 15](iteration15.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Daemon/root dispatch capability, neutral watcher ports and all mechanical schema consumers. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Implement the reviewed schema/protocol inventory through real worker/IPC/root service and strict codecs; reject malformed variants and old mismatched peers.

## Read first

- [Contracts](../contracts.md): Transport, observation and projections.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-23, PB1-25 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/daemon/src/codec.ts`.
- `subs/daemon/src/interfaces/daemon.ts`.
- `subs/daemon/src/context-types.ts`.
- `src/interfaces/service.ts`.
- `subs/daemon/subs/contexts/src/interfaces/contexts.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Implement the reviewed schema/protocol inventory through real worker/IPC/root service and strict codecs; reject malformed variants and old mismatched peers.
2. Supply scope exclusions to watcher registrations, prune declared/reserved roots, reconfigure on boundary changes and conservatively recapture across gaps.
3. Add project-boundary-wire.test.ts and project-boundary-watcher.test.ts with real installed processes, recorded watcher registrations and cleanup assertions.

## Matrix rows executed here

Exercise PB1-23, PB1-25 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-23, PB1-25.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/daemon/src/tests/project-boundary-wire.test.ts subs/daemon/src/tests/project-boundary-watcher.test.ts
npm run build
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-23/25 pass at real IPC/watcher boundaries; fake port tests alone are insufficient.

Record `iteration16-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Complete resident transport/path semantics for real CLI and materialization.
