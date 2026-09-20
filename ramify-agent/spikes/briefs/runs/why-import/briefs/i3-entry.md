```text
Role: engineer.  Scope: ramify and its descendants.
Map revision: 1.  Plan: ramify-agent/spikes/briefs/plans/why-import/plan.md (read it when the goal is unclear).

Goal
  The feature is complete when, from the assembled product, one question about
  a hypothetical import is answered the same way through the command line with
  a resident process, through the command's batch mode, through its data
  format and through the served explorer, for an allowed, a refused and an
  ambiguous case; when a refused case's proposed declarations, written by
  hand, make an ordinary check accept the real import; when the same question
  from a testing file and from ordinary source differs only as testing-source
  isolation requires; when an answer with an analysis limit is reported as
  uncertain rather than as allowed or refused; and when the command exits with
  the success code for both allowed and refused answers while starting no
  compiler against a running resident process.            <- map: entryPoint.acceptance
  why-service-contract: Extend the dispatch-facing service and batch
  vocabulary so a client process can ask one project whether a hypothetical
  import would be allowed and receive the whole answer, including the revision
  it was answered from, its allowed, refused, ambiguous and uncertain forms,
  and the documented error for an unknown module, file or symbol and for a
  project that is not open. The batch form carries the same answer as the
  resident form, which today's batch result shape cannot express because it
  carries a check report only. The vocabulary decides nothing and adds no
  rule; it is done when both a resident client and a batch client can be
  written against it without either inventing a field the other lacks.            <- map: newCapabilities.goal

Modules in your scope that the map expects to change
  - ramify/analysis/model [heavy]: It already owns the importability decision,
  the exposure evidence and the tag rules, so forming a hypothetical question,
  resolving an ambiguous symbol name and deriving the exposure steps that
  would allow the import belong to it.
  - ramify/analysis [heavy]: It composes the whole answer from the facts one
  analysis already holds: it resolves the importer given as a module or a
  file, obtains the decision, renders the proposed declarations, and reports
  an analysis limit as an explicit uncertainty.
  - ramify/analysis/descriptions [light]: It owns the version 1 declaration
  language, so it gains the rendering of one proposed exposure change as the
  exact line that language would parse.
  - ramify [light]: It owns the dispatch-facing service and batch vocabulary
  the daemon implements and the clients consume, which must carry the
  question, the answer, its revision, its ambiguous and uncertain forms, and
  the batch result of a non-check operation.
  - ramify/daemon [light]: It accepts, validates and routes the new read-only
  service operation over its local transport and reports it among its
  capabilities, following its existing detail-request path.
  - ramify/daemon/contexts [light]: It answers the question from the published
  revision of the addressed context through its ordered queue, with the same
  generation, freshness and superseded outcomes as its other read-only
  requests.
  - ramify/cli [heavy]: The new command's arguments, its resident and batch
  paths, its human and JSON output of the exposure path, proposals, candidates
  and limits, and its exit-code selection are all its own.
  - ramify/service-api [light]: It gains one read-only browser-facing
  procedure that relays the question for the bound project and maps the answer
  into the browser model, as it already relays the dependency view.
  - ramify/presentation/project-view [heavy]: It owns the module tree and its
  detail panel, so the answer panel, the exposure-path highlighting in the
  tree, and the candidate, uncertain and failure states are its rendering
  work.
  - ramify/explorer [light]: It owns the served page and its client, so it
  carries the module selection and typed symbol into a request and shows the
  returned answer.
  - ramify/integration-tests [light]: It verifies contracts that cross the
  presentation and dispatch owners, which is where the plan's agreement
  between the command line, batch, JSON and the explorer is demonstrated.

Obligations: seams you provide
  - why-answer, consumed by ramify/daemon/contexts: conformance tests at <from the contract item's result>
  - why-operation, consumed by ramify/cli: conformance tests at <from the contract item's result>
  - why-operation, consumed by ramify/service-api: conformance tests at <from the contract item's result>
  - why-procedure, consumed by ramify/explorer: conformance tests at <from the contract item's result>
  - why-panel, consumed by ramify/explorer: conformance tests at <from the contract item's result>

Planned, outside your scope
  (none)
  If you need one of these, write a fake of only what you lack, make your
  behavioral tests pass against it, and report the need by its identifier.
  Anything else you lack and cannot build within your scope is an unplanned need.

Known interfaces
  - why-answer: explainImport (ramify/analysis/model), explainVisibility (ramify/analysis/model); for ramify/analysis src
      available. Import: import { explainImport, explainVisibility } from '../subs/model/src/index.js';
      Record: subs/analysis/src/.ramify/children/subs/analysis/subs/model/src/decisions.ts.md
  - why-revision-answer: RetainedSession (ramify/analysis), SessionRevision (ramify/analysis); for ramify/daemon/contexts src
      available. Import: import type { RetainedSession, SessionRevision } from '../../../../analysis/src/interfaces/session.js';
      Record: subs/daemon/subs/contexts/src/.ramify/external/subs/analysis/src/interfaces/session.ts.md
  - why-command: ServiceResult (ramify), ServiceError (ramify); for ramify/cli src
      available. Import: import type { ServiceError, ServiceResult } from '../../../src/interfaces/service.js';
      Record: subs/cli/src/.ramify/external/src/interfaces/service.ts.md
  - why-command: BatchOperation (ramify); for ramify/cli src
      available. Import: import type { BatchOperation } from '../../../src/interfaces/batch.js';
      Record: subs/cli/src/.ramify/external/src/interfaces/batch.ts.md
  - why-procedure: ServiceConnection (ramify/daemon); for ramify/service-api src
      available. Import: import type { ServiceConnection } from '../../daemon/src/interfaces/daemon.js';
      Record: subs/service-api/src/.ramify/external/subs/daemon/src/interfaces/daemon.ts.md
  - why-panel: ExposureHop (ramify/analysis/model), VisibilityDecision (ramify/analysis/model), ImportReason (ramify/analysis/model); for ramify/presentation/project-view src
      available. Import: import type { ExposureHop, ImportReason, VisibilityDecision } from '../../../../analysis/subs/model/src/interfaces/model.js';
      Record: subs/presentation/subs/project-view/src/.ramify/external/subs/analysis/subs/model/src/interfaces/model.ts.md
  - why-page-query: ProjectExplorerView (ramify/presentation/project-view); for ramify/explorer src
      available. Import: import { ProjectExplorerView } from '../../presentation/subs/project-view/src/ProjectExplorerView.js';
      Record: subs/explorer/src/.ramify/external/subs/presentation/subs/project-view/src/ProjectExplorerView.tsx.md
  - why-agreement: runCli (ramify/cli); for ramify/integration-tests src
      availability unknown: The requester's ordinary API view does not list the command entry, but that view reports 11 coverage notes, so its absence is not definitive; the root's declaration relays explorer, daemon, service-api, presentation and analysis symbols to descendants and relays no command-line symbol, so the agreement work item should expect to drive the installed command as a process or to ask for a root relay.

Report one outcome with submit_outcome: goal reached | partial, with needs |
contract needs revision | cannot be satisfied as specified | the map is wrong.
```
