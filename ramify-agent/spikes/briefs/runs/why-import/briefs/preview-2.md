Preview: this item exists only once a consumer reports a need for one of its capabilities.

```text
Role: engineer.  Scope: ramify/daemon and its descendants.
Map revision: 1.

Goal
  why-revision-answer: Answer the hypothetical-import question for one open
  project from the revision already published for that project, without
  analyzing anything again, and name that revision in the answer. The request
  takes its place in the context's ordered queue and obeys the same
  generation, lease, freshness and deadline rules as the other read-only
  requests, reporting the same cold, superseded and unavailable outcomes when
  the published revision cannot cover it. Nothing about ordinary checking,
  watching or revision publication changes, and the revision path does no
  added work for this request. It is done when the same question asked twice
  against one unchanged revision is answered twice from that revision with no
  analysis in between, and when a question arriving across a revision change
  is answered from the revision the answer names.            <- map: newCapabilities.goal
  why-operation: Accept the hypothetical-import question as a read-only
  operation of the resident process: validate its parameters, reject a
  malformed or unaddressed one with the documented error, route a valid one to
  the addressed project, return the answer unchanged to the caller over the
  local transport, and report the operation among the capabilities a
  connecting client discovers. The operation writes no file and changes no
  project state, and it is done when a connected client receives, unaltered,
  the answer the project produced, and an older client that does not know the
  operation still connects and works.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/daemon [light]: It accepts, validates and routes the new read-only
  service operation over its local transport and reports it among its
  capabilities, following its existing detail-request path.
  - ramify/daemon/contexts [light]: It answers the question from the published
  revision of the addressed context through its ordered queue, with the same
  generation, freshness and superseded outcomes as its other read-only
  requests.

Obligations: seams you provide
  - why-operation, consumed by ramify/cli: conformance tests at <from the contract item's result>
  - why-operation, consumed by ramify/service-api: conformance tests at <from the contract item's result>

Planned, outside your scope
  - why-answer owner: ramify/analysis
  From one analyzed project's completed facts, answer the question whether a
  named importer could import a named symbol, and return the whole answer as
  data: the decision and its single reason, the exposure path with the file
  and line of each declaration along it, the import a source file would write,
  the declarations that would be needed when the refusal is a missing
  exposure, or the candidate owners when the symbol name is ambiguous and no
  owner was named. An importer given as a file beneath a module's tests is
  answered under that testing area's profile, and the same module's ordinary
  source is answered under its ordinary profile. When a fact the answer
  depends on is missing or limited, the answer is explicitly uncertain and
  names the limit instead of reporting allowed or refused. Answering uses only
  what the analysis already holds: it starts no compiler, acquires no project
  state of its own, and writes nothing. It is done when an allowed, a refused,
  an ambiguous and an uncertain question each produce their complete answer,
  and the answer carries the identity of the analysis it came from.
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
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - why-revision-answer: RetainedSession (ramify/analysis), SessionRevision (ramify/analysis); for ramify/daemon/contexts src
      available. Import: import type { RetainedSession, SessionRevision } from '../../../../analysis/src/interfaces/session.js';
      Record: subs/daemon/subs/contexts/src/.ramify/external/subs/analysis/src/interfaces/session.ts.md

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
