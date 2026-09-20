# Plan 2: Put contracts with their authority

**Date:** 2026-09-20. **Status:** proposed prerequisite to the autonomous
implementation loop.

This plan corrects the ownership of ramify-agent's existing map and HTTP
contracts before the work loop extends them. It follows the
[autonomous implementation loop](../../architecture/autonomous-implementation-loop.md)
and its rule that the module with authority over behavior normally owns the
behavior's public contract.

Plan 1 created a neutral `contracts` branch so the harness and web could share
runtime schemas. The implemented structure now shows that the authority is not
neutral: the harness accepts and persists implementation maps and implements
the HTTP service, while the web is its client. The `contracts` parent owns no
source, and the root relays every public map and protocol export to every
descendant. Sharing does not require a separate owner.

## Runnable outcome

The existing application behaves exactly as before, but its dependency model
states the real authority:

```text
before

ramify-agent
├── contracts
│   ├── map                 globally relayed definitions
│   └── protocol            globally relayed definitions
├── harness                 implementation
└── web                     client

after

ramify-agent
├── harness
│   ├── src/interfaces/map.ts
│   └── src/interfaces/protocol/*.ts
│       owns and exposes its browser-safe public contracts
└── web
    └── imports only the exposed harness contracts
```

The `/api/v1` protocol, map documents, persisted records, HTTP behavior and UI
remain compatible. This is an ownership and source-placement refactor.

## Contract authority

The harness owns these contracts because it has authority over the behavior
they govern:

| Contract | Harness behavior governed | Consumers |
| --- | --- | --- |
| Implementation map | Accept, validate, identify, persist and approve a map. | Mapping procedure and web map view. |
| HTTP protocol | Accept commands and publish queries, receipts, job snapshots, events, errors and paths. | Web now; a future CLI may consume the same protocol. |

The schemas remain executable runtime values rather than becoming duplicated
client types. The harness exposes the browser-safe surface; the root re-exposes
only that named surface to descendants. `web` consumes it as the harness's
client. Private durable state remains in the harness and is not made public
merely because a client needs a projection.

This ownership rule does not claim that every contract belongs to a provider.
A consumer-defined port belongs to the consumer, and a peer agreement without
one-sided authority may belong at a common ancestor. Neither exception applies
to the current map or HTTP contracts.

## Exact source moves

Move the files without redesigning their contents:

| Current | Destination |
| --- | --- |
| `subs/contracts/subs/map/src/interfaces/map.ts` | `subs/harness/src/interfaces/map.ts` |
| `subs/contracts/subs/protocol/src/interfaces/errors.ts` | `subs/harness/src/interfaces/protocol/errors.ts` |
| `subs/contracts/subs/protocol/src/interfaces/ids.ts` | `subs/harness/src/interfaces/protocol/ids.ts` |
| `subs/contracts/subs/protocol/src/interfaces/jobs.ts` | `subs/harness/src/interfaces/protocol/jobs.ts` |
| `subs/contracts/subs/protocol/src/interfaces/maps.ts` | `subs/harness/src/interfaces/protocol/maps.ts` |
| `subs/contracts/subs/protocol/src/interfaces/paths.ts` | `subs/harness/src/interfaces/protocol/paths.ts` |
| `subs/contracts/subs/protocol/src/interfaces/queries.ts` | `subs/harness/src/interfaces/protocol/queries.ts` |
| `subs/contracts/subs/map/src/tests/map.test.ts` | `subs/harness/src/tests/map-contract.test.ts` |
| `subs/contracts/subs/protocol/src/tests/protocol.test.ts` | `subs/harness/src/tests/protocol-contract.test.ts` |

After every import and exposure has moved, remove `subs/contracts/`, including
its three `module.ramify` declarations and READMEs.

## Exposure and dependency changes

1. `harness/module.ramify` exposes every existing map and protocol public name
   from the new `src/interfaces/` files to its parent with the `browser` symbol
   tag. Preserve names, runtime shapes, TypeScript signatures and tags.
2. The root `module.ramify` removes `expose-sub * from contracts to
   descendants`. It re-exposes the harness contract names to descendants with
   explicit named selections. It does not re-expose `startServer`,
   `ProjectRootError` or `ProjectLockError` through that descendant channel.
3. Harness implementation and tests import their same-owner interfaces from
   the new paths. Web implementation and tests import the exposed files from
   `harness/src/interfaces/`; they do not import harness implementation files.
4. Protocol files import the map schemas from their new same-owner location.
5. Update current module READMEs and architecture references to say that the
   harness owns its public contracts and the web consumes them. Keep the
   completed Plan 1 documents as historical evidence of the structure it
   implemented.

Before editing, record the currently exposed map and protocol symbol names,
signatures and browser tags from the generated architect/API views. The result
note compares that inventory with the post-move view. Ownership and source paths
are expected to change; names, shapes, tags and consumer availability are not.

## Iteration

This plan has one implementation iteration:

| Iteration | Delivers | Exit evidence |
| ---: | --- | --- |
| 1 | Move both existing contract surfaces and their tests to the harness, update imports and explicit exposures, delete the neutral contract modules, and update current documentation. | The pre/post public-surface comparison shows only the intended owner and path changes; harness and web behavior, type checks, browser build, tests and Ramify validation pass. |

One iteration is appropriate because the change goal is narrow even though it
crosses the root, harness and web. Splitting map and protocol would create an
intermediate ownership model that the final design immediately removes.

The executable brief is [iteration 1](iterations/iteration1.md).

## Completion gate

1. `subs/contracts/` no longer exists and the generated architect view contains
   no `ramify-agent/contracts` owners.
2. Map and protocol public names, runtime validation behavior, TypeScript
   signatures and `browser` tags match the pre-refactor inventory, except for
   their intentional owner and source-path changes.
3. The web requester API view reports every contract symbol it imports as
   available from the harness-owned source. The web has no imports from other
   harness implementation paths.
4. HTTP paths, payload schemas, error status mappings, command semantics, map
   validation and persisted JSON formats are unchanged.
5. From `ramify-agent/`, `npm run type-check`, `npm test`, `npm run build:web`
   and `npm run check:self` pass.
6. The result note records the evidence identity, public-surface comparison,
   changed module tree, commands and outcomes.

## Out of scope

- Autonomous-run records, commands, projections or UI.
- Changes to the implementation-map schema or the `/api/v1` protocol.
- Extracting `harness/evidence` or `harness/jobs`.
- Reorganizing the agent port, which already has a behavior owner and
  implementations.
- A compatibility forwarding layer under `subs/contracts/`; all consumers are
  in this repository and move atomically.
- Rewriting the completed Plan 1 plan or its results to describe the new tree.

## Handoff to the autonomous-loop plan

The later plan starts from a harness-owned map contract and client protocol.
It keeps new durable run events and state private to the harness, then extends
the public protocol only with commands and projections required by clients. It
does not introduce `contracts/run` or recreate a neutral definitions branch
without evidence of independent contract authority.

