# Standalone cucumber-viz setup

This checklist tracks unfinished integration work for the repository split.
The findings were verified against cucumber-viz source at the commit named in
the [adaptation sources](README.md#adaptation-sources); recheck them against
the installed version. Record completion evidence here. After setup, use the
[operating guide](cucumber-viz.md).

## Repository and configuration

- [ ] Split Ramify into its own git repository with a checked-out branch.
  Studio creates worktrees under `/tmp/worktrees/` and `workflow/<plan>`
  branches from the repository root it is pointed at; a nested directory is
  not a root.
- [ ] Add `cucumber-viz.config.ts` at the root. `featurePaths` is the only
  required key; point it at the example's scenario. Set
  `documentRetention.enabled: false`: the default prunes date-prefixed files
  under `docs/analysis/` after 30 days and `docs/plans/done/` after 7.
- [ ] Ignore `.cucumber-viz/`, `cucumber-viz.config.local.json`,
  `*.viz.feature.meta/` and `examples/collection-review/.reference-work/`.
  Studio writes workflow state, turns, logs and review diffs under
  `.cucumber-viz/`.
- [ ] Decide the plan directory name. Studio uses it as the workflow branch
  and commit prefix, so `iteration-1-project-verifier` reads as an iteration
  everywhere. Renaming is a link sweep now and a live workflow later.
- [ ] At the split, remove the "Host-repo rules do NOT apply here" section
  from `CLAUDE.md` and keep the writing conventions.

## Checks

- [ ] Keep the default `nodejs-react` profile and override its two command
  checks. Its `static` check runs `deps:check`, `deps:check:runtime-imports`,
  `runtime-deps:check`, `imports:check:ui-domains`,
  `imports:check:lib-type-imports` and `exports:check`, and its `regression`
  check runs a root `test:cucumber`; Ramify has none of these, and a missing
  script is an ordinary failing finding that enters the remediation loop, not
  a skip. Set `checks.overrides.static.executor` to run only
  `npm run type-check` and `checks.overrides.regression.executor` to run only
  `npm test`; an override replaces the whole executor. Do not switch to the
  `minimal` profile: its workspace strategy is `none`, so execution and audit
  worktrees would get neither the `node_modules` link nor the build.
- [ ] Never register `npm run reference:verify` as a workflow check. It is the
  plan's gate and fails by design until iteration 14, and `check:self` exists
  only after iteration 15. Add each as a check once its iteration has passed.

## Constraints and sealed files

- [ ] Add `cucumber-viz.constraints.json` at the root, sealed by its own
  `.seal` sidecar. Each rule carries `globs`, `executable` and `sealed`;
  sealing is that flag, and a `.seal` sidecar seals one file outside any rule.
  The sealed-files check cannot be disabled and passes trivially while the
  file is absent, so the file is what gives it teeth. Suggested rules:

| Globs | Kind | Sealed |
| --- | --- | --- |
| `docs/model/*.principles.md`, `docs/model/glossary.md` | principles | Yes. |
| `docs/architecture/cli-invocation.md` and the other decided architecture documents | spec | Yes. |
| `docs/plans/reference-project/cases.md`, `docs/plans/reference-project/contract-map.md` | spec | Yes. The plan forbids weakening the checker to manufacture a pass. |
| `**/*.viz.feature` | behavior | No; executable. |

Keep `docs/plans/**` other than the two files above, `docs/analysis/**`,
`**/.reference-work/**`, dependency trees and build output in `inactiveGlobs`.

## Documents the Studio looks up by path

- [ ] Decide which of these to create. Each is optional and enables a feature
  only at its literal path:
  - `docs/architecture/key-decisions.md`: the architecture-compliance planning
    item and review context. A short ledger pointing at the owning documents
    is enough.
  - `docs/architecture/modularization/modularization-principles.md`: the
    modularization-compliance item and review context. For Ramify this states
    that ramify.ts is itself a ramified project and points at the model.
  - `docs/architecture/sealed-files.principles.md`: the sealed-files-compliance
    planning item.
  - `docs/architecture/architecture.md`: review and docs-maintenance context.
  `CLAUDE.md` is read by every execution, review and docs-maintenance prompt.
  `AGENTS.md` is read by Codex, not by cucumber-viz.

## Prompts and module support

- [ ] Select or adapt planning prompts to the deliverable. At the inspected
  revision:
  - `e2e-test-final-step` requests browser testing and dependency-cruiser
    checks without a capability gate. Plan 1 needs CLI and process
    acceptance; browser acceptance belongs to visualization work.
  - It references the absent `.claude/skills/e2e-test-and-fix/`; use the
    local `testing` skill when adapting it.
  - Styling and reuse prompts reference host `react-styling` and
    `react-components-registry` skills. Leave these unselected until UI work.
- [ ] Run iterations as ordinary iterations, not module-bound ones. The
  execution-envelope schema requires barrel-shaped contracts ending in
  `index.ts` or `client.ts` and a path-based module provider; neither
  implements Ramify ownership. The iteration files carry owners, prerequisites
  and read-first lists in prose. Review imports and exposures manually until
  the checker supports them.

## Worktrees and agents

- [ ] Decide how the example's dependencies reach an execution worktree. The
  Node workspace strategy symlinks the root `node_modules` and runs
  `npm run build` with a two-minute timeout; it installs nothing else, and
  `workspace.setupCommands` is honored only by the Rails adapter. Either hoist
  `examples/collection-review` into a root npm workspace so its dependencies
  land in the root `node_modules`, or make the harness install them during the
  iteration. Iterations from 5 onward resolve the example's imports.
- [ ] Preserve the [shared skill symlinks](README.md#shared-agent-skills)
  during export. Verify that both Claude and Codex launchers read Ramify's
  instructions and discover its five skills in the main checkout and in an
  execution worktree. Codex documents symlink support in its
  [skill guide](https://learn.chatgpt.com/docs/build-skills).
- [ ] Run a small workflow in a disposable worktree. Confirm the target root,
  selected instructions and skills, check commands and resulting evidence
  before assigning roadmap work. File and metadata validation alone does not
  exercise this integration.
