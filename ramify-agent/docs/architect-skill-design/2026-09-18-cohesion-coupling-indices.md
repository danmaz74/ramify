# Cohesion and coupling indices for the module architect

**Date:** 2026-09-18. **Status:** proposal, revised after review. No
guideline, metric schema or view field is adopted by this document. It
proposes the criterion the
[module architect](../../../docs/agents/module-architect.principles.md) evaluates a
module against, and the indices Ramify could publish so the architect cites
numbers rather than impressions. Its practical goal is to inform the
evidence and decision procedures of a module architect skill or collection
of skills. The guidelines themselves are deliberately not written here.

## The criterion

A module is **internally cohesive and externally loosely coupled**: its
files belong together, and its ties to other modules are few, narrow and
pass through its contract.

That is the whole criterion. Statements that often accompany it, such as
one purpose per module, parents composing children, or dependencies
pointing at stable modules, are questions the evidence can raise or
policies a project can adopt; none is proved by cohesion and coupling, and
none is proposed here as a universal rule. The longer checklist drafted
during the skill discussion is not proposed as guidelines.

## What exists

The [modularity report](../../../docs/architecture/modularity-report.spec.md) already
computes, per exact owner and where defined per subtree, the material for
most of the indices below: boundary locality (section 1), contract breadth (2), interface
economy (3), the behavioral estimate (4), stability direction (5), cycle
structure (6), internal connectedness (7) and context size (9). Structural
metrics use `Metric<T>`: `measured`, `partial` with an observed value and
coverage, or `unavailable` with a reason. A ratio's value is null when its
denominator is zero.

Change affinity (section 8) is a separate `ChangeAffinityReport`, with
counts, ratios, sample sufficiency and Git provenance. Its values do not
use `Metric<T>`. Neither report flags values as good or bad; that is a
review judgment.

The [architect view](../../../docs/architecture/architect-view.spec.md) publishes a
`metrics` block in each module's `module.json`, which may be unavailable
in the first delivery, with no index field names fixed.

The proposal is therefore mostly a selection and a naming: which report
measures become named indices, two candidate additions, and the reading of
each.

## Schema

Published indices preserve the contracts of their source reports:

- a count is a count; a ratio carries `numerator`, `denominator` and
  `value`, with `value` null when the denominator is zero;
- a structural index preserves its source `Metric<T>` state: `measured`,
  `partial` with the observed value and its coverage detail, or `unavailable` with the
  report's reason; a partial value never appears as measured;
- a ratio derived from structural counts retains their state and coverage;
  a ratio of partial counts is not an estimate of the complete ratio;
- structural indices reference the modularity report's provenance once;
- history indices retain their separate availability, counts, ratios,
  sample sufficiency, filters and Git provenance. They do not inherit a
  structural metric's state. An insufficient sample retains its counts
  and ratio but supplies no signal; missing history is explicitly
  unavailable.

The independent-change share would extend the history report's owner rows
with the count of sampled commits whose mapped owner set contains only
that owner, and the ratio of that count to `commits(A)`. It uses the same
commit exclusions, path mapping and owner sufficiency as change affinity.
Unmapped paths remain reported: "only this owner" means only among mapped
owners in the selected scope. This is a proposed history-report addition,
not an existing `Metric<T>` field. Whether history is published beside the
structural block or in a separate file remains an open question.

## Proposed indices

Every index is per exact owner under the production source filter, and per
subtree where the report defines it. Locality, fan-in, fan-out and
structural instability retain all three load variants: `all`, `runtime`
and `typeOnly`. Per-edge direction compares instability values from the
same variant. Other indices retain their source report's scope; no load
variants are invented for them.

The readings are reasons to investigate, never verdicts; each row names a
case where the reading is wrong.

### Cohesion

