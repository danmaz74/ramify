# Iteration 13: Retained whole-tree consistency

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 12](iteration12.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Analysis retained session capability over Project/TypeScript ports. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Integrate structural/auxiliary updates, compiler membership reach, exposure/model rebuilds and observation retirement into hot/warm sessions.

## Read first

- [Contracts](../contracts.md): Reports, affected queries and freshness; Transport, observation and projections.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-21, PB1-22, PB1-24 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/analysis/src/session-engine.ts`.
- `subs/analysis/src/session-revision.ts`.
- `subs/analysis/src/session-facts.ts`.
- `subs/analysis/src/interfaces/session.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Integrate structural/auxiliary updates, compiler membership reach, exposure/model rebuilds and observation retirement into hot/warm sessions.
2. Test boundary add/remove/change, missing root, re-inclusion and auxiliary forwarding mutations with independent expected findings plus same-input fresh batch comparison.
3. Add project-boundary-session.test.ts; enforce revision identity, cancellation, invalid/incomplete publication and compiler/session cleanup under existing bounds.

## Matrix rows executed here

Exercise PB1-21, PB1-22, PB1-24 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-21, PB1-22, PB1-24.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/analysis/src/tests/project-boundary-session.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-21/22/24 pass in both retained states and fresh batch; invalid scope cannot leave a stale passing revision as current.

Record `iteration13-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Revision-bound scope and dispositions-ready retained facts for affected and contexts.
