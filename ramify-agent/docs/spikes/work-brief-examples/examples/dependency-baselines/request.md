# Compare architectural dependencies with a saved baseline

Before a refactor, I want to save the project's current module dependencies.
Afterwards I want to see which relationships appeared, disappeared or changed,
both in the terminal and in the explorer. The saved baseline must survive a
daemon restart and must not depend on its old revision remaining in memory.

## Request

Provide named dependency baselines for one Ramify project.

- Save the current dependency analysis under a chosen name, from either the
  terminal or the explorer. Show which analyzed input and revision were saved.
- List saved baselines with their names and capture information, and delete
  a chosen baseline explicitly.
- Compare a selected baseline with a coherent current dependency analysis.
  Provide readable terminal output, deterministic JSON output, and a browser
  comparison view.
- Report modules added or removed and directed module relationships added,
  removed or changed. For a relationship present on both sides, show before
  and after values for the dependency counts and classifications already
  supported by Ramify's dependency view.
- Let a person inspect an individual change, see the evidence retained for
  each side and distinguish historical evidence from current source locations.
  A removed module or relationship must remain inspectable in the comparison.

Saving a baseline captures data; it does not create a Git commit or copy the
source tree. Comparing is read-only and does not replace the baseline.

## Comparison meaning

- Compare the production module dependencies represented by Ramify's existing
  dependency view. Preserve its meaning of ownership, behavioral evidence and
  counts. Do not introduce a separate definition of dependency for this feature.
- Repeated imports of the same original and changes to source line numbers
  alone must not appear as new architectural relationships.
- Match modules by their canonical identifiers. Treat a renamed module as a
  removal and an addition; automatic rename detection is outside this request.
- Preserve coverage and unavailable states for each side. When a side lacks
  sufficient evidence, show an incomplete or unavailable comparison rather
  than claiming that missing evidence means zero dependencies or definite
  removal. Observed differences may still be shown as qualified observations.
- Labels and totals must make the compared scope and any incomplete evidence
  clear. A browser filter changes what is displayed, not what the baseline
  contains or what the underlying comparison means.

## Persistence and consistency

- A successfully saved baseline remains usable after the daemon and explorer
  stop and restart. Saving under an existing name is rejected without replacing
  the original; replacement requires deleting it explicitly first.
- Failed or interrupted saves leave either a complete valid baseline or no
  new baseline. They never damage other baselines or advertise a partial file
  as a usable baseline.
- Baselines belong to one project and record enough format and analysis
  compatibility information to reject an incompatible comparison clearly.
  Corrupt data produces a useful error and is never silently overwritten.
- Use existing analysis capabilities. The browser and service layers must not
  independently scan TypeScript or reconstruct a second dependency analyzer.
- Baseline files do not become source inputs, architect/API-view content or
  triggers for repeated source analysis merely because they are created or
  removed. Do not retain entire reports, compiler sessions or source trees
  just to preserve a baseline.
- Apply explicit storage and result-size limits. Exceeding a limit is a visible
  refusal or an explicitly incomplete result, not silent loss of changes.
- If source changes while saving or comparing, use one identified coherent
  input per side or return a retryable result. Never merge facts from several
  current revisions. A displayed comparison becomes visibly stale when newer
  analysis is available, until the person refreshes it.

## Acceptance

1. Save a baseline, make no architectural changes and compare it: there are no
   dependency changes. Moving an import to another line has the same result.
2. Add one cross-module dependency, remove another and change the observed
   classification or count of a third. The comparison identifies the correct
   consumer/provider pairs and before/after values without unrelated changes.
3. Add and remove modules. Their relationships are represented consistently,
   and the historical details of removed entities remain inspectable.
4. Save from the terminal, restart the services and compare from the browser.
   Repeat in the other direction. Both surfaces use the same saved baseline
   and agree when comparing the same current input.
5. Human-readable output explains the changes; JSON output is deterministic
   for identical inputs and includes the identities and coverage of both sides.
6. A partial or unavailable analysis never produces a misleading clean result
   or treats unobserved relationships as proven removals.
7. Editing source while a comparison is requested produces a coherent result
   or a clear retryable response. Refresh replaces the displayed comparison
   with a coherent newer one.
8. Duplicate names, corrupt files, incompatible data, interruption during save
   and configured resource limits produce the persistence behavior above.
9. Listing and deleting baselines work across service restarts and surfaces.
   Comparing a deleted or unknown baseline produces a clear missing-baseline
   result; another project's baseline cannot be mistaken for this project's.
10. Saving, listing, comparing and deleting baselines do not change application
    source or introduce analysis churn from the baseline storage itself.

## Outside this request

Git checkout comparison, automatic baseline capture, cross-project comparison,
rename inference, architecture quality scores, automatic refactoring,
notification delivery, or a policy that makes an ordinary check fail because
dependencies changed.
