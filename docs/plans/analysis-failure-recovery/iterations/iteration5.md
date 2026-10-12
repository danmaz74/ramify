# Iteration 5: Negotiated service and IPC evidence carriers

**Plan:** [Evidence during invalid analysis](../main-plan.md).
**Prerequisites:** Iteration 4's context snapshots and iteration 3's typed failure fields.
**Owners:** Root service contract; daemon service, codec, connection and validation.

## Goal

Transmit structured failure and recovery evidence unchanged on both operation outcomes and service failures, with explicit version compatibility.

## Read first

- [Main plan](../main-plan.md), carrier migration; [specification](../../../architecture/analysis-failure-recovery.spec.md), public carriers and compatibility.
- [Matrix](../acceptance.md), FR02, FR09–FR11 and FR16–FR19; prior contract/results files.
- `src/interfaces/service.ts`; daemon `service.ts`, `codec.ts`, `validation.ts`, `connection.ts`, context re-exposures and existing IPC/service/validation tests.

## Deliverables

1. Enable the reviewed next handshake protocol, proposed `ramify.ipc/3`, across server, client, startup/build compatibility and direct adapter validation. Record the exact selected increment and rationale.
2. Forward recovery on reported invalid/unavailable outcomes as `value.recovery`, and on service errors as `error.recovery` with diagnostics/stages. Preserve evidence on context-bearing not-checked outcomes and failures without reports.
3. Strictly validate shared recovery and diagnostic/stage shapes, bounds and identities. Reuse one semantic recovery type; do not serialize evidence into scalar `details` or duplicate an independently maintained wire model.
4. Exercise explicit old/new incompatibility in both directions, including the built-client startup path. Do not downgrade and silently strip evidence.
5. Preserve response limits, cancellation, slow-consumer and shutdown behavior. Do not add ownership to the service protocol or extend unrelated watch/status documents.

## Matrix rows executed here

FR02 transport portion, FR09–FR11 propagation, FR16 context loss, FR18–FR19. Built-process compatibility is repeated at its actual boundary in iteration 7.

## Verification

Run focused daemon `service.test.ts`, `affected-service.test.ts`, `ipc.test.ts`, `codec.test.ts`, `validation.test.ts` and boundary-wire tests after adding named cases. Use real socket exchange for FR18–FR19, with owned resources; direct service tests alone are insufficient. Run type checks, build and `check:self`.

Compare complete structured evidence after decoding for both carrier locations. Inject malformed recovery, an oversized frame, a reportless failure and an old peer. Expect incompatibility, never a valid reply missing evidence. The CLI may still omit presentation pending iteration 6; record that gap explicitly.

## Exit criteria

New peers preserve all available evidence, old peers receive explicit incompatibility and strict validation rejects malformed carriers. No success schema outside the specified migration changes incidentally.

## Handoff

Negotiated protocol identifier, wire examples, strict validators, old-peer evidence and remaining CLI adapter inventory. The same snapshots are ready for changed-check and generic failure formatting.
