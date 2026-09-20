# Results: from a plan to work briefs

**Date:** 2026-09-19. Throwaway spike; see the [README](README.md).

Three plans for the toolkit were mapped by simulated architect sessions: Opus
subagents under the real architect prompt, feature-mapping procedure,
module-architect skill and map schema of Plan 1, working from the toolkit's
architect view. [tools/brief.ts](tools/brief.ts) then assembled briefs from
each map by selection alone. Nothing was implemented; each run stops with the
map awaiting approval and the entry item's brief ready.

| Plan | Work items | Seams | Entry point | Mechanical gaps | Architect cost |
| --- | ---: | ---: | --- | ---: | --- |
| [nearest-export-name](runs/nearest-export-name/run.md) | 1 | 1 | `ramify/analysis` | 1 | 88k tokens, 5 min |
| [explorer-outside-source](runs/explorer-outside-source/run.md) | 4 | 4 | `ramify/explorer` | 1 | 131k tokens, 9 min |
| [why-import](runs/why-import/run.md) | 8 | 5 | `ramify` | 7 | 126k tokens, 9 min |

Each run directory holds `map.json`, the architect's `architect-notes.md`,
`run.md` with the items at the stop point and the gaps, and `briefs/`.

## Verdict

**Selection alone is enough.** In all three runs every sentence of every brief
is template text or a value copied from the map. The harness never needed to
write or rephrase anything, and every map passed Plan 1's validator at the
first submission. Asking for each capability goal as a self-sufficient,
verifiable paragraph worked: the goals are the best part of the maps.

**The map is sound on what and where, and weak on how the work is cut.**
Capabilities, owners, reuse findings and weights were confident and cited.
Every difficulty the architects reported, and every mechanical gap, concerns
work items: their roots, their overlap, their order, and work that belongs to
no subtree. Findings 1 to 4 below are all of this kind.

## Findings that change the loop design

### 1. "The highest consumer" is not always one module

why-import has two top consumers, the command line and the explorer. The
architect had to name one entry point, chose the root because it owns the
vocabulary both use, and the entry brief's scope became the whole project:
108 lines, every touched module listed. That defeats bounded context at the
first step.

In the small plan the true highest consumer, the command line, needs no
change, so it could not be the entry point either: the schema requires the
entry point to be a touched module.

**Change:** a run has one or more entry items, one per top consumer that has
work. The feature's acceptance belongs to the integrate item at the common
ancestor, not to an entry item. Each entry item's goal is its own capability's
goal. The spine becomes: map, approval, entry items, integrate.

### 2. Work owned by a common ancestor is not subtree work

Both larger maps contain work in a module that is an ancestor of other work
items: the root's dispatch vocabulary in why-import, and relay exposure lines
in the root in explorer-outside-source. A subtree scope for such an item
contains every other item, which produced six of why-import's seven gaps; with
no item at all, the exposure lines belong to nobody, which is the medium
plan's gap.

In both cases the work is the interface between branches: exactly what the
principles give to the contract engineer, since the interface between two
branches belongs to neither side and a parent owns its children's boundaries.

**Change:** a contract item's scope is the seam's path: the declarations of
the modules between the two sides and the source of the module that holds the
shared interface. The map names, per seam, where the contract lives. No
implement item is ever rooted at an ancestor of another.

### 3. A chain of seams shares one shape, and consumer-first would derive it five times

In why-import one answer crosses five seams. The architect's notes say it
plainly: each side's goal describes the same answer in prose, nothing records
one agreed shape, and two engineers can satisfy their goals and still
disagree. The architect's own remedy was a vocabulary capability at the common
ancestor. The medium plan did the same with a browser model in
`presentation/project-view` that the server must satisfy.

**Change:** when several seams carry the same data, the map groups them under
one contract, and that contract item runs once, when the first need for any of
them is reported. This is still consumer-first: the first consumer's fake
drives it. It is not contract-first for the whole plan.

### 4. A seam of the tree is not always a seam of the work

Three kinds appeared that the expansion table cannot use:

- a seam whose consumer has no work (small plan: the command line prints what
  it already prints), so no item would ever report the need;
- two seams between the same pair of work items (medium plan), which would
  create two contract items for one conversation;
- one capability with two consumers (large plan), which the item key
  `contract:<capability>` already handles.

**Change:** the tool now reports the first two. The expansion keys a contract
by the contract group of finding 3, not by capability.

### 5. The consumer's brief carries too much of the provider

"Planned, outside your scope" copies each provider's full goal into the
consumer's brief. In the medium plan that is three paragraphs that already fix
the providers' data shapes: count, groups, bound, ordering. The consumer is
meant to discover what it needs by faking it; here the architect has decided
it, and the consumer reads the decision before writing a line.

**Change:** a capability gets a one-sentence `summary` beside its `goal`. A
consumer's brief carries identifier, owner and summary. The goal reaches only
the provider. Whether the architect's goals are already too detailed is a
question for the architect prompt, and the live trial should judge it.

### 6. One work item that is the whole feature says everything twice

In the small plan the entry brief holds the acceptance and then four
capability goals that restate it: 60 lines of goal for a change whose heavy
part is one module. With finding 1 the acceptance moves to the integrate item
and the duplication goes. The architect also split one module's work into
three capabilities plus a helper; capabilities internal to one work item add
length and no routing value.

**Change to the procedure:** a capability is named only when it has a consumer
outside its owner's work item or is the work item's single goal.

## What the map has no place for

Reported independently by all three architects:

| Missing | Effect |
| --- | --- |
| Acceptance as a list | The plan's acceptance bullets are folded into one sentence; the link from bullet to evidence is lost. It should be a list with identifiers, which the integrate brief copies. |
| Constraints that span capabilities | The 200-file bound, exit codes and "no added work for ordinary checks" are repeated in several goals. A `constraints` list with the capabilities each binds would state them once. |
| Out of scope | The plan's exclusions have no field. An engineer cannot tell they were considered. |
| Order | Work items have no order. The loop does not need one, because needs create the order, but the architects all looked for it. The prompt should say so. |
| Verify though unchanged | "`ramify check` output is unchanged" binds a module nothing edits. It belongs to the acceptance list. |
| Fixtures and reference cases | The acceptance of why-import depends on the reference example, which lies outside every module. |

## Observations on the environment

- No architect materialized an API view: all found existing ones, whose
  revision suffix differed from the architect view's. Each recorded it as an
  assumption. The real harness materializes per job, as Plan 1 requires; the
  spike's substitution hid this.
- Testing modules appear as work items: why-import's agreement tests went to
  `ramify/integration-tests`. That item is the executable form of the
  integrate item's acceptance and should be held by it.

## On the two loop proposals

[work-loop.md](../../docs/work-loop.md) makes the map's work items the
registry of goals. [implementation-loop.md](../../docs/implementation-loop.md)
keeps the map to capabilities and has an architect choose each scope and goal
as a separate execution decision.

The evidence favors a split, in a weaker form than the second proposal's.
Capability goals, owners, seams and reuse were reliable and are what briefs
copy. Work-item roots were where every architect was unsure and where every
gap arose. But the remedy found here is mostly mechanical: with findings 1 to
3, roots follow from owners, contract groups and weights, and an architect's
judgment is needed only for the vertical choice of a higher or lower root.
That choice can stay in the map as a proposal that a later architect item may
revise, without a separate decision before every item.

## Proposed next step

Revise the map schema and the feature-mapping procedure for findings 1 to 6,
rerun the three architects, and then let one engineer session run i3 of the
medium plan in a worktree, to test what this spike could not: whether a
consumer working from such a brief reports needs that match the planned
capabilities.
