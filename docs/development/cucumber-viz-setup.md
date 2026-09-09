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
- [x] Add `cucumber-viz.config.ts` at the root. `featurePaths` is the only
  required key; point it at the example's scenario. Set
  `documentRetention.enabled: false`: the default prunes date-prefixed files
  under `docs/analysis/` after 30 days and `docs/plans/done/` after 7.
  Done 2026-09-09, together with `.devcontainer/`, `.mcp.json`,
  `ecosystem.config.cjs` and the Codex config; the
  [operating guide](cucumber-viz.md#devcontainer-and-ports) lists the ports.
- [x] Ignore `.cucumber-viz/`, `cucumber-viz.config.local.json`,
  `*.viz.feature.meta/` and `examples/collection-review/.reference-work/`.
  Studio writes workflow state, turns, logs and review diffs under
  `.cucumber-viz/`. Done 2026-09-09, with `dist/`.
- [x] Ignore dependency directories and symlinks with `node_modules` (without
  a trailing slash). Done 2026-09-09. The former `node_modules/` pattern left
  Studio's root dependency link untracked in fresh worktrees.
- [ ] Decide the plan directory name. Studio uses it as the workflow branch
  and commit prefix, so `iteration-1-project-verifier` reads as an iteration
  everywhere. Renaming is a link sweep now and a live workflow later.
- [ ] At the split, remove the "Host-repo rules do NOT apply here" section
  from `CLAUDE.md` and keep the writing conventions.

## Checks

- [x] Keep the default `nodejs-react` profile and override its two command
  checks. Done 2026-09-09 in `cucumber-viz.config.ts`. Its `static` check runs `deps:check`, `deps:check:runtime-imports`,
  `runtime-deps:check`, `imports:check:ui-domains`,
  `imports:check:lib-type-imports` and `exports:check`, and its `regression`
  check runs a root `test:cucumber`; Ramify has none of these, and a missing
  script is an ordinary failing finding that enters the remediation loop, not
  a skip. The static override now runs `npm run worktree:prepare` followed by
  `npm run type-check`; the regression override runs only `npm test`.
  An override replaces the whole executor. Do not switch to the
  `minimal` profile: its workspace strategy is `none`, so execution and audit
  worktrees would get neither the `node_modules` link nor the build.
- [ ] Never register `npm run reference:verify` as a workflow check. It is the
  plan's gate and fails by design until iteration 14, and `check:self` exists
  only after iteration 15. Add each as a check once its iteration has passed.

## Constraints and sealed files

- [x] Add [cucumber-viz.constraints.json](../../cucumber-viz.constraints.json)
  at the root and protect it with `cucumber-viz.constraints.json.seal`.
  Done 2026-09-09. Both rules are non-executable and sealed:

| Globs | Kind | Sealed |
| --- | --- | --- |
| `**/*.principles.md` | principles | Yes. |
| `docs/architecture/**/*.spec.md` | spec | Yes. |

The active matches are the three model principles documents,
`cli-invocation.spec.md` and `quick-testing.spec.md`. The glossary, other
architecture documents and reference plans retain their existing names and are
not sealed. `docs/plans/**`, `docs/analysis/**` and `**/.reference-work/**` are
inactive; cucumber-viz also excludes dependency and build directories.

The rule file's sidecar protects the policy itself. Sealed-file checks also
detect changes to seal controls. Inspect the effective targets with Studio's
`sealed_files.ls` tools; the mandatory sealed-files check enforces the result.

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

- [x] Prepare independent package dependencies in execution and audit
  worktrees. Done 2026-09-09 with `npm run worktree:prepare`, which runs
  `npm ci` for the example and site using the tested checkout's lockfiles.
  Root agent instructions require it before implementation in each new
  execution worktree and after either package's manifest or lockfile changes.
  Studio's static executor runs it before type-checking, including in fresh
  audit worktrees. The Node strategy links only root `node_modules`; its
  audit build has a two-minute timeout, and `workspace.setupCommands` is
  honored only by the Rails adapter. See the
  [worktree procedure](cucumber-viz.md#execute-in-a-worktree).
  Verified with cucumber-viz 0.6.3 in a fresh disposable worktree: the
  resolved static and regression commands passed (353 toolkit tests), as
  did example type-checking, 77 example tests, its Cucumber scenario and
  build, and the site build. Both package dependency directories remained
  local to that checkout, and Git ignored them and the root dependency link.
- [ ] Preserve the [shared skill symlinks](README.md#shared-agent-skills)
  during export. Verify that both Claude and Codex launchers read Ramify's
  instructions and discover its five skills in the main checkout and in an
  execution worktree. Codex documents symlink support in its
  [skill guide](https://learn.chatgpt.com/docs/build-skills).
- [ ] Run a small workflow in a disposable worktree. Confirm the target root,
  selected instructions and skills, check commands and resulting evidence
  before assigning roadmap work. File and metadata validation alone does not
  exercise this integration.
