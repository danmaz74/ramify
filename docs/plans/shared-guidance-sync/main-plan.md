# Shared guidance discovery and sync

**Date:** 2026-09-23. **Status:** draft for contract review; no implementation or document adoption has started. This is an additional Ramify deliverable outside the existing numbered analysis roadmap. The documents to publish and adopt are deliberately undecided; the [candidate inventory](#candidate-documents-not-an-adoption-list) is only input to a later content review.

## Goal and runnable outcome

Ramify supplies `ramify guidance sync` as the common delivery mechanism for agent-readable engineering guidance. A project such as XYZ opts into version-pinned catalogs maintained by their owning projects, chooses profiles, reviews the resulting files, and commits a local snapshot. Its agents read that snapshot from the checkout without contacting an upstream repository. Ramify itself can use the same command for guidance it adopts from another owner. This command does not make an external project's policy part of Ramify's model.

The first runnable workflow is:

1. XYZ has a checked-in `ramify.guidance.json` naming exact Git commits of the catalogs it chooses and the profiles selected from each.
2. `ramify guidance sync --root .` validates all selected entries, fetches their Markdown from the pinned owner revisions, stages a deterministic `docs/guidance/` snapshot, and reports additions, removals and changed hashes. It never edits XYZ's `AGENTS.md` or `CLAUDE.md`.
3. XYZ reviews and commits `docs/guidance/`, including an index and lock record. Its local agent entry point links to that index and adds project-specific instructions separately.
4. `ramify guidance check --root .` works offline from the selection, lock and snapshot. It reports drift, missing files, locally changed generated files and changed selection pins; it does not claim to know whether newer owner revisions exist.

The toolkit must complete this workflow with synthetic owner repositories and a synthetic XYZ project before any real document list is chosen. Applying it to Ramify, ramify-audit, ramify-agent or cucumber-viz is a later, reviewable adoption action, not a hidden part of the implementation gate.

## Authority and scope

- **The owner authors the original.** Ramify's model documents remain authoritative in Ramify; ramify-audit's evidence rules in ramify-audit; ramify-agent's harness rules in ramify-agent. Generic guidance can be authored in Ramify if Ramify accepts responsibility for its meaning. A catalog entry points to a file in its own repository and records its status and intended audiences. A central index may point to external catalogs but may not silently copy their authority or revise their text.
- **The consuming project adopts a snapshot.** The project chooses catalog revisions and profiles, reviews the sync diff and commits the result. The snapshot is a generated local reference, never an independently edited source. Local project rules remain separately authored and take precedence where the shared item is a recommendation. A conflict with an adopted requirement is reported for review rather than silently resolved.
- **Ramify owns the mechanism.** Ramify defines the catalog/selection/lock formats, safe retrieval, rendering, CLI and conformance checks. External catalogs are data, not imported source code or runtime dependencies. The command does not load the analysis daemon, alter the module model, or infer which documents a project needs from its imports.
- **Current dependency direction remains intact.** Toolkit source and built-in catalog do not import, read or name ramify-agent's roles or files. A consuming project may opt into a separately maintained ramify-agent catalog by URL and commit. No Ramify release depends on that catalog being reachable.
- **Status is explicit.** `active`, `proposed` and `historical` are catalog states; `required` and `recommended` are separate force values. An item is required only under its declared authority and profile. A `.principles.md` suffix alone does not imply that it binds every consumer.

This plan does not implement a remote policy enforcement service, automatic adoption, a new dependency requirement on ramify-audit or ramify-agent, a universal agent prompt, or an authoritative copy of another project's specifications. It does not choose the actual entries of any profile.

## Current evidence and proposed ownership

Verified from the checkout on 2026-09-23, then to be rechecked at iteration 1:

- The CLI `runCli` in `subs/cli/src/run-cli.ts` parses commands through `arguments.ts`, receives injected environment operations and has no guidance command. The installed Node/compiled entries are composed in `src/cli-process.ts`; existing commands use lazy root adapters when they need process behavior.
- The generated architect view at revision `rev/1:cecabcdd-e53c-4f8b-96fe-369c88f4948d:1` has 15 modules, measured production dependencies and test references, one unavailable detail and 21 dynamic titles. `ramify/cli` owns argument parsing, formatting and exit codes, and contains no checking algorithm. The view's semantic search did not establish a guidance-sync capability; source inspection confirmed no command by that name.
- `CLAUDE.md` makes Ramify's model principles authoritative and explicitly excludes cucumber-viz-specific architecture and styling conventions. `ramify-agent/AGENTS.md` keeps the toolkit dependency one-way. `docs/development/README.md` records selective cucumber-viz adaptations rather than treating its source as binding.
- The package manifest exposes one `ramify` executable. `ramify materialize` publishes generated, gitignored analysis views; guidance snapshots would instead be reviewable, tracked project documents with separate ownership and update semantics.

**Placement proposal:** add a `ramify/guidance` child under the root for catalog validation, pinned-source retrieval, selection, snapshot rendering, safe publication and offline checking. The CLI child owns `guidance sync|check` grammar, human/JSON output and exit codes. Root composes an on-demand guidance operation through a lazy import, keeping help/version and ordinary analysis commands free of Git or guidance startup. The new child hides trust, path and snapshot invariants from the CLI. No daemon, analysis or presentation owner imports it. Its `module.ramify` and README must specify tags, exposure and test placement after the contract review.

The strongest simpler alternative is to put all logic in `ramify/cli`. It avoids a module but makes the existing command adapter own remote-source validation, Git retrieval and filesystem publication. Retain that alternative if the reviewed implementation is genuinely small; the new child is justified only if it reduces recurring local complexity. A standalone sync package adds a second installed tool for the same Ramify-project workflow and is not proposed.

## Proposed version 1 contract for review

The following fixes the behavior to implement while leaving catalog **contents** open. Iteration 1 will specify exact schemas and CLI error codes before runtime work.

| Artifact | Proposed contract |
| --- | --- |
| Owner catalog | A UTF-8 JSON document in the owner's Git repository with `schemaVersion`, entries keyed by stable ID, profile membership, status, force, audience, source path, title and a one-sentence use cue. Each source path stays inside that same owner repository. The catalog contains no executable hooks or remote includes. |
| Consumer selection | Checked-in `ramify.guidance.json` with `schemaVersion`, one or more catalog descriptors (`id`, Git URL, full commit hash, catalog path, selected profile IDs). Reject credentials embedded in URLs. No floating branch or tag is accepted for a sync. An empty selection is valid and produces an explicit empty index. |
| Snapshot | Managed `docs/guidance/` with deterministic names, an index listing source owner, revision, status, force, use cue and generated path, the selected Markdown bodies, and one lock recording selected entry IDs, source paths, byte hashes and rendered hashes. The index points to local files. Ordering and line endings are canonical. Selected documents must declare companion files needed by relative links; the renderer rewrites those links to local managed paths and refuses unresolved relative links rather than silently copying an incomplete document. |
| Sync | Preview the exact diff first (`--dry-run`), then fetch and validate every source before writing. Never run source-provided code. Preserve credentials outside output, lock and diagnostics. Refuse unsafe paths, symlink escapes, duplicate IDs or destinations, changed managed files, and unmanaged destination collisions. Delete only files recorded as managed by the prior lock. Incomplete sync cannot report success; recovery/check detects an interrupted publication. |
| Check | Offline comparison of selection, lock and managed files. It verifies snapshot integrity and whether a new sync is required because local pins changed. It does not fetch, compare remote heads, or prove that prose is semantically correct. |
| Entry points | `ramify guidance sync [--root <dir>] [--dry-run] [--format json]` and `ramify guidance check [--root <dir>] [--format json]`. Invalid input, unavailable source, drift, refusal and interruption have separate structured reasons; document exact exit codes in the CLI contract. Help and version remain independent of Git/network access. |

Resolve at contract review whether a repository can opt into a catalog that is stored in the installed Ramify package, or whether all catalogs use the same explicit Git-commit descriptor. **Proposal:** one descriptor form for all owners, including Ramify, so snapshots can name exact source revisions and the CLI package does not need to embed changing policy text. Document how the project pins a guidance revision compatible with its Ramify tool version; do not infer compatibility from a matching package name.

Also resolve whether the snapshot lives at `docs/guidance/` for every project or permits a configured destination. **Proposal:** one v1 location, to keep agent instructions, drift checks and safe deletion simple. A local entry point links to the index; sync never rewrites agent instructions. Avoid generated `.principles.md` names for merely recommended entries, because a project may treat that suffix as an active constraint.

## Candidate documents, not an adoption list

These examples are a review queue. Each proposed entry needs an owner to approve its status, force, audience, exact section or file, and version policy. None is automatically selected by this plan.

| Candidate | Likely owner and possible profile | Review question |
| --- | --- | --- |
| Ramify importability, module description and TypeScript interpretation principles | Ramify; `ramified-project` requirement | Which exact version-matched documents must an agent have locally, and should the complete specifications be copied or indexed with focused reading instructions? |
| Module architect principles, especially contract placement and progressive disclosure | Ramify; `ramified-project` recommendation or `ramify-agent` guidance | Separate general engineering advice from Ramify's promised evidence and access semantics. |
| Boundary validation, resource lifetime and refactor-together practices | Current Ramify development guides or a newly accepted general owner; maintainers/recommended | Which sentences are generic enough to publish, and who maintains their independent wording? |
| Agent handoff, temporary fakes and verification evidence | Ramify-agent or a newly accepted general owner; agent-run/recommended | Which parts are necessary for a supported harness workflow, and which remain design proposals? |
| Audit evidence and revision identity | ramify-audit; audit-consumer requirement where applicable | Which public protocol is stable and appropriate for consumers, without copying implementation plans? |
| cucumber-viz Studio, styling, barrels and feature-test tiers | cucumber-viz only unless separately adapted | Keep project-specific mechanics out of default Ramify profiles. |

The content review can reject every candidate and still leave a valid sync mechanism. It must explicitly record inclusions and exclusions before any real project adopts a profile. The present proposal does not change the authority or status of any source document.

## Acceptance cases

| ID | Case and expected evidence |
| --- | --- |
| GS01 | Two synthetic owner repositories at fixed commits, each with distinct profiles; one synthetic project selects a subset and receives only those entries. |
| GS02 | Repeating sync with unchanged pins yields byte-identical managed files and no diff. Offline check passes. |
| GS03 | Changing an owner commit or selected profile yields an exact preview; applying it updates the lock and only affected managed files. |
| GS04 | Remote branch advancement without changing the pinned commit changes nothing. A missing commit or source path refuses sync with source identity and no success claim. |
| GS05 | Invalid catalog schema, duplicate ID/destination, traversal path, symlink escape, malicious filename, embedded URL credential, unresolved relative link and unmanaged-file collision refuse before publication. No source-provided command runs. |
| GS06 | A user edit to a managed file and a local selection change are detected distinctly; sync refuses to overwrite the edit without an explicit reviewed recovery path. |
| GS07 | A mid-fetch or mid-publication failure retains or recoverably identifies the previous snapshot; check never reports a mixed snapshot as current. |
| GS08 | Active/required and proposed/recommended entries remain distinct in index and lock. A recommended entry is not emitted as an active `.principles.md` file. |
| GS09 | `--help`, `--version` and ordinary `ramify check` do not read catalogs, load the Git adapter, contact a host or start a daemon because of guidance support. |
| GS10 | A fresh checkout with committed snapshot and no network can read the index and pass offline check. No runtime dependency on any source owner's package is needed. |

The synthetic test repositories should include at least one source containing links, one stale local snapshot, a renamed/deleted entry, an unavailable remote, and a private-repository credential supplied through the user's normal Git environment. Never put credentials in fixture snapshots or captured output.

## Ordered iterations

1. **Contract and fixtures:** finalize schema, trust/authority rules, CLI outcomes and source packaging; specify owner catalog and consumer selection with synthetic fixtures. Review proposed module placement and exact `module.ramify` declarations. No real content adoption.
2. **Guidance owner:** implement pinned Git retrieval, validation, deterministic rendering, safe publication and offline drift checks against the fixtures. Keep network and filesystem adapters injectable and source text inert.
3. **CLI and acceptance:** add lazy CLI/root wiring, documented commands, human/JSON outcomes, package/build inclusion, an end-to-end run from a fresh synthetic checkout, and owner/consumer authoring instructions. Run GS01–GS10 and the affected toolkit build, type, test and self-check gates.

The [iteration manifest](iterations/manifest.json) orders these handoffs. The completion gate is the third iteration's evidence plus a review of the exact generated snapshot diff. Passing document-link or schema validation alone does not establish the executable workflow.

## Content-review handoff and deferrals

After the mechanism passes its gate, prepare a separate content-review table for each proposed entry: canonical owner and revision, exact source path/section, audience/profile, status, force, use cue, whether the text needs extraction or rewriting, compatibility range and adoption destinations. The owner approves publication; each consumer reviews its selected snapshot. This plan intentionally leaves that table unfilled.

Future work may add hosted catalogs, automatic update pull requests, richer relevance filtering, project-specific destination layouts or tighter integration with an agent harness. None is needed to make the first pinned, reviewable, offline-readable workflow work.
