Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/cli and its descendants.
Map revision: 1.

Goal
  why-command: Provide `ramify why --from <module-or-file> --symbol <name>
  [--in <owner-module>] [--format json] [--batch]`, which prints whether that
  import would be allowed and explains the decision. An allowed answer prints
  the exposure path declaration by declaration with file and line, and the
  import to write. A refused answer names the single first rule that refuses
  it and, when the cause is a missing exposure, prints the declaration each
  module along the path would need, one per module, as a proposal the command
  never writes. An ambiguous symbol prints the candidates and decides nothing;
  an uncertain answer says so and names the limit. The JSON format carries the
  same content as data. The answer names the revision it came from, and the
  resident and batch paths give the same answer to the same question. The exit
  code is the success code whenever the question was answered, allowed or
  refused, and the documented usage and failure codes otherwise; a refused
  hypothetical import is not a failed check. The command writes no file. It is
  done when an allowed, a refused, an ambiguous and an uncertain question each
  print their full answer in both formats, and the exit codes hold for all of
  them.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/cli [heavy]: The new command's arguments, its resident and batch
  paths, its human and JSON output of the exposure path, proposals, candidates
  and limits, and its exit-code selection are all its own.

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
  - why-command: ServiceResult (ramify), ServiceError (ramify); for ramify/cli src
      available. Import: import type { ServiceError, ServiceResult } from '../../../src/interfaces/service.js';
      Record: subs/cli/src/.ramify/external/src/interfaces/service.ts.md
  - why-command: BatchOperation (ramify); for ramify/cli src
      available. Import: import type { BatchOperation } from '../../../src/interfaces/batch.js';
      Record: subs/cli/src/.ramify/external/src/interfaces/batch.ts.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
