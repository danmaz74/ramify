# Iteration 19: Site package consumption and runtime guides

**Plan:** [Phase 1: Ramify project boundaries](../main-plan.md).
**Prerequisites:** [Iteration 18](iteration18.md) and every earlier receipt. The iteration 1 reviewed contract revision is mandatory. Recheck the immediate handoff before editing.
**Owners and write scope:** Toolkit-owned site/scripts/teaching documents and package dependencies only; protected specifications only as proposed patches. No changes beneath `ramify-agent/` or
`/ramify-audit`, including installs or generated outputs.

**Protected documents:** Read the relevant authorities. Do not change any
project-owned `.principles.md` or `.spec.md` file without coordinator
authorization of the named file and exact patch. Report conflicts before
editing; follow the [protected-document procedure](../execution.md#protected-principles-and-specifications).

## Goal

Replace site aliases to toolkit internal source with supported candidate package exports and a root-prepared no-save/no-lock candidate install; commit no local artifact dependency path or invented registry integrity. Preserve a build order without a site-to-unbuilt-toolkit cycle or duplicated React runtime. A root script performs the pack-and-install, and `site:build` runs it, so a fresh checkout and a checkout after `npm --prefix site ci` both build the site without a manual step.

## Read first

- [Contracts](../contracts.md): Review decision R6; Transport, observation and projections.
- [Alignment](../alignment.md), the relevant owning specifications it names,
  and [source state](../source-state.md); verify the active checkout and revision.
- [Acceptance](../acceptance.md): PB1-31, PB1-34 and the independent
  expectations in [cases.json](../cases.json).
- [Written topology](../fixtures.md) and [execution/gates](../execution.md).
- Discover current symbols in the named architect view, then check ordinary or
  testing foreign API views separately before proposing a cross-owner API.

Current source entry points, relative to the toolkit root:

- `site/docusaurus.config.ts`.
- `site/package.json`.
- `scripts/production-selection.ts`.
- `scripts/build-production.ts`.
- `docs/development/testing.md`.
- `docs/architecture/cli-invocation.spec.md`.

Expand this read list only to answer a specific contract/implementation question.
Do not load the complete reference harness or generated catalogs into one context.

## Deliverables

1. Replace site aliases to toolkit internal source with supported candidate package exports and a root-prepared no-save/no-lock candidate install; commit no local artifact dependency path or invented registry integrity. Preserve a build order without a site-to-unbuilt-toolkit cycle or duplicated React runtime. Add the root script that packs the built candidate and installs it into the site, and make `site:build` run it first; `npm --prefix site ci` removes that install, so the build must not depend on an earlier manual step.
2. Keep production selection driven by resolved profiles as source inventory widens; add production-boundary.test.ts for testing modules/areas, auxiliary code and inert exclusions.
3. Set the package version to 0.2.0 in the manifest and lockfile, so the candidate qualified in iteration 20 already carries the version it is packed and later published under.
4. Update active package/CLI/site/model guides and examples to implemented behavior; preserve historical receipts and revise current status accurately. For the root marker this includes the root-selection sentences in `README.md` (`check` discovers the project from the working directory) and `docs/development/batch-verification.md`, the root marker and module header entries of the reader-facing `site/src/pages/glossary.md`, the description-format summary in `CLAUDE.md`, and the climb wording in `scripts/reference-harness/README.md`; site pages that show only child descriptions need no change. Propose each `.principles.md` or `.spec.md` change, including status wording in `cli-invocation.spec.md`, to the coordinator as an exact patch under the [protected-document procedure](../execution.md#protected-principles-and-specifications); do not edit it. Test an isolated NodeNext package consumer, including denied unlisted internals.

## Matrix rows executed here

Exercise PB1-31, PB1-34 at this slice's evidence boundary.
Cases whose producer is this iteration: PB1-31, PB1-34.
Other listed cases receive partial evidence only; their final pass remains with
that producing slice and the phase qualification gate.

## Verification

These focused commands supplement this iteration's audit gate and locked `reference:cases` command, as [execution.md](../execution.md#iteration-gates) defines them. New named tests are deliverables of this slice; do not report them run before they exist.

From the toolkit checkout:

```sh
npm run type-check
npm run build
npx vitest run src/tests/production-boundary.test.ts
npm run diagrams
npm run site:build
```

Use independent expected results and retain positive controls alongside denials.
Resident/process runs own their endpoint/process tree and must clean up in
`finally`. Every receipt records exact source/configuration and command identity,
stdout/stderr, result and remaining gaps. Do not widen full testing beyond the
required gate without changed inputs or unresolved failures.

## Exit criteria

PB1-31/34 pass. Site consumes a candidate artifact, not checkout aliases; agent/audit source or dependencies remain untouched.

Record `iteration19-results.md` through supported workflow tooling when executing,
with changed behavior, tested case instances, commands, primary artifact links,
source/config/contract revisions, actual full/direct/reference outcomes and
explicit remaining gaps. No completion result is authored by this planning task.
If a required gate fails, preserve the failure and fix or return it to its owner;
an expected later capability is never relabeled as a passed check.

## Handoff

Include the coordinator's protected-file comparison and semantic review,
recording no protected changes or the baseline, exact approvals and reviewed
diff identity. Unresolved protected changes prevent handoff acceptance.

Documented complete toolkit migration and package-consumption build recipe.
