# Artifact review criteria

These criteria assess the handoff to an implementation agent. They are not
feature tests, architectural approval or a claim that the harness ran.

## Capability map

1. Valid JSON with the agreed fields and identities of the shared evidence.
2. Every relationship, reuse item and seam names an existing capability ID.
3. Owners exist in the target project's module tree, or a structural proposal
   is explicitly identified as unapproved.
4. Descriptions are capabilities. No work items, task scopes, iteration goals
   or execution order are embedded in the map.
5. Availability claims use the relevant requester's API view. Where evidence
   is missing or incomplete, the result says unknown.
6. Evidence separates retained facts, semantic interpretation and assumptions.

## First work brief

1. The selected consumer and scope are explicit execution decisions, derived
   from the request and map. The scope is a bounded subtree, with exclusions
   preventing horizontal work from being hidden inside a broad parent scope.
2. The work item's goal and first iteration's goal are distinct where needed.
   A large request does not become one unbounded iteration or a fixed backlog.
3. The first iteration produces meaningful observable progress. It does not
   begin with a provider merely because that provider will eventually be needed.
4. Relevant user requirements survive refinement, including error, async and
   compatibility behavior. Deferred feature obligations remain explicit.
5. The brief can be handed to a fresh scoped agent without a global map or
   an earlier conversation. Read-first references exist and are bounded.
6. Existing APIs are referenced from real evidence. Missing behavior is a
   candidate need, not a fabricated provider API or an already agreed contract.
7. The bootstrap is honest: tests and fakes are for the first implementation
   agent to establish. No nonexistent executable evidence is presented as real.
8. Partial progress can return local continuation and external needs. Fake-based
   success is distinguished from consumer integration and feature completion.
9. Restart instructions reuse current files without relying on a saved session.
10. Any unresolved blocker is explicit. Simulated approval authorizes no real
    structural change, and the spike ends before implementation in every case.

## Observation integrity

Record actual model invocations, corrections and output paths. Check input
move hashes, relative artifact links and source/configuration hashes. Do not
infer that executable acceptance or later delegations would pass from the
quality of a planning artifact.
