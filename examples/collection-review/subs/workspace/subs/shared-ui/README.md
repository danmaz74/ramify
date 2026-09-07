# Shared UI

Shared UI owns the presentation primitives that more than one feature view
needs, beginning with the status badge that both the catalog card and the
review result render. It exists as a separate owner because two vertical
feature UIs must use those primitives while their core siblings must not.

Its symbols carry `ui` and `browser` and reach both feature UIs through
workspace. The core owners see them and still cannot import them, for values or
for types, because their source carries no UI classification.
