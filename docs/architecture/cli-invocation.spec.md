# CLI invocation

**Date:** 2026-09-08. **Status:** Decided invocation contract for `ramify check`.
The delivery plans reference this document; they do not restate it. Command
names other than `check` are listed in [processes and clients](processes-and-clients.md)
and get their invocation contracts when their plans are written.

## The one rule

`ramify check` checks one whole ramified project, from its root, every time.
There is no partial check, no per-directory scope and no per-invocation
exclusion. Invoked with no arguments inside a project, it works. Every
parameter is optional and only overrides something the command would otherwise
find by itself.

```sh
ramify check [--root <dir>] [--format json] [--batch]
ramify --help
ramify --version
```

## Selecting the project

The project is the tree beneath one root description: the root's `src/`, its
`subs/` children and their `src/` and `subs/` recursively, with each owner's
`src/tests/` and `src/interfaces/` areas.

1. `--root <dir>` names the root explicitly. The directory must contain a
   root `module.ramify`; nothing above it is examined.
2. Without `--root`, take the nearest directory at or above the working
   directory that contains `module.ramify` as the candidate. Find its nearest
   proper ancestor containing another description. If the candidate lies
   strictly beneath that ancestor's `subs/`, advance to that ancestor and
   repeat. Ordinary grouping directories between `subs/` and a child do not
   stop the climb. Otherwise the candidate is an independent project root:
   stop, without skipping that nearer declared boundary to join a higher tree.
   If the climb would stop at a candidate directly under `subs/` and the
   parent of that `subs/` directory has no description, report that missing parent
   description instead of treating the child as an independent root.
3. Outside any ramified project, the command fails with exit 2 and a message
   naming the working directory. It never searches subdirectories.

Paths are canonicalized before the climb, so a working directory reached
through a symlink finds the same root as its real path. A consequence of the
discovery rule is that an implicitly selected root may not itself sit directly
under a directory named `subs`.

The report states the root and how it was selected: given, or found from the
working directory. Working from inside a nested module, an excluded-looking
directory such as the toolkit's `site/`, or an independent project nested in
the tree such as the toolkit's example, all resolve by the same rule, and the
example resolves to its own root because `examples/` is not `subs/`.
For example, a command inside `project/subs/group/child/src/` selects `project`
when `project` and `child` are the declared modules. An independent project
inside `project/subs/child/examples/demo/` selects `demo`: its nearest containing
module is `child`, and `demo` is outside that module's `subs/`.

## Compiler configuration

The compiler configuration is found the way TypeScript finds it: `tsconfig.json`
in the root directory, then in each ancestor in turn. There is no override.
No configuration found is an unavailable outcome with exit 2; Ramify needs the
project's resolution settings and invents none.

Because every owned file is resolved under this one configuration, the root
`tsconfig.json` is the project's whole-project configuration, the same file an
editor reads. Build-specific settings, such as a portable subset compiled
without Node ambient types, belong in separate build configurations that
Ramify never reads.

The configuration supplies compiler options: module resolution, `paths`,
`baseUrl`, JSX, `types` and declaration inputs. It does not decide which
files are checked: every owned source file is a root file of the program,
whether or not the configuration's `files`, `include` or `exclude` would
have selected it.

This owned inventory is the application source set supplied to model
validation. Compiler exclusion alone does not invalidate an exposure of an
owned file. The outside-module file inventory described below is separate.

Plan 1 handles one configuration as one program. A solution-style
configuration that has `references` and no files of its own is an unavailable
outcome with a message naming the referenced configurations; support for
references is scheduled when a real target needs it.

Ramify does not type-check the project. It uses the compiler to resolve
imports, enumerate exports, identify originals and resources, and classify
bindings. A compiler problem is reported only when it prevented one of those
operations, as an analysis limit on the affected construct. Ordinary type
errors are `tsc`'s concern and never appear in the result or affect the exit
code.

## Files outside modules

The configuration also defines what the project's own files are, in the
ordinary TypeScript sense: the files its `files`, `include` and `exclude`
select. Any of those files that lies outside every module's `src/` is a
project file outside modules. It is not checked, and it produces a warning.
This includes sibling `tests/` or `interfaces/` directories and loose files
beneath `subs/`. These files receive no module source-area classification, and
their presence alone does not make the layout invalid or fail the check.

Warnings are aggregated per top-level entry relative to the root: one warning
per stray file directly under the root, and one per top-level directory that
contains stray files, with the count. A stray `module.ramify` found outside
the permitted module locations, including beside these files, is an individual
layout error even if its contents are valid. It fails the check with exit 1;
it is not included in the ordinary file-warning count and needs no strict
configuration. Invalid descriptions within the checked tree, including markers
inside `src/` or at reserved container roots, and invalid exposure paths remain
errors.

Outside module source areas, files outside the configuration's selection are
silent. Every owned `src/` is still checked regardless of that selection.
`node_modules`, build outputs, a nested independent project with its own
configuration and tooling compiled under another configuration are silent by the project's own
conventions, not by a Ramify rule. Projects that want different treatment,
such as declaring a tooling directory as intentionally unowned or silencing a
warning, will do so in a Ramify project configuration file. That file's
format is unspecified and is not part of Plan 1.

In the future, we might add a **strict** project configuration that makes
outside-module-source warnings fail the check. The option's syntax and exact
scope are undecided; Plan 1 has no strict configuration or CLI flag.

An owned import whose target is a project file outside modules is reported as
outside scope: an analysis limit on that import, never an allowed import and
never an external package.

## Output and exit

The human report prints the root and how it was selected, the compiler
configuration in use, a `Mode: batch` line, failures first, then warnings, then
analysis limits, then the completed scope. `--format json` writes the unchanged
`ramify.analysis/1` report to stdout, without the human mode line or an added mode
member. Invocation failures use a `ramify.cli/1` diagnostic document. Logging goes
to stderr; nothing else is written to stdout in that mode. Locations are relative
to the root regardless of the working directory. Ordering is deterministic.

| Exit | Meaning |
| --- | --- |
| 0 | Checking completed. No definite violations, no invalid input. Warnings and analysis limits are allowed. |
| 1 | Definite import violations, an invalid description, registry or layout, or a known missing export. |
| 2 | The check could not complete: invalid invocation, no project, no configuration, an unavailable capability, an acquisition or execution failure, or a resource limit. Findings obtained before the failure are retained. |
| 130 | Interrupted. No result is claimed. |

Exit 0 is never chosen from an empty finding list without confirming that
every required stage completed.

## Before the daemon exists

Until Plan 2 delivers the resident daemon, `ramify check` runs a fresh
analysis session in its own process and disposes it on exit. `--batch` is
accepted and changes nothing. Once the daemon exists, `ramify check` uses it
and `--batch` forces the fresh in-process session instead. Neither form starts
a server.

`--help` and `--version` complete without loading the compiler or any later
adapter.

## Decisions recorded here

- No per-invocation exclusions. Scope customization belongs to a future
  project configuration file.
- No type-checking, and no exit code influence from compiler diagnostics
  beyond the analysis limits they cause.
- Root discovery from a subdirectory is part of Plan 1; `--root` is the
  override, not the primary form.
- Single compiler configuration per project in Plan 1; references later. No
  configuration override: the root's `tsconfig.json` is the whole-project
  configuration.
- Supported platforms are Linux and macOS, as the plan records.
