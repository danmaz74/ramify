Our goal is to give an architect agent the best possible tools to do its job.

Ramify modularization is built so that normal engineering agents should be able to do their jobs only with local data: they should know everything about the module they're working on, a lot about the module's children, and only the necessary information about the APIs that other modules expose to them. They shouldn't be concerned about the global application architecture.

The latter is the architect agent's job. Ideally, that should be the only agent which needs to a have a global view of the whole project, and the architecture of its modules. We want it to think mostly in terms of capabilities:

* a module implements capabilities
* to implement capabilities, it can compose other capabilities
* some of the capabilities a module implements are exposed to other modules
* some of the capabilities the module needs to compose are exposed by other modules

In practical terms, capabilities are exposed through a few kinds of symbols - functions (directly callable), classes (which can be instantiated and then expose callable methods); finding them semantically though can require other information too, eg documentantion, test descriptions, etc.

The architect agent needs to be able to map between abstract capabilities and concrete symbols on its own. Ramify should give the architect the best possible selection and format of the information it needs, in a deterministic way. So for example ramify should expose the modules topography, names, descriptions, exposed and not exposed symbols, documentation, but without adding any semantic elaboration. We also don't want to the architect to be overwhelmed, so we should expose the most significant information first - the architect should use global search only as a last resort, and shouldn't need to worry about implementation details.

The main use cases for the architect agent are:

* when some capability is required by module X, architect needs to be able to find if that's already implemented in any other module Y, anywhere else in the project. This can only be a best effort task - it can't be guaranteed to find it even if it exists, and that's OK. Once an existing capability is found, architect needs to determine if it's already accessible to module X, and if not, if it could and should be made accessible, and how. How may require exposing the capability through some chain, or even moving the capability somewhere else if that's the best design. We don't need to think about how to decide this now, only about how to expose the necessary information to the architect
* if the capability isn't found anywhere in the project, then architect needs to determine what is the most fitting existing module where it should be implemented. If no module is a good fit, architect could say that a new module should be created
* architect is also concerned with the health of the modular architecture, and could be asked to propose a refactoring: splitting modules, moving modules, joining modules

1. Capability discovery
   "Does something like this already exist?"
   → symbols + tests + docs across all modules

2. Accessibility analysis
   "Can X already use it, and through what path?"
   → ownership + exposure + visibility facts

3. Placement
   "If it doesn't exist, where does it belong?"
   → module descriptions + children + sibling structure +
     existing capabilities + dependencies

4. Architectural refactoring
   "Should responsibilities move/change?"
   → all of the above + incoming/outgoing usage +
     exposure consumers + structural metrics/history where available

We can expose some of the required information through MCP, but our working hypothesis is that having a materialized greppable view could be the best practical way for today's agents to do this.

## Vocabulary: capability and behavior

Ramify uses both words, each with one meaning.

A **behavior** is a property Ramify derives from code. A *behavior-capable symbol* is an exported value whose static shape can run: it is callable, constructable, or declares a callable or constructable member. A *behavioral dependency* is a reference that calls, constructs or passes such a symbol. Both are decided per symbol or per reference, deterministically, and say nothing about what the code is for. The [dependency glossary](dependency-glossary.md) defines them.

A **capability** is a purpose that a person or agent ascribes to one or more symbols: something a module does for others, in the terms the architect thinks in. Capabilities are stated by people, in README purposes, test titles and plans; Ramify never derives, names or counts them. A capability's entry points are behavior-capable symbols and its vocabulary is supporting types and data. One class may hold several capabilities, and one capability may span modules.

The rule that follows: Ramify's outputs, meaning the glossary, the classifier, the diagram, the generated views and their fields and counts, use behavior terms only. "Capability" appears only in architect-facing narrative such as this document and agent instructions, and always as something the agent maps onto symbols, never as a file, a field or a count. The one exception is the code's `Capability` type for the optional parts of the analysis pipeline; prose calls those *analysis capabilities*.
