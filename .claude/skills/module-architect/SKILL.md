---
name: module-architect
description: Investigate project-wide Ramify module architecture to find existing capabilities, determine cross-module access, place new capabilities, or propose responsibility changes. Use for cross-module architecture questions in a project with Ramify architect and API views; not for implementing changes or questions confined to one module.
---

# Module architect

Use Ramify's retained evidence to answer project-wide architecture questions.
Interpret capabilities from the request; describe Ramify facts in behavioral
terms.

## Start

1. Classify the requested outcomes. Run `ramify materialize --view architect`.
   For requester-specific access, instead refresh both surfaces together with
   `ramify materialize --view architect --view api --from <requester-path>`.
   If materialization is incomplete, continue only with the available evidence
   and report the limitation.
2. Read `.ramify-architect/_meta.json`. Retain its revision, dependency and test
   reference states, coverage limits, unknown shapes, and unavailable details.
3. Read only the references required by the classified outcomes. For a chained
   request, complete one outcome before loading the next.

## Route the request

- To find whether a capability already exists, read
  [references/discovery.md](references/discovery.md).
- To determine whether a module can use a known symbol, read
  [references/access.md](references/access.md). Read discovery first only when
  the symbol has not been identified.
- To place a capability known to be new, read
  [references/placement.md](references/placement.md) and
  [references/cognitive-decomposition.md](references/cognitive-decomposition.md).
  If the request has not established that it is new, run discovery first and
  load placement guidance only when no adequate existing capability is found.
- To split, move, merge, or otherwise restructure responsibilities, read
  [references/refactoring.md](references/refactoring.md) and cognitive
  decomposition.

Do not preload references for outcomes the request does not reach.

## Boundaries

- Begin with `.ramify-architect/`; inspect source only as the selected workflow
  permits. Record every source file read.
- The architect view supports discovery but creates no availability. A
  requester's ordinary `src/.ramify/` or testing `src/tests/.ramify/` view is
  definitive for current access in that source area.
- Absence is not proof when search is semantic or metadata reports incomplete
  evidence. Never turn unavailable or partial evidence into zero.
- Cite every factual claim to a view line, API-view file, declaration, or source
  location. Distinguish evidence from architectural judgment.
- Propose changes; do not edit source or `module.ramify`. When requested to
  verify a proposal, apply it only in a scratch worktree and run
  `ramify check --batch` there.
- A module implements behavior it owns. A relaying module re-exposes behavior;
  it does not implement it. Say expose or re-expose, never grant or route.

Before answering, read [report.md](report.md) and follow its template. List the
workflow references actually read so progressive disclosure remains observable.
