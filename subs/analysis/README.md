# Analysis

Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work, immutable reports and a retained session whose revisions recompute only the facts a change reaches. It owns stage outcomes, input identity and computational invalidation so every client consumes the same completed analysis. It also selects the modules affected by changed paths or modules on demand from one revision's retained dependency facts.

`analyzeProject` runs the disposable batch pipeline over a fresh capture.
`resolveProject` selects the canonical root by the root marker, and its
configuration, supplying the Descriptions owner's marker reader; it reads only
the descriptions its climb passes, to decide their markers. Batch, validation,
inventory and session acquisitions receive the same reader beside the parser.
Resident contexts keep one `openRetainedSession` handle for their successive
revisions.

`openRetainedSession(inputs, control?)` observes one project, keeps a warm
compiler behind the retained adapter with the observer's sink, and publishes
frozen plain-data revisions. Each `update` classifies the named changes through
the observer, applies one compiler update, recomputes export descriptions over
their dependency closure, re-interprets the changed files and the importers of
every description that changed by value, rebuilds the model only when the link
input changed and decides the accesses the change reaches. A body edit that
leaves descriptions and access facts equal by value is the `unchanged-surface`
path; a declaration that only moved refreshes the decisions selecting it so
their evidence and diagnostic identities match a fresh pass. An update that only
creates or deletes owned sources takes the `membership` path: one incremental
compiler update, then only the files whose resolution those paths can change are
described and interpreted. A membership change whose reach the retained facts or
the compiler cannot bound takes the broad path instead. Every revision
carries its checked set, finding delta and timings; `report` materializes the
`ramify.analysis/2` document of a retained revision on request, equal to
`analyzeProject` over the same inputs except `runId`, and `verify` recomputes
everything from the warm compiler and compares it with the retained facts.

The decide stage also evaluates the signature-companion rule over the model, in
batch and on every revision path, as its own `companions` timing. Each violation
becomes an `exposed-without-companion` finding at its exposure statement; the
model stays valid and every access is still decided. Exposed originals with
`inferred` or `unresolved` companion facts add the `signature-inferred` and
`signature-unresolved` coverage notes. The outputs are a function of the model:
a revision that keeps the model object reuses them, and a relinked or
position-patched model is evaluated again without compiler work.

Iteration 7 provides `validateProject(inputs, control?)` through
`src/validation-entry.ts`. Supply the reviewed project request, resolved registry
and analysis limits. Validation runs acquisition, parsing, source cataloguing
and linking, then seals the captured inputs and disposes both compiler and input
view before returning. A valid result retains the inventory, input identity,
catalog and grounded descriptions as immutable data. Invalid, incomplete,
unavailable and cancelled outcomes contain no usable linked model.

This entry supports migration and declaration verification. The public analysis
session arrives in iteration 12; CLI delivery follows in iteration 13.

Iteration 8 adds `acquireInventory(inputs, control?)` through
`src/inventory-entry.ts` and the installed `ramify.ts/analysis/inventory` entry.
It acquires and seals the real project inventory, resolves model source profiles
and releases its input view before returning detached data. It uses the
configuration-only integration without opening a source compiler program.
Production tooling consumes these profiles to exclude testing-classified areas;
the inventory itself retains every owned file and area.

Iteration 9 adds the internal `evaluateAccesses` stage. It maps located static
selections and symbol-free targets through the model's `explainImport`, retaining
source origins, exposure evidence and stable diagnostics. Missing exports,
denied imports and unresolved work remain distinct. This stage takes a valid
linked model and detached source occurrences; iteration 12 connects it to the
public session. `validateProject` continues to accept validation capabilities
only, and does not report a completed source check.

Iteration 10 exercises the evaluation stage through the real source matrix.
Testing-origin decisions precede same-owner and tag exemptions, including
symbol-free and stylesheet targets; a production binding explicitly tagged
`testing` instead retains ordinary same-owner access. Reference assertions
retain exact profiles, selected requests, exposure evidence and located analysis
diagnostics. No public session contract or later source capability activates at
this stage.

Iteration 12 exposes `createAnalysisSession(inputs)` and
`analyzeProject(inputs, control?)` from `ramify.ts` and `ramify.ts/analysis`.
Construction does no I/O. A session admits one analysis call; disposal is
idempotent, interrupts active work and waits for compiler/input release.
The convenience binding always disposes its session. Retained reports contain
frozen, detached data and remain usable after disposal.

The session performs the whole bounded check. Requested capabilities are
recorded independently from implemented and executed capabilities; requesting
browser verification returns unavailable. Registry, acquisition, parsing,
catalog, linking, access interpretation and decisions have explicit execution
states. Invalid prerequisites block source checking. A completed check can pass
with located coverage notes; definite import violations and missing resource
exports fail it. A missing resource import is unverifiable, while an exposure
naming that missing resource is invalid.

Project boundaries are decided before symbol selection and the same-owner
exemption. An access whose target lies in a declared owned-ignored or external
tree without package resolution has the `denied` outcome, one located
`project-boundary-import` finding and no symbol decision, whatever its form:
value, type-only, symbol-free, namespace or lazy member selection, or
re-export. Each counts in the summary's denials and fails the check. An
installed package whose real location lies in such a tree stays external. An
always-excluded target is unverifiable with the nonblocking `excluded-target`
limit; a target outside the root is outside scope with `outside-module-target`;
neither is allowed or external.

`ramify.analysis/2` reports retain inventory and purpose metadata, captured
input identity, expanded declarations, original and accessed source locations,
source selections, decisions and provenance. The batch UUID identifies a call;
the input digest identifies its sealed root/configuration/registry and captured
observations. Input changes discard the whole candidate and retry within the
supplied finite acquisition budget. Exhaustion, read failures and work limits
retain available evidence with incomplete execution. Opaque unreferenced
resources retain their catalog state without claiming an uncovered source
access. CLI formatting and process delivery arrive in iteration 13.

The report size limit is checked before serialization. An oversized report
returns incomplete execution with explicit limit evidence and bounded retained
data. If even the echoed request is too large, the failure envelope retains a
marked prefix and omits the validated registry. The fixed 64 KiB control reserve
bounds that envelope, including when a supplied byte limit cannot hold the
mandatory schema. Decision evaluation yields between batches of 64 selections,
including selections within one large namespace occurrence.

Plan 2B's architect view is projected here and rendered here. `planArchitectView`
lists the symbol details, export shapes, test files and `.feature` files a
revision needs, and `projectArchitectView` builds the `ArchitectViewProjection`:
module facts in tree order, every owned exported original once with its role,
destinations, tags and the ancestors that re-expose it, and the test records of
every area whose profile includes `testing`. `RetainedSession.architectView`
answers it for the current sequence only, through the worker like `apiView`,
and reads a `.feature` file only while its bytes equal the revision's captured
input (`readFeatureTitles`, English keywords). `renderArchitectView` is pure: it
combines a projection with the daemon's dependency facts, or their unavailable
reason, into the view's files, bounded records and `_meta.json`, and throws when
the facts name another input. `projectTestReferences` projects, from the same
dependency analyzer run as the diagram, the originals each testing-profile file
references behaviorally; the analyzer's `ready` outcome carries them as
`testReferences`, `null` when only they were refused.

The modularity probe (`npm run probe:modularity`) and the dependency-analyzer
measurement probe live under `scripts/probes/` beside this owner's `src/`. They
are this owner's auxiliary source with its ordinary profile: they import its
source by relative path as same-owner source, cannot import its testing source,
and nothing exposes them. The modularity probe's Git adapter reads repository
history there, outside `src/`.
