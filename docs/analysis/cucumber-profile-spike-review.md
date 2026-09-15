# Review of the Cucumber profile Bazel spike

**Date:** 2026-09-13. **Status:** Analysis of supplied evidence; no adoption decision.
This follows the [Bazel comparison](ramify-bazel-target-generation.md) and
[live-audit proposal](live-module-audits.md). It reviews the user-supplied
*Cucumber profile targets with Bazel and Gazelle — spike results*, dated
2026-09-13, reporting cucumber-viz commit `5b47e6d8a` plus uncommitted spike
files. Its scripts, generated definitions and raw results were not independently
inspected or executed here. Measurements below are reported evidence.

## Assessment

The spike establishes bounded feasibility for executing, reporting and reusing
Cucumber **profiles** through Bazel. It also identifies a concrete obstacle to
selectivity: both tested Worlds import the full `appRouter`. Switching to
Ramify's module graph would not remove those dependencies.

The stronger Ramify hypothesis is now a test-input adapter: use retained source
facts and declared ownership to maintain complete profile input manifests,
without translating every application import into a Bazel target dependency.
Bazel can supply execution and shared caching; the audit layer still needs
Git-linked evidence and reconstruction across worktrees and merges.

## What the measurements establish

| Reported observation | Interpretation |
| --- | --- |
| Two profiles, five features, 13 scenarios; runner retains profile paths, glue imports and tags | Executable Cucumber integration is demonstrated for this sample, extending the earlier Vitest-only runtime evidence. |
| Warm unchanged: 0.68s, neither profile executes | Reusing applicable profile results can remove almost all repeated Cucumber execution. |
| Profile-exclusive application edit: 9.39s, Module Architecture executes and Settings is cached | The declared inputs support some selective invalidation. |
| Shared application edit: 9.48s, both profiles execute in parallel | The shared dependency closure materially limits reuse; extra execution added little elapsed time in this particular comparison. |
| Failed profile executes again on the unchanged failing tree | The observed retry behavior matches the chosen cache policy, while the passing control is reused. |
| Fresh detached worktree: 8.23s, both results reused without a host dependency install/link | Cross-worktree execution reuse works for the same reported inputs, but startup, analysis and dependency materialization remain substantial. |
| Scenario JUnit, Cucumber messages and detailed failure logs survive | The backend can provide useful audit evidence and focused failure diagnostics. |

The npm baseline runs two commands sequentially in 15.0s; Bazel runs profiles
concurrently. It is not a matched comparison of execution speed. Cold Bazel
took 23.1s with an already warm repository cache. The 9.39s versus 9.48s rows
use different edits and have no reported variance, so their small difference
is not a reliable speedup estimate. Skipping Settings still saves execution
work and may matter under many concurrent agents or larger suites.

