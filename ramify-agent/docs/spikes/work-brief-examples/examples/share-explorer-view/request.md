# Share a dependency explorer view

When I find an interesting dependency in the import explorer, I want to send
a colleague a link that opens the same view. A link that only focuses one
module loses the scope, filters and dependency settings that explain what I
was looking at.

## Request

Add a **Copy view link** action to the import explorer. Opening that link in
another tab connected to the same project's running explorer restores:

- The module scope being explored.
- The selected module or dependency link, if there is one.
- The selected module presentation classes, including a deliberately empty
  selection.
- The dependency depth setting, whether non-behavioral dependencies are shown,
  and whether the scope's own-source node is shown.

Keep the address in step with meaningful navigation so that browser Back and
Forward restore earlier views. Reloading the current address restores the
view too. Panning, zooming and resizing the sidebar are not navigation steps.

The link describes a view of the latest available analysis, not a frozen copy
of the project. Opening it must not imply that its data is the same revision
the sender originally saw.

## Constraints

- Preserve existing links that use `?module=` to focus a module.
- Equivalent view state produces the same link, regardless of the order in
  which filters were toggled. Module identifiers containing slashes must
  round-trip correctly.
- Restore the state once the relevant data becomes available. Initial loading
  must not overwrite the requested view with defaults or create extra history
  entries. Browser Back and Forward must not create a navigation loop.
- If a requested scope or selection no longer exists, show a useful notice
  and a usable fallback. Retain independent settings that are still valid.
- Unknown or malformed settings do not crash the page. Ignore unsupported
  values with a notice; preserve supported ones. A URL without view settings
  keeps the current default behavior.
- Links contain navigation state, not source contents, access tokens or an
  absolute filesystem path. No server-side account or saved-view database is
  required.
- Clipboard failure is reported, and the generated link remains available
  for manual copying.

## Acceptance

1. Drill into a nested module, change the dependency settings and presentation
   filters, select a visible dependency, and copy the link. A fresh tab with
   the same project revision restores the same meaningful view and selection.
2. Repeat with a module selection, an own-source selection and no selection;
   each supported state restores without selecting an unrelated entity.
3. An intentionally empty presentation-class selection survives a round trip.
4. After three navigation changes, Back and Forward restore the expected
   earlier and later views. Reload preserves the current view.
5. Delayed project or dependency data does not erase the requested state.
6. Remove the selected module or dependency before opening a saved link. The
   explorer explains the missing selection and remains usable with the valid
   settings preserved.
7. Legacy module links, encoded identifiers and malformed optional settings
   follow the behavior above.
8. The same logical view generates the same link, and copying failure does not
   falsely report success.

## Outside this request

Sharing across machines or projects, keeping the local server address stable
across restarts, storing historical analysis, restoring graph coordinates,
persisting chat content, or adding sharing to the module-tree page.
