# P1 module architect report

## Request

- **As understood:** Place a new project rule that limits every module README's
  purpose paragraph to 600 characters and reports a project issue during a
  check.
- **Question type:** placement
- **Requesting module:** none

## Method

- **Architect revision:** `rev/1:e140db8a-efcc-44b8-8da1-cd44dff06dfc:1`
- **Guidance read:** `references/placement.md`,
  `references/cognitive-decomposition.md`, `report.md`
- **Source read:** none
- **Verification performed:** refreshed the architect view; compared the
  purposes and retained behavior of project acquisition, analysis composition,
  model decisions, description parsing and CLI presentation

## Evidence

- `ramify/analysis/project` selects and acquires a real project, validates its
  physical ownership layout, records README purpose metadata and reports project
  state (`.ramify-architect/analysis/project/module.json:9-12`).
- That module owns the internal `readPurpose` behavior, whose result is
  `ModulePurpose` (`.ramify-architect/analysis/project/behavior.jsonl:30`).
- It owns the exposed `ModulePurpose` vocabulary containing the README path and
  paragraph, and the exposed `ProjectIssue` interface
  (`.ramify-architect/analysis/project/supporting.jsonl:6` and
  `.ramify-architect/analysis/project/supporting.jsonl:19`).
- Its README-purpose tests exercise `readPurpose`, while its observer tests
  cover re-reading a README as a purpose
  (`.ramify-architect/analysis/project/tests.jsonl:6` and
  `.ramify-architect/analysis/project/tests.jsonl:9`).
- The parent `ramify/analysis` module composes project, source, description and
  model facts into reports rather than owning project acquisition
  (`.ramify-architect/analysis/module.json:9-12`).
- `ramify/analysis/descriptions` parses and links `module.ramify` declarations
  without reading files, while `ramify/cli` explicitly owns no checking
  algorithm (`.ramify-architect/analysis/descriptions/module.json:9-12` and
  `.ramify-architect/cli/module.json:9-12`).

## Answer

Place the rule in `ramify/analysis/project`. The rule constrains the README
purpose that this module already reads and represents, and it produces the
`ProjectIssue` vocabulary this module already owns. The recommendation keeps
the existing tree because the evidence does not show distinct complexity that
a new abstraction would hide.

## Alternatives

- **Preserve the existing tree — selected.** Add the validation beside purpose
  acquisition and project issues. Its concepts and invariants remain together,
  with no new contract or navigation cost.
- **`ramify/analysis` — strongest runner-up.** It composes validation outcomes,
  but moving this rule there would separate the constraint from the README
  purpose representation and acquisition that establish its input.
- **A new child of `ramify/analysis/project` — rejected.** One length rule does
  not establish substantial local complexity or implementation knowledge that
  the parent could stop understanding.
- **`ramify/analysis/descriptions` or `ramify/cli` — rejected.** The former owns
  the declaration language and deliberately does not read files; the latter
  formats completed results and owns no checking algorithm.

## Proposed changes

No module-tree or exposure change. Implement the rule within
`ramify/analysis/project`, extend its project-issue vocabulary, and cover both a
valid purpose and an over-limit purpose at the project acquisition boundary.

## Not verified

No implementation or scratch check was requested. Metrics are unavailable and
the `ProjectIssue` signature is cut in the view; neither limitation changes the
observed ownership of the vocabulary. No source was needed to distinguish the
candidates.

## Next step

An engineering plan should define the exact issue code, character-counting
unit, diagnostic location and positive and over-limit cases in
`ramify/analysis/project`.