The failed-target behavior is consistent with Bazel's default `auto` policy,
which reruns failures. A different policy can reuse failures; the audit must
record which behavior was requested. [Bazel test-cache controls](https://bazel.build/docs/user-manual).

## Shared dependencies dominate granularity

The reported closures contain 748 and 741 source files, with 723 shared:
96.7% of Module Architecture's closure and 97.6% of Settings'. Their union is
766 files. Module Architecture has only 20 exclusive application files, plus
five glue files.

These are file-count overlap measurements, not a measured probability that a
developer's next edit affects both profiles. Expected savings depend on where
real changes occur, their combinations, profile costs and execution concurrency.
High overlap weakens selectivity without eliminating unchanged-input reuse.

For a Settings World that imports `appRouter`, which imports Module
Architecture's analyzer, a conservative dependency selector reaches Settings
when the analyzer changes. Ramify must preserve that relationship. A declared
domain boundary alone cannot justify skipping the Settings profile. Collapsing
files into Ramify modules can further broaden the selected set.

This revises the earlier speed-versus-confidence comparison: these Bazel targets
already execute whole profiles, rather than individual feature files or
scenarios. There is no demonstrated fine-target advantage here. More source
precision helps only where the profiles have independent inputs. Neither
profile granularity nor whole-module selection establishes complete coverage of
runtime dependencies.

Investigating domain-specific callers is justified, but it can change what the
tests verify. Full-router construction may detect import-time failures,
registration mistakes and cross-domain wiring defects. Retain explicit
full-router integration obligations if domain profiles are narrowed. Merely
removing inconvenient dependencies from the manifest would invalidate reuse.

## What failed in Gazelle, and what did not

The tested Aspect Gazelle generation fails strict resolution and produces a
cyclic graph in warning mode. That is sufficient to reject that generated graph
for audit use. Bazel requires an acyclic target graph.
[Bazel dependency model](https://bazel.build/concepts/dependencies).

The independent import walk strengthens the diagnosis beyond directory-grouping
artifacts: it reports 404 files in cycles and a largest strongly connected
component of 382 files. If all those import edges must be represented as target
dependencies, changing from directory targets to file targets cannot fix it.
Combining cyclic components or changing the source dependencies is necessary
under that representation.

However, it does not establish that Gazelle can never participate, or that
every valid Bazel representation must collapse a cycle into one source target.
The spike itself uses another representation: profile tests consume complete
flat source groups, and Bazel does not model the imports between their member
files. Several source groups can supply one complete runtime input set without
depending on each other. That is a packaging graph, not a source-import graph.

Aspect documents configurable source groups, but this experiment does not show
an automatic cycle-aware generator or a suitable custom extension. Dropping the
tested generator from this Cucumber path is a reasonable engineering choice;
calling the underlying tool universally incapable goes beyond the evidence.
[Aspect JS generation](https://github.com/aspect-build/aspect-gazelle/blob/js-v1.2.0/language/js/README.md).

Before treating all 382 files as an inseparable runtime component, distinguish
runtime loads from erased type imports and other analysis edges. The regex walk
does not establish that distinction. An erased missing type import is already
reported in Settings; `tsx` does not perform type checking. A passing runtime
profile therefore cannot replace a separate type-check obligation.
[tsx TypeScript behavior](https://github.com/privatenumber/tsx/blob/master/docs/typescript.md).

## The concrete opportunity for Ramify

[Plan 5](../plans/iteration-5-fast-incremental-checks/contracts.md) specifies
retained per-file descriptions, interpreted accesses, ownership, resolution
observations and revision coordination. Those facts could support a better
source resolver than a second regex walker, when all relevant files and
compiler scopes are covered. This is a proposed use of its contracts, not an
acceptance claim about the implementation.

Two integrations remain distinct:

- **Direct selection:** use [Plan 7](../plans/iteration-7-affected-modules/main-plan.md)
  to find affected modules, map them to profiles, and invoke existing runners.
  Cyclic impact graphs are traversable. Persistent evidence, provisioning and
  complete profile inputs still need an audit implementation.
- **Bazel input generation:** export per-profile file/resource manifests and
  deterministic flat source groups, letting Bazel decide execution reuse.
  This can avoid a compilation-target DAG migration. It requires file-level
  facts beneath Plan 7, whose module closure is intentionally broader and
  includes type and test relationships.

Neither path inherits a complete Cucumber input model from Plan 5. Add profile
and scenario discovery, feature files, hooks, World/setup imports, config and
tag filters, directory/glob membership changes, fixtures, subprocess tools,
package/toolchain identities and relevant environment or external state.
Created and deleted files must invalidate the right inventory and old evidence.
Computed imports and arbitrary filesystem reads need explicit handling or a
conservative fallback; compiler resolution alone does not solve them.

A freshness check must run before accepting cached evidence and against the
same captured inputs used for execution. It only proves that generated output
matches the generator's current model. If that model misses a computed import,
regenerating it can still produce a clean but incomplete manifest. The report's
proposal to accept the walker merely because `--check` passes is insufficient.

The reported `npx depcruise` registry fallback and disabled filesystem patch are
specific remaining evidence risks. Use declared, pinned executable inputs and
verify fixture symlinks reach only declared resources before authoritative
reuse. These conditions should precede expansion, rather than depend on whether
a third profile demonstrates good selectivity. Rules_js explicitly documents
that disabling its filesystem patch permits following symlinks outside the
runfiles/sandbox boundaries. [rules_js launcher](https://github.com/aspect-build/rules_js/blob/main/js/private/js_binary.bzl).
Bazel's reproducibility requirements apply to test resources, not just imports.
[Test environment contract](https://bazel.build/reference/test-encyclopedia).

## Evidence clarifications and next decision

Three report details need correction or clarification before acceptance:

- The four warning categories total 27, rather than the stated 29. Explain the
  remaining warnings or distinguish diagnostic counts from grouped imports.
- The 788 cycle errors are diagnostics, not necessarily 788 distinct cycles.
  Component membership is the more useful structural measure.
- The statement that all rows reported four passing Module Architecture
  scenarios conflicts with the two intentional failure rows. Baseline counts,
  expected failures and npm/Bazel parity on each mutated snapshot should be
  reported separately. Matching counts alone do not establish identical
  scenario identities and statuses; cached logs describe the earlier execution.

Keep profile granularity as the working candidate. Next inspect how many Worlds
load the full router and compare runtime closures before and after a bounded
caller change, preserving explicit integration coverage. Once input completeness
is controlled, use a third profile and meaningful failing changes to assess
selection beyond this pair. New tests, deleted inputs, shared resources and
an interaction failure after merging passing branches remain unproven cases.

The cross-worktree cache result supports the intended parallel-agent workflow,
but the spike does not implement its Git audit ledger or identify where a
regression entered history. Preserve original execution identities, input
digests, commit/dirty-tree provenance and merge ancestry separately from cache
reuse. The promising division is Ramify for source facts and audit applicability,
Bazel for reusable execution where worthwhile, and the Git audit layer for
historical evidence and regression reconstruction.
