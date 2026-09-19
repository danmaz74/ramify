# Iteration 3: The measure service operation

**Plan:** [Plan 2C](../main-plan.md).
**Prerequisites:** Iteration 2; decision 6 and the surface/resource contracts.
**Owners:** `daemon` (service, validation, codec); root
`src/interfaces/service.ts`.

## Goal

The daemon answers a bounded `measure` request with matching inventory buckets
and commonly measured view bytes, preserving explicit availability differences.

## Read first

- Main plan: decision 6, query/path/surface/resource contracts, acceptance
  MM08–MM09 and MM16–MM17.
- `src/interfaces/service.ts` (`MaterializeParams`, `MaterializeOutcome`,
  `RamifyService`, capabilities).
- `subs/daemon/src/service.ts` (`runMaterialize`, `explorerDetails` wiring),
  iteration 2's view-byte function, `validation.ts`, `codec.ts`, `host.ts`.
- [Processes and clients](../../../architecture/processes-and-clients.md) and
  the daemon's operation list in [daemon](../../../architecture/daemon.md).

## Deliverables

1. Service operation `measure` and capability `measure`: parameters,
   validation, codec, synchronized freshness, deadline and cancellation, and
   existing non-success outcomes from `materialize`, with a measurement-specific
   success carrying the document. No publication receipt is fabricated.
2. The operation joins the session's inventory buckets with iteration 2's
   view bytes and returns the `ramify.measure/1` document, including the views
   state, the normative path-attribution text and outside-module files.
   Join only one revision; invalid current inventory, supersession, cancellation
   and deadlines terminate the request instead of degrading to partial success.
3. Document updates: operation list, capability, and the processes-and-clients
   command table entry reserved for iteration 4.
4. Bound incremental response assembly by configured/negotiated maxResponseBytes,
   including exact escaped UTF-8 and transport envelope overhead, before a full
   encoded response is allocated. Pass the envelope budget from transport into
   the service; direct calls use the same configured ceiling with a conservative
   envelope allowance. Refuse oversized complete documents with
   resource-unavailable; never truncate files. Preserve the existing codec limit
   as a final guard, not the sole measurement limit. Share request controls
   across all phases and release temporary state on interruption.

## Matrix rows executed here

MM08–MM09 and MM16–MM17.

## Verification

Focused daemon tests: service, validation and codec cases for the new
operation; an actual-transport test through the daemon client; a
capability-negotiation test with an older client list.
Add same-revision fixed-omit architect versus measured-query cases, including
combined publication and repeat determinism. Inject API-render resource failure
and distinguish it from whole-request cancellation/deadline/supersession.
Use many-file/long-path fixtures with quotes, backslashes and multibyte names
to test exact response/envelope limits over transport and direct calls. Assert
early explicit refusal, no truncated success, mid-assembly interruption and
successful recovery. CLI inherits the same service ceiling in iteration 4.

## Exit criteria

`measure` and the architect view meet their equality/availability contract at
one revision; bounds and all interruption outcomes have actual-transport
evidence; `measure` writes nothing to the project; existing operations are
unchanged.

## Handoff

The operation, its outcome union and a fixture document, for the CLI command.