| Index | Definition | Reason to investigate | Counterexample | Report source |
| --- | --- | --- | --- | --- |
| Locality | internal ÷ (internal + outgoing) occurrences | Low: the module's files reference outside more than inside; is it misplaced, or too small to stand alone? | A thin adapter over a foreign API is legitimately low | Boundary locality, unchanged |
| Connectedness | largest component files ÷ files, with isolates listed | Below 1: does the module hold separable parts? | Independent operations serving one purpose, entry files, shims and interface files are legitimate isolates | Internal connectedness, unchanged |
| Independent-change share | commits touching only this owner ÷ commits touching it | Low: the module rarely changes alone; which module does it change with, and is the boundary between them right? Pairwise affinity names the counterpart | Cross-cutting commits such as renames or plan deliveries lower it for every owner; sample sufficiency applies | Change affinity, a new ratio over `commits(A)` and the per-commit owner sets; Git provenance, separate from the revision |

Neither independent-change share nor pairwise owner affinity measures
whether files *within* the owner change together; that would need per-file
affinity, which the report does not define and this proposal does not add.

**Candidate, weakest:** *reference density*, the deduplicated undirected
file-pair references of the connectedness graph ÷ (files − 1), self-pairs
excluded, `unavailable` with reason `not-defined` below two files. A tree
of files scores exactly 1; a four-file clique 2; a triangle plus an
isolate also 1, so it must be read beside connectedness. Sparse
references are not poor cohesion, and adding references does not improve a
module. With complete coverage, full connectedness and density near 1
describe a sparse, tree-like reference structure. A chain, a star and a
branching tree all score exactly 1; the ratio cannot distinguish their
topology or purpose. It is proposed only as a trial candidate for choosing
where to inspect the reference structure, to be dropped if the skill
trials find no use beyond connectedness.

### Coupling

| Index | Definition | Reason to investigate | Counterexample | Report source |
| --- | --- | --- | --- | --- |
| Fan-out | distinct providers of the owner's edges, a count | High: does the module need to know this much of the project? | Composition roots and dispatch owners are high by role | Stability direction, `Ce` |
| Fan-in | distinct consumers of the owner's edges, a count | High: a change here reaches many modules; is its contract as narrow and stable as that reach demands? | Vocabulary and model owners are high by role | Stability direction, `Ca` |
| Structural instability | fan-out ÷ (fan-in + fan-out), with the per-edge `direction` | An edge toward a more unstable module is review evidence; whether it conflicts with the module's intended role is a judgment, and the role is not recorded data | Structural instability says nothing about how often a module changes; history is a separate index | Stability direction, unchanged |
| Contract size and use | exposed owned originals, a count; and selected ÷ exposed, the report's interface use | Many exposed originals with low use: the contract promises more than consumers take; high use of a wide contract: the boundary may hide little | A small abstraction whose three methods are all used still hides its whole implementation; interface use counts originals, contract breadth counts selected symbols and may count aliases separately, so the two are not mixed | Interface economy, unchanged; no per-consumer ratio is proposed |
| Outgoing behavioral share | the owner's behavioral ÷ (behavioral + non-behavioral) dependencies on other modules | High: the owner's ties outward run through behavior rather than vocabulary; which providers, and are those the intended ones? | A behavioral tie is not by itself stronger than a type tie; a single well-placed call can be the right design | Behavioral estimate, unchanged: the report aggregates by consumer, so this is the outgoing direction. An incoming share would be a new aggregation with its own coverage rules and is an open question |
| Cycle membership | runtime and type-only components the owner belongs to | Runtime membership prioritizes review of initialization dependencies and the project's cycle policy; type-only membership asks who should own the shared contract | A project may accept a runtime cycle after reviewing initialization, or a deliberate type-only cycle between a contract and its implementations | Cycle structure, unchanged |

### What is not proposed

- **A composite score.** The pairs disagree in informative ways: high
  locality with low connectedness may be two modules sharing a directory;
  low locality with a low independent-change share may be one module split
  in two. A single number would hide the pattern the architect needs.
