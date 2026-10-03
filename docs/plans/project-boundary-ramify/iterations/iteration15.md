# Iteration 15: Context path dispositions and synchronization

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 14](iteration14.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Contexts through neutral AnalysisDriver/ownership ports, plus required type relays. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Classify changed paths from revision-bound Project scope and separate not-analyzed from unobserved/stale source. No filesystem analysis or duplicated ownership algorithm lives in contexts.

## Read first

- [Contracts](../contracts.md): Reports, affected queries and freshness.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-20, PB1-23 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `subs/daemon/subs/contexts/src/interfaces/contexts.ts`.
- `subs/daemon/subs/contexts/src/context.ts`.
- `subs/daemon/subs/contexts/src/context-manager.ts`.
- `src/interfaces/service.ts`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Classify changed paths from revision-bound Project scope and separate not-analyzed from unobserved/stale source. No filesystem analysis or duplicated ownership algorithm lives in contexts.
2. Implement classification sequence, source-only content expectations, deletion evidence and classification-changed recovery; retain checked path/finding evidence in mixed requests.
3. Add project-boundary-check.test.ts with excluded/inert/normal/deleted inputs and declaration-change races; verify content expectations do not admit excluded bytes.

## Matrix rows executed here

Exercise PB1-20, PB1-23 at this slice's evidence boundary.
Cases whose producer is this iteration: none; this is preparation/adoption for later behavior.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npx vitest run subs/daemon/subs/contexts/src/tests/project-boundary-check.test.ts
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

Context-level dispositions/freshness pass; CLI exit/output qualification closes PB1-20 later.

Record `iteration15-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Typed path dispositions and synchronization outcomes for daemon/CLI.
