# Review Controller

Review Controller owns the supervisor step that advances a scheduled task to
its result. It is the smallest part of the review runtime and the only part
that decides when a task runs.

Its operations travel upward to the runtime that calls them and no further, so
its sibling task module cannot import them.
