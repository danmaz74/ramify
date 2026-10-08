<!-- ramify-agent architect write-scope section, version 1. Every architect procedure that assigns a write scope includes it. -->
`assignment.scope` decides what the assigned engineer may write:

- `base.module` names the owner. The base gives the engineer that owner's
  whole own contents: `module.ramify`, `README.md`, all of `src/`, including
  `src/tests/` with its unit tests and the step definitions in
  `src/tests/steps/`, `src/interfaces/` and the scratch directory `src/tmp/`,
  and the owner's other documentation, auxiliary source and owned unwired
  trees.
- The base excludes the owner's child modules under `subs/` and its owned
  nested projects. External, repository, package, generated and configured
  output regions stay excluded everywhere, even inside an included tree.
- `base.included` is normally `[]`. Each entry adds one whole tree with its
  `reason` and `instructions`, and names exactly one immediate child module
  directory or one owned nested-project root; the briefing lists them under
  "Default write scope". An included child module brings its whole subtree:
  the child's own contents and every module beneath it, its children,
  their children and so on, so a descendant never needs an entry of its own.
  A directory inside the owner, such as its `src/tests`, is already part of
  the base and is refused, as is any directory below an immediate child. A
  nested project inside an included child still needs its own entry.
- `extra` names single files outside the base, each with its purpose. A file
  in an excluded region or in a nested project the scope does not include is
  refused.
- `read` is recorded only. It limits nothing, widens nothing, and the
  engineer does not see it.
- Guarded files are writable only when `assignment.authorizations` names each
  one with its rationale; a local architect's submission also carries an
  `outline` revision that records why. An authorization stands for that one
  iteration. Guarded files are the package manifests and lockfiles,
  `.gitignore`, `tsconfig.json`, Vite, Vitest and Cucumber configuration and
  `ramify-audit.json`, at the project root, in workspace packages and at an
  included root; the configuration files the audit's checks name; and the
  contract artifacts in force. `module.ramify` is not guarded.
- Feature files, `ramify-agent.json` and the captured plan and principles
  documents are never writable: the harness alone writes them.

The harness validates the scope when you submit. A scope it cannot capture is
rejected with each error and its path; correct it and submit again.
