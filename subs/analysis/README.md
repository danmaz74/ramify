# Analysis

Analysis composes one captured project view, source facts, descriptions and model decisions into disposable batch work and immutable reports. It owns stage outcomes and input identity so every client consumes the same completed analysis.

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

`ramify.analysis/1` reports retain inventory and purpose metadata, captured
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
