# Copy a module identifier from the module tree

When discussing an architecture finding, I want to paste an unambiguous module
identifier into an issue or message. Today I can select a module in the tree
and inspect it; give me a convenient way to copy its identifier.

## Request

Add a **Copy module ID** action to the selected module's detail panel on the
module-tree page. Copy the full canonical identifier, such as
`ramify/analysis/typescript`, rather than its short display name or filesystem
directory.

Show a small confirmation after a successful copy. If the browser cannot
write to the clipboard, show a useful failure message and leave the identifier
visible and selectable so I can copy it manually.

## Constraints

- Use the identifier from the currently displayed module data. Copying must
  not request fresh analysis or change any project files.
- The action works with the keyboard and has an accessible name. Its result
  is announced without moving focus away from the action.
- The action does not change module selection, collapse state or graph position.
- Feedback belongs to the module whose identifier was copied. Selecting
  another module while a clipboard request is pending must not show that
  previous request's success or error as feedback for the new selection.
- No action appears for the synthetic project node or when no module is selected.
- This request concerns the module-tree detail panel only.

## Acceptance

1. Select a nested module, activate the action and paste elsewhere: the pasted
   text is its exact full identifier, with no extra label or whitespace.
2. Two modules with the same short name in different branches copy different,
   correct identifiers. The real root module can also be copied.
3. A successful copy produces confirmation; clipboard rejection or an
   unavailable clipboard produces a failure message and a manual-copy option.
4. Keyboard activation works and neither success nor failure disrupts the tree.
5. Switching selection during a pending request does not attach stale feedback
   to the newly selected module.

## Outside this request

Copying links, copying source paths, copying several modules at once, changing
the import explorer, or remembering clipboard feedback after the page closes.
