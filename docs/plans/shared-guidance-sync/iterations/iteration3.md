# Iteration 3: CLI integration and executable acceptance

**Plan:** [Shared guidance discovery and sync](../main-plan.md).
**Prerequisites:** Iteration 2's public operation and verified synthetic fixtures.
**Owners:** `ramify/cli` for grammar and output, root for lazy installed assembly, approved guidance owner for integration fixes, documentation for usage.

## Goal

Make the pinned guidance workflow usable from the installed `ramify` executable and establish its complete acceptance evidence without adopting any real guidance document.

## Read first

- Main plan: runnable workflow, candidate-documents boundary and GS01–GS10.
- Iterations 1 and 2 handoffs and `docs/architecture/guidance-sync.spec.md`.
- `subs/cli/src/arguments.ts`, `run-cli.ts`, `interfaces/cli.ts`, `src/cli-process.ts`, `src/cli-entry.ts`, and the installed launcher's build path.
- `docs/architecture/cli-invocation.spec.md` and `subs/cli/README.md` for current command/error conventions.

## Deliverables

1. Add `ramify guidance sync|check` parsing, `--root`, `--dry-run` where applicable, `--format json`, help, cancellation and documented exit codes. Validate full grammar before dispatch. JSON output is one versioned document per invocation; human output identifies changed files and source revisions without printing secrets or entire documents.
2. Compose the guidance operation lazily in the root process so help/version, ordinary check and daemon operations do not load Git/source retrieval or scan guidance configuration. Include any new code in the installed Node and compiled-client builds with equal behavior.
3. Document author and consumer workflows: authoring an owner catalog, selecting exact revisions/profiles in a consumer, linking local `AGENTS.md` or `CLAUDE.md` to the generated index, reviewing diffs, updating pins and recovering from drift. State that the candidate inventory in the plan approves no real document.
4. Run the full GS01–GS10 matrix from a fresh synthetic consumer checkout through the installed executable. Verify no runtime dependency on ramify-audit or ramify-agent, no daemon startup and no source owner code execution. Record the exact source/build identities and results.

## Matrix rows executed here

GS09 and CLI/process evidence for GS01–GS10. Reuse iteration 2's owner tests for unchanged inputs; do not count them as installed-CLI evidence.

## Verification

Focused CLI grammar/dispatch tests, installed Node and compiled-client process tests, a synthetic local-Git sync, offline check from a fresh checkout, `npm run type-check`, `npm test`, `npm run build` and `npm run check:self`. Broaden only to resolve a failing required gate. Record any existing baseline failures separately from regressions.

## Exit criteria

The complete synthetic workflow passes through the installed command; the accepted output and lock are reviewable and reproducible; regular Ramify commands retain their startup behavior; the documentation states the adoption boundary; all required gates have recorded outcomes. No real document inclusion is implied.

## Handoff

Produce a completion report with GS01–GS10 evidence, command and artifact identities, remaining limitations and a blank content-review template for owner-by-owner document adoption.
