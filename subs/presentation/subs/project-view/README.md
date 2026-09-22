# Project view

Project view renders Ramify's revision-bound explorer compatibility model as a
pure browser-facing behavioral dependency diagram with a detail panel, and as a
collapsible module tree with a module detail panel.

The module tree draws on a reusable hierarchy canvas, `ModuleTreeCanvas`. Its
caller supplies each node's identity, hierarchy, size, accent, shell emphasis
and body, and controls selection and collapse; the canvas owns placement,
edges, collapse controls, keyboard input, the minimap and fitting. The canvas
imports no stylesheet: its rules are in `module-tree-canvas.css`, which the
module tree imports beside its own.

Keyboard focus is navigation. A keyboard-focused element outside the viewport,
whether a node shell, a body control or a collapse control, is centred at the
current zoom, so a fitted tree keeps its zoom while the viewer moves through
it; the canvas centres on the focused element rather than on its node, because
a tall node's lower rows would stay out of view. Centering on the caller's
requested node sets zoom 1 instead, because that is the viewer's choice of one
node. A focus pan counts as a viewer move and ends auto-fitting. A browser
scrolls a scrollable ancestor to reveal the element it focuses, and React Flow
resets that scroll a moment later; the canvas undoes it first, so it measures
the element where it is drawn rather than where the browser briefly put it.
A body control's key press does not reach the shell, and Space on a body control
activates that control alone: it does not reach React Flow's pan-activation
key, which the shell and the pane keep. Below 480 px of canvas width the
canvas hides the minimap, whose fixed 200 by 150 box otherwise covers much of
the view.

The diagram draws only links from a supplied dependency model
(`ramify.explorer-dependencies/1`), declared here in the same serialized shape
the explorer server produces. It draws the model's original-owner collection,
rolled up to the current scope: every node stands for its module's whole
subtree, a link whose two ends map to one node is internal at that level, and
the scope module's own source is folded into the frame by default. Four local
settings, showing non-behavioral dependencies, choosing the link depth, showing
the links that leave the scope and drawing a drilled-in scope's own source as
its own node, select among the loaded links and never request data. That
own-source node stands for the scope module's own source alone, never for its
subtree, and carries the links in both directions between that own source and
each child.
The panels label each filtered number against the measured one. Import
occurrences from the project model remain secondary source evidence. Without a
dependency model, the modules are drawn with a waiting, analyzing, unavailable
or not-requested state and no links.
