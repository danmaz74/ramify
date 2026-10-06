# Protected documents

**Status:** P1 and P2 are authorized and not yet applied. Iteration 1 applies
them. No `.principles.md` file and no model specification
(`docs/model/*.spec.md`) changes.

**Authorization.** Coordinator ramify-65 authorized P1 and P2 on 2026-10-06 as
spec corrections. They express accepted decisions D3, D5 and D7 of the
ramify-audit decisions document. The same message decided that `.md` paths
select nothing wherever they lie, so P1's hunk 2 below includes that rule.
The authorization applies to the text in this file at the baselines below,
which the planner verified: each "Old" block occurs exactly once in its
document.

**Revision, 2026-10-06.** After iteration 0, the coordinator decided how a
configuration file's governed set is computed: by directory, instead of every
module. P1's captured-input bullet below states that decision. The coordinator
requested the wording change, and no other P1 or P2 text changed.

| Document | Baseline sha256 at `b4858aec` | Last commit touching it |
| --- | --- | --- |
| `docs/architecture/cli-invocation.spec.md` | `7386295542372967c25040735d89e8e9e5230323d4320e57490bf2c031f32e6a` | `6598a29d` |
| `docs/model/glossary.md` | `fd3a1bad54fc8651ae6c33f7c19a75c8268ffc50b89f2342c574cc2ccc7747e0` | `6598a29d` |

Iteration 1 applies an authorized patch as its first commit, `docs(spec):`,
and only if the baseline hash still matches. Every results file records both
hashes before and after its iteration. A hash that changes with no authorized
patch is a gate failure.

These documents also name `/2` but are not protected; iteration 1 updates them
in the same change:

- `docs/architecture/daemon.md`, the affected row;
- `docs/development/testing.md`, the `ramify affected` row;
- `README.md`, the `ramify affected` paragraph.

## P1: the affected rule in `cli-invocation.spec.md` (authorized)

### Hunk 1: the JSON document version

Old:

```text
`--format json` prints one
`ramify.affected-cli/2` document with the root, the mode, the revision's
```

New:

```text
`--format json` prints one
`ramify.affected-cli/3` document with the root, the mode, the revision's
```

### Hunk 2: the path-seed paragraph

Old:

```text
`ramify affected` answers every path
seed by containment under the current declarations, without an inventory entry
or a filesystem read, so absent, new and deleted paths and both sides of a
rename resolve. Each path seed states whether the path is owned, excluded or
outside the project, with its exclusion when one applies. An owned path,
including one in an owned-ignored tree or a scratch directory, selects its
owner and that owner's transitive importers. A path in an external tree or
another always-excluded path selects nothing. Only a path outside the project,
written with a leading `../`, widens the answer to all modules; any other
malformed seed is an invalid seed. Human output prints one line per path
seed: owned, with its module, basis and any owned-ignored or scratch
exclusion; excluded, with its exclusion; or outside the project. The
selection's scope carries the
revision's whole ownership topology: its modules and their rooted exclusions,
while repository, package and generated segments are excluded wherever they
occur. These answers use `ramify.affected-cli/2`, carrying a
`ramify.affected/2` selection.
```

New:

```text
`ramify affected` answers every path
seed by containment under the current declarations, without an inventory entry
or a filesystem read of the seed, so absent, new and deleted paths and both
sides of a rename resolve. Each path seed states whether the path is owned,
excluded or outside the project, with its exclusion when one applies. An owned
seed also names its owner, its kind and the modules it selects; the owner
attributes the path and does not by itself select it. The first kind that
applies decides:

- a path in an owned-ignored tree or a scratch directory is `ignored` and
  selects nothing;
- a `module.ramify` is a `description` and selects its owner;
- a module's `README.md` is a `readme` and selects nothing;
- any other `.md` path, wherever it lies and including beneath `src/`, is
  `inert` and selects nothing;
- any other path at or beneath its owner's `src/` is `source-area` and
  selects its owner;
- auxiliary source, present or absent, is `auxiliary-source` and selects its
  owner;
- a captured input of the revision, meaning content or absence it read and
  fingerprinted rather than an existence probe, is a `captured-input` and
  selects every module it governs. A package manifest, present or absent,
  and the compiler configuration govern the module that owns their directory
  and every module whose directory lies at or beneath it. A configuration the
  compiler configuration extends governs what the configurations extending it
  govern. Any other captured input governs the owners of the analyzed files
  that read or probed it, or every module when none did;
- any other owned path is `inert` and selects nothing.

The changed modules are the module seeds and every module a path seed
selects; the answer adds their transitive importers. A path in an external
tree or another always-excluded path selects nothing. Only a path outside the
project, written with a leading `../`, widens the answer to all modules; any
other malformed seed is an invalid seed. Human output prints one line per path
seed: owned, with its module, basis, any owned-ignored or scratch exclusion,
its kind and the modules it selects; excluded, with its exclusion; or outside
the project. The selection's scope carries the
revision's whole ownership topology: its modules and their rooted exclusions,
while repository, package and generated segments are excluded wherever they
occur. These answers use `ramify.affected-cli/3`, carrying a
`ramify.affected/3` selection; the IPC protocol keeps `ramify.ipc/2`.
```

### Hunk 3: the schema-version history

Insert this after the paragraph that begins "Project boundaries moved every
machine document":

```text
Affected-rule selection changed what an owned path seed selects and added each
seed's kind and selected modules, so the affected answer moved to
`ramify.affected-cli/3` with `ramify.affected/3`. The IPC protocol, which
carries the selection without decoding it, kept `ramify.ipc/2`.
```

## P2: the glossary status line (authorized)

`docs/model/glossary.md` is a model document, although not suffix-protected,
so it goes through the same authorization. The current status line says
containment "decides affected selection". After P1 that statement is
inaccurate, because selection depends on the path's kind.

Old:

```text
are never exposed, imports into declared nested trees are enforced, and
containment decides affected selection and the hook check's path
dispositions.
```

New:

```text
are never exposed, imports into declared nested trees are enforced,
containment attributes each affected path seed to its owner and decides the
hook check's path dispositions, and a seed's kind decides which modules it
selects.
```

No glossary definition changes. *Inert file*, *captured input*, *auxiliary
source*, *owned-ignored tree* and *scratch directory* already mean what the
rule needs.

## Not proposed

- **Principles.** No principles change. Affected selection is tooling
  behavior that the CLI architecture specification owns.
- **Model specifications.** The module-description and TypeScript
  source-interpretation specifications do not mention affected selection.
- **`materialized-api-view.spec.md`.** Its "selects its owner" sentence is
  about `materialize --from` target resolution, not affected selection.