- **Thresholds.** A value is read against the module's role and the
  project's parameters. The universal guidelines, when written, state how
  to read an index, not where it turns red.
- **Flags.** The report's rule stands: nothing is flagged; the architect
  judges.

## Consequences if adopted

1. The architect view's `metrics` block gets fixed field names: the
   structural indices above, each carrying its report metric state,
   coverage, load variants where defined, and a reference to shared
   provenance as the [schema](#schema) says. The renderer fills them when
   the modularity report is available at the revision and publishes
   `"metrics": "unavailable"` in `_meta.json` otherwise, as the spec
   already allows. This is a schema addition for Plan 2B's branch copy of
   the spec, not a first-delivery requirement.
2. The separate change-affinity report gains the
   independent-change share beside pairwise affinity, under the same
   sufficiency rules and provenance. Reference density, if kept, joins
   section 7 with the definition above.
3. The [skill plan](../../../docs/plans/module-architect-skill/main-plan.md)'s
   refactoring procedure cites indices instead of raw counts, and its
   candidate-feature table's "module metrics" row is replaced by this
   list.
4. A universal guidelines page, when written, is one page: the criterion,
   the index table with its readings and counterexamples, and a note that
   roles and thresholds are project parameters declared in the project.

## Proposed principles document

The criterion would live in a principles document, separate from the
guidelines page: principles state what a good module tree is and change
only when the approach changes; guidelines say how to read the evidence
and will change with the trials. Proposed location and name:
`docs/agents/modular-architecture.principles.md`, beside the module
architect principles, since it is the architect's reference rather than a
rule of the importability model. Its vocabulary is the existing
[agents glossary](../../../docs/agents/glossary.md) and the
[dependency glossary](../../../docs/architecture/dependency-glossary.md).

The full proposed text follows. It is not created by this document.

---

> # Modular Architecture Principles
>
> **Status:** Proposed
>
> ## Purpose
>
> Define what makes a module tree well structured. The
> [importability principles](../../../docs/model/cross-module-importability.principles.md)
> define what a module may import; this document defines what a module
> should be. It is the reference for the
> [module architect](../../../docs/agents/module-architect.principles.md) and for anyone
> reviewing a boundary, a placement or a move. Ramify measures evidence for
> these principles and flags nothing; judging a module against them is a
> person's or an agent's work.
>
> ## Principles
>
> ### Cohesive Inside, Loosely Coupled Outside
>
> A module's files belong together, and its ties to other modules are few
> and narrow, each passing through a declared contract.
>
> ### Evidence Is Read, Not Scored
>
> Cohesion and coupling are judged from named indices read side by side,
> each a reason to investigate rather than a verdict, each with cases where
> its reading is wrong, and each carrying its coverage. No composite score,
> threshold or flag is part of the principles.
>
> ### Structure And History Are Separate Evidence
>
> Structural stability, from who depends on whom, and change frequency,
> from history, are different facts with different provenance. Neither
> stands in for the other.
>
> ### The Project Declares Its Policies
>
> What a module's purpose statement must say, whether a parent's own
> source composes its children or does more, which direction dependencies
> should point between named roles, which cycles are accepted, and where an
> index turns red are policies a project declares. The architect applies
> them as declared and proposes them where they are missing; the principles
> do not supply them.

---

The guidelines page, when written, is then one page under the same
directory: the index table from this proposal with its readings and
counterexamples, the questions the evidence commonly raises, and the
statement that roles and thresholds are declared per project.

## Open questions

- Whether an incoming behavioral share, aggregated by provider, is worth a
  new aggregation with its own coverage rules, or whether the outgoing
  share and the consumer lists in the view already answer the question.
- Whether the independent-change share belongs in `module.json` at all,
  since it carries Git provenance that the revision does not. The
  alternative is a separate file the architect reads beside the view.
- Whether reference density earns its place; the skill trials decide.
- Whether subtree values are wanted for every index or only for locality
  and context size, where the report already defines them.
