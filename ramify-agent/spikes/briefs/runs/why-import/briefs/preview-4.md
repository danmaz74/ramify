Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/service-api and its descendants.
Map revision: 1.

Goal
  why-procedure: Offer the hypothetical-import question to the browser as one
  read-only procedure of a project's local web service: it takes an importer
  and a symbol name for the bound project, relays the question to the resident
  process for that project, and returns the answer in the browser-facing
  shape, including the revision it came from and its allowed, refused,
  ambiguous and uncertain forms, with a readable failure when the project is
  not currently bound or the resident process is unreachable. It adds no rule
  of its own and reads no project file. It is done when the answer it returns
  for a question matches, field for field in meaning, the answer the command
  line receives for the same question against the same project state.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/service-api [light]: It gains one read-only browser-facing
  procedure that relays the question for the bound project and maps the answer
  into the browser model, as it already relays the dependency view.

Obligations: seams you provide
  - why-procedure, consumed by ramify/explorer: conformance tests at <from the contract item's result>

Planned, outside your scope
  - why-service-contract owner: ramify
  Extend the dispatch-facing service and batch vocabulary so a client process
  can ask one project whether a hypothetical import would be allowed and
  receive the whole answer, including the revision it was answered from, its
  allowed, refused, ambiguous and uncertain forms, and the documented error
  for an unknown module, file or symbol and for a project that is not open.
  The batch form carries the same answer as the resident form, which today's
  batch result shape cannot express because it carries a check report only.
  The vocabulary decides nothing and adds no rule; it is done when both a
  resident client and a batch client can be written against it without either
  inventing a field the other lacks.
  - why-operation owner: ramify/daemon
  Accept the hypothetical-import question as a read-only operation of the
  resident process: validate its parameters, reject a malformed or unaddressed
  one with the documented error, route a valid one to the addressed project,
  return the answer unchanged to the caller over the local transport, and
  report the operation among the capabilities a connecting client discovers.
  The operation writes no file and changes no project state, and it is done
  when a connected client receives, unaltered, the answer the project
  produced, and an older client that does not know the operation still
  connects and works.
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - why-procedure: ServiceConnection (ramify/daemon); for ramify/service-api src
      available. Import: import type { ServiceConnection } from '../../daemon/src/interfaces/daemon.js';
      Record: subs/service-api/src/.ramify/external/subs/daemon/src/interfaces/daemon.ts.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
