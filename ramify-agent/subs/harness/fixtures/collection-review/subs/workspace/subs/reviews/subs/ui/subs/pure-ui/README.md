# Review Result View

Review Result View renders a finished review. It owns both the component and
the props it is rendered with, and it keeps the formatting behind those props
private to its internals.

It receives values and callbacks rather than importing a protocol or runtime
type. Its parent's dispatch classification is not inherited, so the router type
that parent can name is visible here and still not importable.
