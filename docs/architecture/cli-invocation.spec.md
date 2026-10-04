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
ramify check [--root <dir>] [--format json [--no-snapshot]] [--batch]
ramify affected [<module-id>...] [--path <path>]... [--root <dir>] [--batch]
                [--format human|json]
ramify --help
ramify --version
```

## Selecting the project

The project is the tree beneath one root description: the root's `src/`, its
`subs/` children and their `src/` and `subs/` recursively, with each owner's
`src/tests/` and `src/interfaces/` areas. The root description declares itself
with the root marker, `root module <name>`, as the
[module description specification](../model/module-description.spec.md#a-description-file-establishes-a-directory-boundary)
defines; every other description in the tree is unmarked.

Selection by the root marker is implemented, and checking a project reports
every other marked description its discovery meets. Discovery prunes declared
nested trees before descent, so it never reads a marked description inside
one, and a directory's own `tsconfig.json` no longer stops it.

1. `--root <dir>` names the root explicitly. The directory must contain a
   `module.ramify` carrying the root marker; nothing above it is examined. A
   description there without the marker is an invalid selection, exit 1,
   whose message says to add the marker.
2. Without `--root`, select the nearest directory at or above the working
   directory whose `module.ramify` carries the root marker. Unmarked
   descriptions are modules of that root and never stop the climb, whatever
   their position relative to any `subs/` directory.
3. When no description at or above the working directory carries the marker,
   the command fails with exit 2 and a message naming the working directory.
   When an unmarked description lies at or above it, the message also names
   the nearest one and says to add `root` to its module line if it is the
   project root. It never searches subdirectories.

Paths are canonicalized before the climb, so a working directory reached
through a symlink finds the same root as its real path. Selection does not
depend on whether a marked description lies beneath another project's `subs/`
or inside one of its declared nested trees. Checking that enclosing project
reports a marked description outside its declared trees as a layout error.

The report states the root and how it was selected: given, or found from the
working directory. A resident check states the selection of its own invocation
even when it shares a context another invocation opened, while the report's
`inputId` identifies the project's captured inputs and excludes that invocation's
discovery climb, so it can differ from a batch run that found the root by climbing
from a subdirectory. Working from inside a nested module, an excluded-looking
directory such as the toolkit's `site/`, or an independent project nested in
the tree such as the toolkit's example, all resolve by the same rule, and the
example resolves to its own root because its description carries the marker.
For example, a command inside `project/subs/group/child/src/` selects `project`
when `project`'s description carries the marker and `child`'s does not. A
project in an owned-ignored tree `project/subs/child/fixtures/demo/`, whose
description carries the marker, is selected from inside `demo`, although it
lies beneath `project`'s `subs/`.

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

**Pending Git advice.** Discovery prunes declared nested trees and module
scratch directories, is no longer stopped by a nested `tsconfig.json`, and
analyzes auxiliary source; the first two warnings below are reported, and the
Git warning remains pending.

Ownership follows the
[module description specification](../model/module-description.spec.md):
owned compiler source outside every `src/`, including sibling `tests/` or
`interfaces/` directories and loose source beneath `subs/`, is its nearest
module's auxiliary source. It is analyzed with that owner's ordinary
classification whether or not the configuration selects it, and it produces no
warning. A `.js`, `.jsx`, `.mjs` or `.cjs` file there is compiler source only
when the configuration admits JavaScript; any other owned file outside `src/`
is inert and silent. Only declared nested trees and always-excluded paths are
left out; a nested `tsconfig.json` and repository ignore rules exclude nothing.
Three nonblocking warnings remain: compiler-selected source inside an
owned-ignored tree, compiler-selected source inside a module's scratch
directory, and, when the root lies in a Git repository and `git` is available,
each repository-ignored directory the check would still enter. The CLI derives
that last warning from Git's output; it is never an analysis input and never
changes the result. Root selection follows the root marker, as
[selecting the project](#selecting-the-project) states.

A selected file inside an owned-ignored tree or a module's scratch directory
is neither inventoried nor read, the compiler does not receive it as a root
file, and it produces one `compiler-selected-owned-ignored` or
`compiler-selected-scratch` warning per tree or scratch directory, located at
that directory. A selected file inside an external tree produces no warning.
Each warning carries a code, a path and a message and, where it lists files,
at most 20 of them in byte order with their total count.

A stray `module.ramify` found outside the permitted module locations,
including beside auxiliary source, is an individual layout error even if its
contents are valid. It fails the check with exit 1 and needs no strict
configuration; source beneath it has no owner. Invalid descriptions within the
checked tree, including descriptions inside `src/` or at reserved container
roots, and invalid exposure paths remain errors.

`node_modules` and the configuration's output directories are always excluded.
A nested project belongs in a declared nested tree: undeclared, its marked root
description or package manifest is a layout error. Projects that want
different treatment, such as silencing a warning, will do so in a Ramify
project configuration file. That file's format is unspecified and is not part
of Plan 1.

In the future, we might add a **strict** project configuration that makes
project warnings fail the check. The option's syntax and exact scope are
undecided; Plan 1 has no strict configuration or CLI flag.

An import whose target is auxiliary source is an application import decided by
the ordinary rules: same-owner access is allowed, and another owner's import of
an auxiliary original is denied, since no exposure can select one. An owned
import whose target, without package resolution, lies inside a declared nested
tree is the definite finding `project-boundary-import`, category `import`, for
every import form, including type-only and symbol-free imports and re-exports;
it is located at the import and fails the check with exit 1. One inside an
always-excluded path such as compiler output is unverifiable, with the
nonblocking `excluded-target` analysis limit on that import; one outside the
root is outside scope, with the nonblocking `outside-module-target` limit.
None is an allowed import or an external package.

## Output and exit

The human report prints the root and how it was selected, the compiler
configuration in use, a `Mode:` line, failures first, then warnings, then
analysis limits, then the completed scope. `--format json` writes the unchanged
`ramify.analysis/2` report to stdout, without the human mode line or an added mode
member. Invocation failures use a `ramify.cli/1` diagnostic document. Logging goes
to stderr; nothing else is written to stdout in that mode. Locations are relative
to the root regardless of the working directory. Ordering is deterministic.

When project boundaries are implemented, every machine document whose payload
shape they change moves to its next version, including `ramify.analysis/2`,
`ramify.check/2`, `ramify.affected-cli/2` and the IPC protocol
`ramify.ipc/2`. No reader for the earlier version is kept: a version number
changes so that an outdated reader fails on it rather than misreading the
document. Documents whose shape does not change keep their version.

`--no-snapshot` leaves the snapshot, the record of every evaluated import, out of
that report. The report keeps `ramify.analysis/2` and sets `snapshot` to null; its
summary, outcome, findings, warnings, analysis limits and exit code are those of
the same check with the snapshot. A caller that reads only the verdict and its
findings uses it: on the toolkit itself the snapshot is almost all of a
25 MB report. It applies to complete checks in both modes; a batch session drops
the snapshot before its result leaves the session, and a resident check drops it
when printing. The flag requires `--format json` and cannot accompany `--changed`,
whose `ramify.check/2` document has no snapshot; either misuse is an invalid
invocation, exit 2.

| Exit | Meaning |
| --- | --- |
| 0 | Checking completed. No definite violations, no invalid input. Warnings and analysis limits are allowed. |
| 1 | Definite import violations, an exposure without an available signature companion, an invalid description, registry or layout, or a known missing export. |
| 2 | The check could not complete: invalid invocation, no project, no configuration, an unavailable capability, an acquisition or execution failure, or a resource limit. Findings obtained before the failure are retained. |
| 130 | Interrupted. No result is claimed. |

Exit 0 is never chosen from an empty finding list without confirming that
every required stage completed.

An exposure statement that makes a symbol visible without a companion its
signature names is the finding `exposed-without-companion`, category
`exposure`. It is located at the statement, names the naming position in the
signature as its related location and in its message, and states the exposure or
tag to add. The description stays valid and every import is still decided.
The analysis limits `signature-inferred` and `signature-unresolved` note, once
per exposed original, a signature position left to inference and references
that name no single project original. They never change the exit code. The same
finding and notes appear in `--changed`, complete and batch checks.

## Resident and batch execution

`ramify check` connects to a compatible resident daemon, starts it when needed,
and requests a synchronized check after opening the project context. `--batch`
selects a fresh session and disposes it on exit: in the CLI process for the Node
entry, or in a Node child of the compiled client. Both modes preserve the
analysis report and exit-code contract above; human output names the selected
mode. Help and version load neither the engine nor a daemon host. The installed
`ramify` command runs the host's compiled client when present, otherwise the
Node entry, with the same contract; see the
[native client](optimization.md#native-client).

`ramify watch` streams versioned revision and status events, fetches each
report by its exact revision id, and releases its subscription on SIGINT.
`ramify daemon status` and `ramify daemon stop` never start a daemon. The
[resident contracts](../plans/done/iteration-2-resident-verification/contracts.md)
define those documents, bounded recovery and visible batch fallback after
exhausted unexpected-failure recovery. Explicit stop never causes fallback.

`ramify affected` selects the project as `check` does and takes at least one
seed: module IDs as operands and repeated `--path` paths relative to the root.
It answers which modules changed, which depend on them and which test modules
follow, from one revision's retained dependency facts. Without `--batch` it
opens the project context and requests synchronized freshness from the
resident daemon, and never falls back to batch. `--batch` answers from a fresh
session over the same root, with the same capabilities as `check --batch`, in
the same process seam, and disposes it. `--format json` prints one
`ramify.affected-cli/2` document with the root, the mode, the revision's
sequence (null in batch) and input identity, and the selection; failures use
`ramify.cli/1`. It exits 0 for any answer, including one widened to all
modules, 1 for an invalid project, an unknown module ID or an invalid seed,
2 when unavailable, pending, cold, superseded or past a deadline, and 130 when
interrupted. `--changed`, `--since` and `--deadline` do not apply.

When project boundaries are implemented, `ramify affected` answers every path
seed by containment under the current declarations, without an inventory entry
or a filesystem read, so absent, new and deleted paths and both sides of a
rename resolve. Each path seed states whether the path is owned, excluded or
outside the project, with its exclusion when one applies. An owned path,
including one in an owned-ignored tree or a scratch directory, selects its
owner and that owner's transitive importers. A path in an external tree or
another always-excluded path selects nothing. Only a path outside the project,
written with a leading `../`, widens the answer to all modules; any other
malformed seed is an invalid seed. The answer carries the revision's whole
ownership topology. These answers use `ramify.affected-cli/2`, carrying a
`ramify.affected/2` selection.

### Hook and complete checks

`check` has three forms with distinct roles. They apply the same rules to the
same project and differ only in how they reach the result. Whenever the hook
check answers, its findings and exit code are exactly those the complete check
would report on the project as it stands after the change. It is quicker only
because it analyzes the change against the daemon's retained baseline instead
of analyzing the whole project again. It never judges the named paths alone,
and a named path the complete check does not analyze cannot change its result.
When it cannot establish that result within its bounds, it answers not checked
with exit 2; it never substitutes an approximate result.

| Form | Role | Waits for | Answers not checked |
| --- | --- | --- | --- |
| `ramify check --changed <path>...` | Bounded hook check | A daemon revision covering the named files' identities, up to `--deadline` (default 2000 ms) | Yes, exit 2, when it cannot answer in time or at all: a cold daemon, an expired deadline, unobserved or superseded content, or a named configuration file. It never falls back to batch. |
| `ramify check` | Complete check | A synchronized revision covering every current input, including any pending configuration rebuild, with no deadline | No. It reports the whole project; exit 2 means it could not complete. |
| `ramify check --batch` | Independent complete check | A fresh session that trusts no retained daemon state | No. It reports the whole project; exit 2 means it could not complete. |

A named configuration file, `tsconfig.json`, a file it extends, or a package
manifest or lockfile, is answered at once as not checked with the reason
`configuration-changed`, unless a published revision already covers it with
nothing else pending. `--deadline` does not delay that reply. The hook verifies a
module's exports and their use, which a configuration edit is not; the daemon
verifies the change behind the reply, so the next hook is exact.

Agents pair the forms. A post-write hook runs `--changed` and treats exit 2 as
not verified, never as a pass. An end-of-task hook, a pre-commit hook or CI runs
`ramify check`, or `--batch` where no daemon state should be trusted. That
complete check gives a configuration edit its verdict.

The hook check hashes the named paths relative to the selected root. It exits 0
when the covering revision has no findings, 1 for findings or an invalid
revision, and 2 when it was not checked, naming the reason. One known limit:
where the root `tsconfig.json` carries `references` beside its own files, a
created or deleted file makes the daemon find the project again rather than
reuse what it knows, so those hooks are slower than the same hooks elsewhere.

When project boundaries are implemented, the hook check gives each named path
one disposition. `checked` means the covering revision completed the relevant
analysis with evidence of the path's current content or its deletion; deleting
previously analyzed source is checked once its removal is analyzed.
`not-analyzed` means the complete check does not analyze the path either: it
lies in an owned-ignored, external or scratch directory or another
always-excluded path, or it is an owned file that is neither source nor an
analysis input. Descriptions, configuration, READMEs and referenced resources
that the analysis reads are analysis inputs, not inert files. A not-analyzed
path is not hashed or captured, needs no content coverage and never changes
the exit code: a request naming only such paths exits 0 when the covering
revision has no findings and 1 when it has findings or is invalid, exactly as
`ramify check` would. `not-checked` means the hook could not establish the
result for that path, for example through stale or unobserved content, an
expired deadline, a named configuration file or unavailable work; it gives
exit 2 and retains findings verified before the failure. The disposition, not
the exit code, states that a path was not analyzed, and no such path is shown
as passing source checks. The `ramify.check/2` document reports these
dispositions in place of each changed path's coverage flag, with the analyzed
content or deletion identity only for checked paths.

## Decisions recorded here

- No per-invocation exclusions. Scope customization belongs to a future
  project configuration file.
- `--no-snapshot` changes only the JSON report's size, never its verdict. A flag
  that would have no effect in its combination is rejected rather than ignored,
  as `--since` and `--deadline` are without `--changed`.
- No type-checking, and no exit code influence from compiler diagnostics
  beyond the analysis limits they cause.
- Root discovery from a subdirectory is part of Plan 1; `--root` is the
  override, not the primary form.
- A project root declares itself with the root marker, and the climb selects
  the nearest description carrying it (decided 2026-10-03). Unmarked
  descriptions never stop the climb.
- Single compiler configuration per project in Plan 1; references later. No
  configuration override: the root's `tsconfig.json` is the whole-project
  configuration.
- Supported platforms are Linux and macOS, as the plan records.
