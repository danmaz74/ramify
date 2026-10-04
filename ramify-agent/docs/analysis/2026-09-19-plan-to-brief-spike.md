# What the plan-to-brief spike taught us

**Date:** 2026-09-19. **Status:** Analysis. It proposes changes and adopts
none.

The [work loop](../work-loop.md) rests on one claim: the harness can turn an
implementation map into each agent's brief by selection alone, without writing
a sentence. The former `spikes/briefs/` experiment tested that claim on the
toolkit with three plans of different sizes. Its source and detailed artifacts
were removed on 2026-10-04; this analysis retains the findings and asks what
they mean together.

## What was done, and how far it can be trusted

Three plans were written as a person's requests, naming no module: a small one
(suggest the nearest name for a misspelt exposed symbol), a medium one (show
source outside every module in the explorer) and a large one (explain a
hypothetical import from the command line and the explorer). Three simulated
architect sessions mapped them under Plan 1's real prompt, procedure, skill
and schema. A script assembled briefs from each map and reported what it could
not assemble. Every run stopped before its first engineer.

The limits are real:

- One sample per plan. An architect's choice seen once may not recur.
- The same author wrote the plans, the loop design and the judgment.
- No engineer ran. Whether a brief is sufficient was judged by reading it.
- The architects were asked for self-sufficient goal paragraphs, an addition
  of the spike that shaped one of its own findings; see
  [foresight against discovery](#foresight-against-discovery).
- No reuse finding came back as unavailable, so the discovery "exists but is
  not available" was never exercised.
- The API views were found on disk, not materialized for the job, so Plan 1's
  identity check was not tested.

## What held

**Selection is enough.** Every sentence of every brief is template text or a
value copied from a map. Nothing had to be written, rephrased or summarized.
All three maps passed Plan 1's validator as first written.

**The architect view is enough for what and where.** Working from the view
alone, with 12 to 25 searches each, the architects placed every capability in
an existing module, proposed no new module, and cited 12 to 16 pieces of
evidence per map. The large plan's central reuse finding was the one hoped
for: the model already explains an import decision and nothing uses it. Of 15
reuse findings, 13 were shown available from the requester's own API view, and
the two others were correctly stated as unknown with the reason.

**The state machine survived.** Every change proposed below lands in a kind's
scope, a row of the expansion table or the map's schema. None touches the item
lifecycle, the waits-for relation or the record. That is the property the
design was meant to have, and it is the spike's main support for it.

## The one root cause

The mechanical gaps looked varied: overlapping scopes, exposure lines that
belong to nobody, a seam no item would ever trigger, an entry brief scoped to
the whole project. They have one cause. **The map describes all work as
subtrees, and three kinds of work are not subtrees.**

| Work | Its real shape | What the subtree model did with it |
| --- | --- | --- |
| The interface between two branches: shared vocabulary, relay declarations. | A path: the modules between the two sides, and the source of the one that holds the interface. | Rooted a work item at the common ancestor, whose subtree contains every other item; or, for declarations alone, gave the work to nobody. |
| The feature seen from outside: acceptance through every surface. | The common ancestor's view of the composition. | Forced it into one entry module. With two top consumers the architect chose the root, and the entry brief's scope became the project. |
| A consumer that only observes. | No work at all. | Declared a seam towards it, which no item would ever report as a need. |

The principles already say this. *Every agent scope is a cut on the module
tree*: a cut, not a subtree. They name a contract engineer who reads both sides
and writes only the contract, and an integration agent at the common ancestor
that owns the composition. The map schema and the first brief templates
flattened all three roles into "an implement item with a subtree root", and
the architects, given only that vocabulary, put ancestor-owned work where it
did the most harm.

So the correction is not a new mechanism. It is to let the map say what the
principles already distinguish:

- **Implement** work is a subtree, and no implement item is rooted above
  another.
- **Contract** work is a seam's path, including the exposure declarations
  along it. The map says where each contract lives. Seams that carry the same
  data share one contract.
- **Integrate** work holds the feature's acceptance, as a list, and any
  testing module that makes it executable.
- A run has one entry item for each top consumer that has work, not exactly
  one.

With these, work-item roots stop being a free choice. They follow from
owners, contract groups and weights. The one judgment left is the vertical
choice the principles describe, a higher or a lower root, and that is where an
architect's uncertainty belongs.

## Foresight against discovery

The second lesson is a tension, not a defect. The principles say plans are
incomplete, finer detail is left to the engineer, and a consumer's fake
reveals what the requirement actually is. Yet the architects' capability goals
ran from 70 to 220 words and fixed data shapes in advance: counts, groups,
ordering, bounds, the forms of an answer. In the medium plan, the consumer's
brief then carried three such paragraphs about its providers. A consumer that
reads the provider's decided shape before writing a line is not discovering
anything.

Part of this was induced. The spike asked for goals an engineer could complete
from the paragraph alone, because a harness that cannot write needs goals it
can copy. That request and need-to-know pull in opposite directions, and the
spike shows where the line should fall:

- A goal states the outcome **at its consumer's level**: what becomes possible
  and how to tell. It leaves the interface's shape to the contract item, which
  is where the principles put it.
- A consumer's brief carries a provider's identifier, owner and one-sentence
  summary. The full goal reaches only the provider.
- A capability is named in the map only when something outside its owner's
  work item consumes it, or when it is that work item's single goal. The small
  plan's four capabilities for one module's change added sixty lines of goal
  and no routing value.

The large plan adds a caution in the other direction. One answer crosses five
seams there, and the architect observed that two engineers could each satisfy
their goal and still disagree on its shape. Pure consumer-first discovery
would derive that shape five times. The architect's remedy, a vocabulary at
the common ancestor, is right, and it is the shared contract of the previous
section: written once, when the first consumer's fake asks for it. The
foresight the map owes is that the seams share a contract, not what the
contract says.

## What the map lacks

Three architects, independently, looked for the same missing places: an
acceptance list whose entries keep their identity; constraints that bind
several capabilities, stated once; the plan's exclusions; and a way to say
that a module must be verified although nothing in it changes. All four are
things a person wrote in the plan that the map could only smear across goal
paragraphs. They are cheap to add and they are what the integrate item's brief
is made of.

All three also looked for an order among work items. The loop needs none,
because needs create the order. The procedure should say so, or architects
will keep encoding order in prose.

## Cost

| Plan | Modules touched | Architect tokens | Time |
| --- | ---: | ---: | --- |
| Small | 2 | 88k | 5 min |
| Medium | 7 | 131k | 9 min |
| Large | 11 | 126k | 9 min |

Mapping cost is nearly flat in the size of the plan. Orientation, the skill
and the procedure dominate; the feature adds little. For a large feature that
is a bargain. For a small one, mapping may cost as much as the change. The
loop's smallest run, the spine alone, is therefore not yet cheap, and a
lighter mapping for plans that a first look places in one subtree is worth
measuring once real sessions exist.

## On the two loop proposals

The [work loop](../work-loop.md) makes the map's work items the registry of
goals. The [implementation loop](../implementation-loop.md) keeps the map to
capabilities and has an architect decide each scope and goal when it is
needed.

The spike supports the second proposal's diagnosis and not quite its remedy.
The diagnosis: what and where were reliable, and how the work is cut was not.
But most of the unreliability came from a schema that could not express a
path or a composition, not from deciding too early. Once it can, roots are
mostly derived, and a separate architect decision before every item would
spend a session to confirm a derivation. What remains open between the two is
small and testable: whether the vertical choice of root is better proposed
once in the map and revised on evidence, or made fresh at each delegation.

## What to do next

1. Change the map schema: scope shapes for implement, contract and integrate
   work; where each contract lives and which seams share it; several entry
   items; acceptance, constraints and exclusions as lists; a capability
   summary beside its goal.
2. Change the procedure to match, and turn the spike's gap report into map
   validation that runs before a person is asked to approve.
3. Update the work loop: entry items in the spine, acceptance on the integrate
   item, contracts keyed by contract group, the contract item's path scope.
4. Rerun the three architects. The measure is zero mechanical gaps and an
   entry brief for the large plan that fits a bounded context.
5. Then run one engineer on the medium plan's entry item in a worktree. It is
   the first test of what this spike could only read for: whether a consumer
   working from such a brief fakes what it lacks and reports needs that match
   the planned capabilities.
