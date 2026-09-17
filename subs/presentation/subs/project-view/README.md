# Project view

Project view renders Ramify's revision-bound explorer compatibility model as a
pure browser-facing behavioral dependency diagram with a detail panel, and as a
collapsible module tree with a module detail panel.

The diagram draws only links from a supplied dependency model
(`ramify.explorer-dependencies/1`), declared here in the same serialized shape
the explorer server produces. By default it shows behavioral links to imported
modules. Two local settings, showing non-behavioral dependencies and choosing
original owners as link targets, select among the loaded links and never
request data. Import occurrences from the project model remain secondary source
evidence. Without a dependency model, the modules are drawn with a waiting,
analyzing, unavailable or not-requested state and no links.
