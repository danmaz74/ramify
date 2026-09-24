# Iteration 2: API view README rendering, publication and view-byte equality

**Plan:** [Plan 2D](../main-plan.md).
**Prerequisites:** iteration 1's `providers` projection field, specification
text and baseline archive.
**Owners:** `daemon` (API view renderer and publisher); `AGENTS.md` and the
module-architect skill's `references/access.md` for the instruction block.

## Goal

Every published API view area has the provider map as `README.md`, rendered by
the same path that Plan 2C measures, with no other published byte changed.

## Read first

- Main plan: API view `README.md` contract, the non-pollution invariant,
  VO11 and VO12.
- `subs/daemon/src/api-view-documents.ts` (`renderArea`, `renderMeta`,
  `renderCodeFence`), `api-view-publisher.ts` (staging order, replacement,
  stale-file removal, crash recovery).
- Plan 2C's bounded counting path in the same renderer and its MM07 and MM15
  tests.
- Tests: `api-view-documents.test.ts`, `api-view-publisher.test.ts`,
  `api-view-publisher-crash-recovery.test.ts`, `api-view-fixtures.ts`.

## Deliverables

1. `renderReadme(module, revision, area)`: the instruction block for that
   area, the identity line, the category headings and the provider entries,
   with the 600-byte purpose cut on a character boundary. It reuses the
   renderer's escaping helpers for purposes containing Markdown or backticks.
2. `renderArea` emits the README after the documents and before `_meta.json`,
   through the bounded emission path, so measurement-only calls count it and
   the per-area and invocation ceilings include it.
3. Publisher behavior is unchanged in kind: the README is staged, replaced and
   removed with its directory. Confirm that a view published by the starting
   build, without a README, is replaced cleanly, and that crash recovery
   treats the README as any other staged file.
4. The instruction blocks in `AGENTS.md` and `references/access.md` gain the
   one line, matching the specification exactly.
5. Golden READMEs: ordinary and tests areas of one module, an empty area, a
   purpose whose 600-byte cut falls within a multibyte character, a missing purpose,
   the root module as provider, and a nested provider beneath a listed
   ancestor.

## Matrix rows executed here

VO11 and VO12.

## Verification

Focused renderer and publisher tests. VO12 repeats Plan 2C's MM07 comparison
in a temporary project: in-memory view bytes against the sizes of the files a
real `materialize --view api --all` publishes, per owner and area, then an
unchanged repeat writing zero bytes. Inject a failure and a cancellation after
the README is staged and assert the previous complete view remains, with no
README from the failed attempt. Assert byte equality of every
`external/` and `children/` golden against its pre-iteration content.
Architect goldens change only in `metrics.contextSize.*.views` values.

## Exit criteria

VO11 and VO12 pass. No API document golden changed. The README appears in no
output of the two documented searches on the fixture. Plan 2C's focused suite
passes on the same build.

## Handoff

The delivered README format with its goldens, the measured README sizes of the
fixture, and the unchanged publisher semantics, for iteration 3's evidence.
