# Iteration 1: Guidance contracts and synthetic source fixtures

**Plan:** [Shared guidance discovery and sync](../main-plan.md).
**Prerequisites:** Review the main plan's authority, placement and version 1 proposals. No actual document selection is a prerequisite.
**Owners:** Proposed `ramify/guidance` contract and architecture specification; CLI contract for the proposed command. No source implementation.

## Goal

Settle the source, selection, snapshot and refusal contracts sufficiently for one implementation to handle any approved catalog without special knowledge of Ramify's consumers.

## Read first

- Main plan: authority and scope, version 1 contract, acceptance cases and content-review handoff.
- `CLAUDE.md`, `ramify-agent/AGENTS.md`, `docs/agents/module-architect.principles.md` and `docs/architecture/README.md` for authority and direction.
- `subs/cli/README.md`, `subs/cli/module.ramify`, `subs/cli/src/arguments.ts`, `subs/cli/src/interfaces/cli.ts`, `src/cli-process.ts` and `module.ramify` for current CLI and composition boundaries.
- The generated `.ramify-architect/cli/module.json` and root module record after refreshing the view; use the view as evidence, not as source.

## Deliverables

1. `docs/architecture/guidance-sync.spec.md` records exact v1 JSON schemas, path and link behavior, profile and force semantics, source identity, output names and hashes, deterministic ordering, credential handling, publication recovery, exit codes and error documents. Include how a project points its local agent entry point to the generated index without the sync rewriting that file.
2. Decide the two open contract proposals in the main plan: Git descriptors for every owner, including Ramify, and one fixed v1 destination. Record any change as a plan revision before implementation. Specify the version compatibility claim and how an owner revises or withdraws an entry without changing an earlier pinned source.
3. Review whether the proposed new `ramify/guidance` child hides enough responsibility to justify its boundary. Give its exact `module.ramify` declaration, README purpose, public operation and root/CLI exposure path, or revise the plan to keep the behavior in `ramify/cli` with a concrete reason. Preserve the one-way ramify-agent boundary.
4. Create synthetic Git owner fixtures and a synthetic consumer selection covering two owners, two profiles, a mix of active/proposed and required/recommended entries, a selected companion with a relative link, an unresolved relative link, a rename and deletion, and one intentionally malformed catalog. These fixtures define data, not the real document inventory.

## Matrix rows executed here

Define expected inputs and outcomes for GS01–GS10 in the specification and fixtures. GS01, GS03, GS04 and GS08 must have positive and negative controls before implementation starts.

## Verification

Validate the draft schemas against the synthetic valid and invalid fixtures with a focused script or tests. Validate document links and the proposed module declaration against the current tree. This is structural planning evidence, not proof that sync or offline check executes.

## Exit criteria

The contract names every input and output identity, rejects floating revisions and ambiguous ownership, gives safe behavior for every fixture and has a reviewed module placement. No real project document is approved for inclusion.

## Handoff

Pass the exact schemas, fixture commits, expected GS outcomes, publication/recovery rules and approved owner boundary to iteration 2.
