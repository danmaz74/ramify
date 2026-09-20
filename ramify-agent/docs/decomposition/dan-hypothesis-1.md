Starting from the initial plan, the architect describes the top level capabilities the plan requires. Top level capabilities are those which are user facing, or which are called from external systems, or anyway from systems which aren't part of the plan. For example, "a button which sends an email" is a top level capability; they're often called features, but here we prefer "top level capabilities".

Top level capabilities for a plan to implement are necessarily new capabilities, otherwise the plan would already be satisfied.

The top level capabilities are mapped to the corresponding module; usually an existing module, but if necessary, a new module.

Then the architect analyzes each top-level capability to decide if they need significant lower level capabilities to be implemented. A very simple feature/top level capability may not require any. Some very complex one may require many. These lower level capabilities may be existing ones to use as-is, existing ones which require some extension, or new ones.

The architect maps each lower level capability to a module, specifying if it's new or existing.

For new lower level capabilities, the architect proceeds with recursive decomposition, until there are no new capabilities which require significant decomposition.

At the end we have a map of capabilities to modules, but also dependency between capabilities.

----

Next, the implementation loop starts.

The harness chooses one top level capability.

A capability planner agent analyzes the original plan and the selected capability, with the accompanying information. From this it designs an interface to activate the capability (UI or API - if not already passed on) and executable test cases (if not already passed on). It also creates a more detailed brief for the implementation.

Next the brief and all other data is passed to a module engineer. The module engineer analyzes the brief, data, and its module and creates a detailed iterative plan - it could create just one iteration if the work looks simple, or multiple ones if it estimates that's required. While planning, the module engineer also checks if some implementation should happen in a submodule. If the work in the submodule is very simple, it can be included in a normal iteration, otherwise it will create a iteration working only inside that submodule.

