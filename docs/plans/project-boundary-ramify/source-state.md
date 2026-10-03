# Source state and readiness

**Checked:** 2026-10-03 at toolkit HEAD
`3fba41bdf3ce7bfd71645893c597708337f202f0`, with pre-existing documentation
edits and untracked consumer-plan drafts. No runtime changes were made while
authoring this plan. Refresh source and dependency facts in the execution checkout.

Architecture discovery used `.ramify-architect/`: 15 modules, input
`input/1:57be23d4baa3421f6ba3569382393ba24102dde2d658725cc8192cdedc2d9728`.
It reports measured dependencies/test references and truncated details. Those
counts are orientation facts, not a delivery target. Candidate source was then
read to confirm the following contracts. Ordinary foreign API catalogs were
searched separately; missing category directories do not prove an API absent.

| Current source | Verified fact | Planned change |
| --- | --- | --- |
| `subs/analysis/subs/descriptions/src/interfaces/syntax.ts`, `parse.ts` | Statements are exposure-only; version 1 has no nested-tree AST. | Discriminated exposure/tree statements, source spans and grammar validation. |
| `subs/analysis/subs/project/src/inventory.ts` | Inventory admits files under `src/`; an independent `tsconfig.json` can stop discovery; `.reference-work` has a special exclusion. | Explicit boundaries, auxiliary compiler source and canonical path ownership. |
| `subs/analysis/subs/project/src/interfaces/project.ts` | `ProjectScope.independentScopes`, `outsideModuleFiles` and `OutsideSourceWarning` describe old behavior. | Ownership metadata, explicit exclusion and new warning contracts. |
| `subs/analysis/subs/model/src/interfaces/model.ts` | `SourceOrigin` contains a file and source area, without auxiliary provenance. | Explicit provenance without changing importer profile or original identity. |
| `subs/analysis/subs/typescript/src/resolution.ts` | Resolution distinguishes application/external/outside-module targets, primarily from compiler declarations and paths. | Established package route retained separately from physical target and boundary classification. |
| `subs/analysis/src/affected-query.ts`, `interfaces/affected.ts` | Path bases are inventory/declaration/area/none; root inert paths can have no owner; schema is `ramify.affected/1`. | Containment, excluded outcomes and schema 2. |
| `subs/daemon/subs/contexts/src/interfaces/contexts.ts` | Synchronized checks expect observed content; no explicit not-analyzed path disposition. | Exclusions do not masquerade as successful source checks or freshness failures. |
| `subs/daemon/src/codec.ts`, `src/interfaces/service.ts` | Strict codec shapes include old scope/checked metadata; IPC protocol is version 1. | New shapes and coherent protocol/schema migration. |
| `subs/analysis/src/interfaces/architect-view.ts` | Module facts have source counts, areas and docs, without declared ignored-tree metadata. | Visible boundaries and correct auxiliary-source counts, without excluded contents. |
| `scripts/reference-harness/`, its compiler/Vitest configs | Independent runner includes this path; tests and `report`/`verify` commands live outside a declared module. | Root owned-ignored tree in place; analyzed root scripts stop importing from it; commands unchanged. |
| `scripts/production-selection.ts` | Selection uses resolved profiles; imports an analysis internal entry. | Legal analysis API; retain selection policy as inventory grows. |
| `site/docusaurus.config.ts`, `site/package.json` | Site aliases toolkit internals and has no toolkit package dependency. | Exported package consumption with isolated-install evidence. |
| `package.json`, `ramify-audit.json` | Scripts include build, type-check, self-check and `reference:cases`; audit runs build/type-check/main Vitest/self-check but not the separate reference command. | Preserve audit schema in Phase 1 and run reference separately at every gate. |

## Existing audit executable

The executable at `ramify-agent/node_modules/.bin/ramify-audit` is installed
`ramify-audit@0.3.2`. Reading it is allowed; installing or changing that project
is not. Its committed-configuration parser rejects `fullAuditPaths` today.
Its full-mode path skips partial planning and the toolkit `affected` query.

The [executable probe receipt](evidence/full-audit-preflight.json) retains the
exact command, fixture configuration, stdout/stderr, executable digest and
result. The probe's fresh temporary Git repository had a root module marker,
one deterministic check and no Ramify executable. Explicit `--full --force`
ran and returned pass/full. This proves the bounded mode path only. It does
not prove future toolkit audit preparation, full regression or acceptance.

At execution use the existing executable read-only from its absolute location,
or an identical externally installed artifact if the isolated checkout lacks
that path. Record the actual version/digest; never update the agent's pin to
obtain it. The candidate's own configuration, dependencies and build must come
from the candidate checkout, as [execution.md](execution.md) requires.
