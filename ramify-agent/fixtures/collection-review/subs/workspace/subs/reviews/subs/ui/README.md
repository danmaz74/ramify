# Review UI

Review UI is the connected view. It is handed the typed client and a record id,
runs one review, and maps the API's inferred output onto the props its pure
child renders. Separating that loading step from rendering is what lets the
component be exercised without a browser.

It is the only view module classified for dispatch, which is what lets it name
the router type at all. The mapping stops here: the props it produces are owned
by its child, so no protocol type travels further down.
