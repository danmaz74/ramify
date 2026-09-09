# Developing Ramify

Use these guides alongside the active plan. The root
[agent instructions](../../CLAUDE.md) identify the authoritative specifications
and the writing conventions every document follows.

| Guide | Purpose |
| --- | --- |
| [Implementation workflow](implementation-workflow.md) | Plan the work, implement iterations and hand off results. |
| [Testing](testing.md) | Choose tests, run checks and reproduce bugs. |
| [Engineering practices](engineering-practices.md) | Design contracts, manage resources and refactor safely. |
| [Using cucumber-viz](cucumber-viz.md) | The devcontainer and its ports; run and diagnose Studio workflows. |
| [Standalone setup checklist](cucumber-viz-setup.md) | Resolve the remaining integration work before using Studio in the new repository. |

## Shared agent skills

Use the skill relevant to the task:

- [planning](../../.claude/skills/planning/SKILL.md)
- [iteration-work](../../.claude/skills/iteration-work/SKILL.md)
- [testing](../../.claude/skills/testing/SKILL.md)
- [bugfixing](../../.claude/skills/bugfixing/SKILL.md)
- [cucumber-viz-debugging](../../.claude/skills/cucumber-viz-debugging/SKILL.md)

The canonical files live in `.claude/skills/`; `.agents/skills/` holds relative
symlinks for Codex, which discovers skills from the working directory and the
repository root and follows symlinks. Claude Code loads a nested
`.claude/skills/` directory the first time it reads or edits a file below it,
or immediately after `/add-dir ramify`; started inside `ramify/`, it loads them
at startup. While Ramify is nested, the host's `planning` and `bugfixing`
skills share those names: the bare `/planning` runs the host skill, and
`/ramify:planning` runs Ramify's. Claude Code also lists the directory-qualified
variants with an instruction to pick the skill whose directory holds the files
being edited. The clash disappears at the split.

## Adaptation sources

These guides adapt selected cucumber-viz practices as of its commit
`4d94df6e619814e08ffc51e7e6ec9b1571e0eca2`. The paths below are relative to
that repository's root and record provenance only; the local guides contain
everything needed here.

- Workflow: `docs/architecture/modularization/implementation-phase/principles.md`
  and `docs/architecture/modularization/seeds/capabilities-contracts-fakes.md`.
- Testing: `docs/testing-guidelines.md` and
  `docs/architecture/quick-mode-e2e-testing.md`.
- Engineering: `docs/architecture/defensive-strategies.md`.
- Studio: `docs/architecture/constraints.principles.md`,
  `docs/architecture/check-finding.principles.md`,
  `docs/architecture/modularization/implementation-phase/iteration-execution-envelope.md`
  and `.claude/skills/`.
