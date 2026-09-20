# Workspace

Workspace is the browser shell. It owns the HTML entry, the React mount, the
application stylesheet, and the typed client the views are given, and it
composes the screen from the views its feature children expose upward. Because
the features are its children, a selected view reaches the shell without
becoming available to a sibling feature's UI.

Workspace is also the tree's relay point. Feature adapters travel through it to
the root, which mounts them, and the neutral vocabulary travels through it down
to every descendant. Those relays are declarations in `module.ramify`, not a
source barrel: the shell forwards symbols its own source could not import.
