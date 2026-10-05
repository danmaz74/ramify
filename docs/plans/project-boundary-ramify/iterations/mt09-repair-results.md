# MT09 load-flake repair results

**Date:** 2026-10-05. **Status:** repaired in the component, as the
coordinator authorized. The flake in
`subs/explorer/src/tests/ModuleTreePage.test.tsx` › MT09 › "marks a newer
revision stale and keeps surviving selection and collapsed IDs on refresh" was
a product defect. `ModuleTreePage` lost a click that landed between the commit
of a newly rendered model and the run of its reconciling effect. MT09 is
unchanged. Two deterministic regression tests were added. Changes are
uncommitted.

## Identity

| Item | Value |
| --- | --- |
| Checkout | `/home/app/ramify-pb1`, branch `feat/project-boundary-ramify` |
| Base commit | `86c1a7f2` (docs-only on top of `3b5c168f`, where the diagnosis was made) |
| Changed | `subs/explorer/src/ModuleTreePage.tsx`; `subs/explorer/src/tests/ModuleTreePage.test.tsx` (additions only); this receipt |
| Unchanged | MT09 and every other existing test; `ProjectExplorerPage.tsx`; the explorer README |
| Evidence | `/home/app/ramify-pb1-evidence/mt09/` |

## Cause

`ModuleTreePage` keeps `collapsed` as `null` until the first model arrives. The
`collapsedModuleIds` memo derives the starting set during that render. A
passive effect then stored it with
`if (collapsed !== collapsedModuleIds) setCollapsed(collapsedModuleIds)`, a
value captured when the effect's render ran.

A click can land after the commit but before that effect runs. The click queues
its own update first, for example the toggle `{root/a}`. React then runs the
pending effect, which queues the stale starting set behind the toggle and
overwrites it. The selection line of the same effect,
`setSelected(selectedModuleId)`, overwrote a newer selection in the same way.

In MT09, both collapse toggles land in that window under load. The first is
overwritten and the second applies to the overwritten set, giving `{root/b}`.
Refresh drops `root/b`, so `a` is expanded and `Expand a` is not found. The
audit's DOM dump shows exactly that state.

## Fix

Both writes in the reconciling effect are now updater functions, so they apply
to the stored value rather than to the value the render saw:

- `setCollapsed(previous => previous === null ? collapsedModuleIds : keptCollapsible(previous, index))`.
  The starting set replaces only `null`, a stored set is never replaced, and IDs
  whose modules no longer have children are still dropped on refresh, as before.
- `setSelected(previous => previous !== null && index.modulesById.has(previous) ? previous : null)`.
  A selection is cleared only when its module is gone.

`keptCollapsible` is the existing prune, moved into a helper shared by the memo
and the effect. Writes still happen only inside the effect, under the same
guards. `keptCollapsible` returns the same set when nothing is dropped, so the
values converge exactly as before and nothing loops. The updaters read
`previous`, never the closed-over `collapsed` or `selected`.

"Expand all" and "Collapse to depth 1" store a non-null set, so the starting
set can no longer replace them. That covers the "Collapse to depth 1" click in
the "60 modules" test.

## Regression tests

The new describe block "MT09: interactions before a newly rendered model
settles" uses `clickOnFirstRender`. A `MutationObserver` clicks in the
microtask after the commit that first renders the target. The mocked diagram
takes 20 ms per render (`flowRenderMs`). That is longer than React's 5 ms
scheduler frame, so React yields before the commit's passive effects and the
click deterministically lands in the window.

- "keeps a collapse toggled right after the first model renders": asserts
  `Expand a` and the exact visible nodes.
- "keeps a selection made right after a first model without the focus target
  renders": with `?module=root/missing`, asserts heading `a`.

| Run | Result |
| --- | --- |
| Before the fix, 5 runs | both tests failed every run (`regression-before-*.log`: `Expand a` / heading `a` not found) |
| After the fix, 5 runs | both passed every run (`regression-after-*.log`) |

A refresh-path selection test was tried first and passed even before the fix.
In jsdom the refreshed commit triggers a commit-phase synchronous re-render,
which flushes passive effects in the same task. That path offers no
reproducible window, so the focus-target variant replaced it.

## Verification

| Check | Result |
| --- | --- |
| Before the fix, unchanged file, 14 `node -e "for(;;){}"` loops on 12 cores, 3 copies at a time | 89/90 passed; 1 failed with the audit's signature (`serial-*.log`) |
| After the fix, same load, 30 rounds of 3 copies | 90/90 passed, 10/10 tests each (`fixed-*.log`) |
| File alone after the fix | 3/3 runs passed (10/10) |
| `subs/explorer/src/tests` | 5 files, 35 tests passed (`explorer-dir.log`) |
| `npm run type-check` | passed (`type-check.log`) |
| `npm run build` (includes `explorer:build`) | passed (`build.log`) |
| `npm run check:self` | passed: 15 owners, 0 errors, 0 denied (`check-self.log`) |

Each load process was killed by its recorded PID (`load-pids.txt`,
`load-pids-2.txt`) and verified gone. The explorer README describes nothing
this changes.

## Carried forward: `ProjectExplorerPage`

`subs/explorer/src/ProjectExplorerPage.tsx` has the same shape but was left
unchanged. It is a known defect:

- Lines 52–57 initialize the class filter from the first model. They replace
  `selectedClasses` with every class and set `classesInitialized`.
- Lines 80–93, the `?module=` focus effect, replace the selected classes, the
  scope and the selection on the first model.

A class toggle, a module click or a drill-down in the window after the first
model's commit is overwritten by those effects.

This fix is not equally contained. Until the effect runs, the first model
renders with `selectedClasses = []`, so every class checkbox shows unchecked.
A click in the window acts on a display that is itself wrong, and the correct
result is undefined. The fix needs the `ModuleTreePage` approach: a `null`
filter until initialized, with the starting classes derived in render. That
touches both effects and the toggle.

The reconciliation effect at lines 66–78 also closes over the selection, scope
and expanded IDs of the render that queued it. Its refresh path showed no
window in jsdom, for the reason given above.

## Coordinator review

The coordinator commissioned this repair after iteration 16's milestone gate
failed its audit once on MT09, and authorized the component change when the
investigation showed a product defect, not a test timing problem: an
interaction that landed between a model's first render and its settling
effect was overwritten. The coordinator reviewed the change: both state
writes now update from the stored value, the starting set applies only when
nothing is stored, and refresh pruning is unchanged. MT09 itself is
unchanged, and the two new tests fail on the previous code. The same shape in
`ProjectExplorerPage.tsx` is not fixed here and is carried forward as a
known defect. No protected document changed. The gate runs on the committed
candidate.
