# Project view

Project view renders Ramify's revision-bound explorer compatibility model as a
pure browser-facing behavioral dependency diagram with a detail panel, and as a
collapsible module tree with a module detail panel.

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
