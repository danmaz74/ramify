# Affected modules

## Request

Given one or more changed module IDs, Ramify answers with every module that
depends on them, directly or transitively, together with the changed modules
themselves. An agent's post-write hook or a CI job uses the answer to choose
which modules' tests to run.

## Requirements

- Answer from the dependency facts the resident daemon already keeps for fast
  incremental checks, at a stated revision of the project. A query does not
  analyze the project again.
- One query, offered by the retained-session API, the daemon client, the
  `ramify` command line and MCP.
- State which dependencies count: ordinary imports, type-only imports, test
  imports and declaration dependencies between `module.ramify` files.
- When the facts are incomplete, the answer says so, with the coverage it has,
  rather than claiming a complete set.
- No dependency graph is kept between queries, and ordinary checks and hooks
  do no added work for this query.
- No importability rule changes.

## Out of scope

Finding changed modules from a git diff, historical or deleted modules,
running the selected tests, and any visualization.
