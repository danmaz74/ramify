# Analysis

Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work and immutable reports. It owns stage outcomes and input identity so every client consumes the same completed analysis.

Iteration 7 provides `validateProject(inputs, control?)` through
`src/validation-entry.ts`. Supply the reviewed project request, resolved registry
and analysis limits. Validation runs acquisition, parsing, source cataloguing
and linking, then seals the captured inputs and disposes both compiler and input
view before returning. A valid result retains the inventory, input identity,
catalog and grounded descriptions as immutable data. Invalid, incomplete,
unavailable and cancelled outcomes contain no usable linked model.

This entry supports migration and declaration verification. Source access
decisions, the public analysis session and CLI arrive in later iterations.

Iteration 8 adds `acquireInventory(inputs, control?)` through
`src/inventory-entry.ts` and the installed `ramify.ts/analysis/inventory` entry.
It acquires and seals the real project inventory, resolves model source profiles
and releases its input view before returning detached data. It uses the
configuration-only integration without opening a source compiler program.
Production tooling consumes these profiles to exclude testing-classified areas;
the inventory itself retains every owned file and area.
