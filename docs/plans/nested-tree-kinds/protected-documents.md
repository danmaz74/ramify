# Protected documents

**Status:** proposed. No patch is approved. Dan approves each patch below by
its ID; the approval covers that exact text at the baseline hash given.
Patches that depend on a [proposal](main-plan.md#proposals-to-confirm) cite
it and change if the proposal changes.

Iteration 1 applies the Ramify patches (M, G, C, T, A, S) as its first commit,
`docs(spec): three kinds of nested tree`. Iteration 3 applies the
ramify-audit patches (R). Iteration 4 applies the ramify-agent patches (H).
Each applies a patch only if the file's sha256 still equals the baseline
below; otherwise it stops and reports.

## Baselines

| Document | sha256 | Last commit |
| --- | --- | --- |
| `docs/model/module-description.spec.md` | `19e292a9bc44bff47d60398b7cc1a507523e1aa73e11cc4b2c56e0988c10b07c` | `6598a29d` |
| `docs/model/glossary.md` | `247587c20b8864b2d0a07f7688fe3e3eeb8b61aadb42603387fa72be0c192cfc` | `e3ac50d6` |
| `docs/model/cross-module-importability.spec.md` | `4aba3df0be6ff7356e7107f8d7c2786ff45ab35c9ede0b319454547b5029d789` | `7f6ebf7c` |
| `docs/model/typescript-source-interpretation.spec.md` | `c1fd4d6551d130bbcd723c8b1a56075e858c06e2a6eaacb50fb147ea0e3a1a95` | `6b372aa9` |
| `docs/agents/module-architect.principles.md` | `3858898770ab5f2a54fd375ba5aa6a4c3f72a5ac00f04f974405ac95aa580d25` | `3fba41bd` |
| `docs/architecture/cli-invocation.spec.md` | `dac3ae58473c74d5f03f82d695e715a41cab98466df48cd4477efd7d8bdabd9f` | `e3ac50d6` |
| `docs/architecture/architect-view.spec.md` | `f8989ad661566eaf668ad6c213994e345988a4f31d7d733e175302225a826794` | `eb57fbf8` |
| `docs/architecture/modularity-report.spec.md` | `00fc9dba0b42145267e9e83a9b454d2d332deecc845adeadf14cfcf60472c1b4` | `307e86fa` |
| ramify-audit `docs/partial-audit.principles.md` | `7537032783b4d1cd1b8a803075fa71f518228f7c78e9d6c352a2387c1a9b4ff5` | `9cb5c11` |
| ramify-audit `docs/partial-audit.spec.md` | `07b36c55c72d0bed19a1d78be56e1cc2196a8584dfa575c37f098f76471ad13a` | `9cb5c11` |
| ramify-agent `docs/harness.spec.md` at `HEAD` | `78b1de2aef9c013fd40048cf8d664e819d00887259036bb590aaa46529e8e6ed` | `3fba41bd` |
| ramify-agent `docs/glossary.md` | `6e8809ae8a9af42a78a61f8265f85979807e2c4871eae83b818b386735c3de20` | `3fba41bd` |

`/ramify`'s working tree holds Dan's uncommitted edits to
`ramify-agent/docs/harness.spec.md` (its scratch-lifetime paragraph, from line
72). Patch H1 touches lines 24 to 37 and 62 to 64 only. Iteration 4 stages
only H1's hunks and leaves Dan's edits unstaged.

## M: module-description specification

### M1: the nested-trees section (Q5, Q9)

Replace the whole section "Declared Nested Trees Bound Interpretation", from
its heading to the line before the next heading, with:

````markdown
### Declared Nested Trees Bound Interpretation

Discovery implements the declaration, validation and pruning rules of this
section, and acquisition reports the warning about compiler-selected source in
an owned nested tree.

A module declares each nested tree in its own description, using a directory
relative to the module and one of three kinds:

| Kind | Owned by the declaring module | Analyzed | Its directory is a separate project's root |
| --- | --- | --- | --- |
| `owned-unwired` | yes | never | no |
| `owned-nested-project` | yes | never | yes |
| `external` | no | never | not stated |

`owned-unwired` and `owned-nested-project` are the owned kinds. The directory must
lie strictly beneath the declaring module and outside every child module.
External trees must lie outside the declaring module's `src/`; owned trees
may lie within owned source, including `src/tests/`.

```ramify
ramify 1
root module shop

owned-unwired "docs"
owned-nested-project "examples/demo"
external "tool-cache"
```

Resolve the decoded directory string relative to the declaring module. It
must be relative, use `/` separators, and contain no backslash or empty path
segment, so a leading or terminal `/` is invalid. Normalize `.` and `..`
segments before containment checks; the result must remain strictly beneath
the declaring module's directory. Absolute and drive-qualified paths, URLs
and globs are unsupported.

Validation does not traverse symbolic links. A declared directory, or any
directory between it and its declaring module, that is a symbolic link makes
the declaration invalid. An owned tree's directory must exist as a real
directory. An `external` directory may be absent; when present it must be a
real directory.

Any two nested-tree declarations whose resolved directories are equal, or one
of which lies beneath the other, are invalid, whatever their kinds or
declaring modules. At most one declaration therefore contains any path, and
no precedence rule exists between declarations. A declaration whose directory
is an always-excluded path or lies beneath one is invalid; a declared tree may
contain always-excluded paths.

Do not descend into any kind. Owned contents retain their owner but are never
inventoried, compiled by Ramify or checked, and a change beneath them never
affects a result. The [daemon architecture](../architecture/daemon.md)
states from when a resident watcher registers nothing beneath them. External
contents have no owner in this evaluation. Plain data needs no declaration.

An `owned-unwired` tree holds content, code included, that is deliberately
not wired into the project: documentation, spikes, samples and other material
the project keeps but never builds, imports or analyzes. An `owned-nested-project`
tree holds a separate project, such as an example or a fixture project: data
to the enclosing evaluation, and a project in its own right when selected as
its own root. A project within a declared tree of either `owned-nested-project` or
`external` kind carries the root marker in its own root description, which
the enclosing evaluation does not interpret.

Warn about compiler-selected source within an owned tree. A declaration does
not prevent another runner or tool from executing the tree's contents; that
limitation is a convention, not a Ramify guarantee. Imports into declared
nested trees follow the source-interpretation boundary rule.

The declarations extend version 1 beside exposure statements without changing
the format version. Their syntax is the `nested-tree-line` of the
[version 1 grammar](#specified-version-1-exposure-grammar).
````

### M2: ownership paragraph

Old: `always-excluded paths other than the module's scratch directory. Owned-ignored`
`trees remain owned.`

New: `always-excluded paths other than the module's scratch directory. Owned`
`nested trees remain owned.`

### M3: discovery paragraph (Q6)

Old:

```text
An excluded description is not interpreted by this evaluation; one carrying
the root marker inside a declared tree of either kind is the root of a
separate project.
```

New:

```text
An excluded description is not interpreted by this evaluation; one carrying
the root marker inside a declared tree of any kind is the root of a separate
project. A nested project's root belongs within an `owned-nested-project` or
`external` tree.
```

### M4: auxiliary source

Old: `resource. Outside `src/` and the owned-ignored trees,`
New: `resource. Outside `src/` and the owned nested trees,`

### M5: statement list

Old: `and zero or more `expose-src`, `expose-test`, `expose-sub`, `owned-ignored`,`
`or `external` statements.`

New: `and zero or more `expose-src`, `expose-test`, `expose-sub`, `owned-unwired`,`
``owned-nested-project` or `external` statements.`

### M6: grammar

Old: `nested-tree-line = ( "owned-ignored" | "external" ), hws, STRING, LF ;`
New: `nested-tree-line = ( "owned-unwired" | "owned-nested-project" | "external" ), hws, STRING, LF ;`

Old: `tag            = "testing" | "browser" | "ui" | "owned-ignored" | "external"`
New: `tag            = "testing" | "browser" | "ui" | "owned-unwired" | "owned-nested-project" | "external"`

### M7: reserved keywords and tag names

In the reserved-keyword bullet, replace `` `owned-ignored`, `external`, `root`, ``
with `` `owned-unwired`, `owned-nested-project`, `external`, `root`, ``.

In the tag-name paragraph, replace "and `owned-ignored`, `external` and `root`
despite their keyword status" with "and `owned-unwired`, `owned-nested-project`,
`external` and `root` despite their keyword status", and "The six explicit
alternatives in `tag`" with "The seven explicit alternatives in `tag`".

### M8: statement form

Old: `An `owned-ignored` or `external` statement consists of its keyword and one`
New: `An `owned-unwired`, `owned-nested-project` or `external` statement consists of its keyword and one`

### M9: error table, nested-tree row

Replace "a missing owned-ignored directory or a declared path that exists but
is not a real directory;" with "a missing owned directory or a declared path
that exists but is not a real directory;".

### M10: implementation warnings paragraph

Replace "Acquisition warns about compiler-selected source in an owned-ignored
tree or a module scratch directory" with "Acquisition warns about
compiler-selected source in an owned nested tree or a module scratch
directory".

## G: model glossary

`site/src/pages/glossary.md` receives the same entries in iteration 1; it is
not protected, but it must conform.

### G1: owned contents

Old: `other than its scratch directory; owned-ignored trees remain included.`
New: `other than its scratch directory; owned nested trees remain included.`

### G2: nested tree

Old:

```text
A **nested tree** is a directory declared in its enclosing module's
description as an owned-ignored tree or an external tree.
```

New:

```text
A **nested tree** is a directory declared in its enclosing module's
description as an owned-unwired tree, an owned nested project or an external
tree.
```

### G3: owned-unwired tree (replaces "Owned-ignored tree")

```markdown
## Owned-unwired tree

An **owned-unwired tree** is an owned nested tree whose contents, code
included, are deliberately not wired into the project: Ramify never
interprets them, and analyzed source may not import them.
```

### G4: owned nested project (new, after G3)

```markdown
## Owned nested project

An **owned nested project** is an owned nested tree, declared
`owned-nested-project`, whose directory is the root of a separate project;
Ramify never interprets its contents.
```

### G5: auxiliary source and inert file

In both entries, replace "outside its owned-ignored trees" with "outside its
owned nested trees".

## C: cross-module importability specification

### C1

Old: `module scratch directories are outside ownership. Owned-ignored trees retain`
New: `module scratch directories are outside ownership. Owned nested trees retain`

### C2

Old: `an installed link resolves to a real path within the project. A project within`
`an ignored tree uses the enclosing project's package by convention; Ramify`

New: `an installed link resolves to a real path within the project. An owned nested`
`project uses the enclosing project's package by convention; Ramify`

## T: TypeScript source interpretation specification

### T1

Old: `An import from analyzed source that resolves into an `owned-ignored` or`
`` `external` tree without package resolution is a definite finding. ``

New: `An import from analyzed source that resolves into an `owned-unwired`,`
`` `owned-nested-project` or `external` tree without package resolution is a definite finding. ``

Also replace "shared ownership with an ignored tree does not create an
exemption" with "shared ownership with an owned nested tree does not create
an exemption", and "A project within an ignored tree uses the enclosing
package" with "An owned nested project uses the enclosing package".

## A: module architect principles

### A1 (a principles edit)

Old: `Architectural evidence identifies each module's owned-ignored trees without`
New: `Architectural evidence identifies each module's owned nested trees without`

## S: architecture specifications

### S1: `cli-invocation.spec.md`

- The nested-project example: "A project in an owned-ignored tree
  `project/subs/child/fixtures/demo/`" becomes "An owned nested
  project `project/subs/child/fixtures/demo/`".
- The warnings paragraph: "A selected file inside an owned-ignored tree" and
  "one `compiler-selected-owned-ignored` or `compiler-selected-scratch`
  warning per tree or scratch directory" become "A selected file inside an
  owned nested tree" and "one `compiler-selected-owned-unwired`,
  `compiler-selected-owned-nested-project` or `compiler-selected-scratch` warning
  per tree or scratch directory".
- "A nested project belongs in a declared nested tree: undeclared, its
  marked root description or package manifest is a layout error." becomes
  "A nested project belongs in an `owned-nested-project` or `external` tree:
  undeclared, its marked root description or package manifest is a layout
  error."
- The affected seed rule: "a path in an owned-ignored tree or a scratch
  directory is `ignored` and selects nothing" becomes "a path in an owned
  nested tree or a scratch directory is `ignored` and selects nothing" (Q8).
- The human-output line naming "any owned-ignored or scratch exclusion"
  names "any owned nested tree or scratch exclusion".
- Every version the [formats table](main-plan.md#formats) moves:
  `ramify.analysis/3`, `ramify.affected/4`, `ramify.affected-cli/4`,
  `ramify.check/3`. History sentences keep their old versions.
- Every other `owned-ignored` occurrence, including the `not-analyzed`
  disposition, names the two owned kinds.

### S2: `architect-view.spec.md`

`boundaries` "lists the owned-ignored and external trees" becomes "lists the
owned nested and external trees", and the JSON example becomes
`{ "kind": "owned-unwired", "dir": "scripts/reference-harness", … }`. The
schema names move to `ramify.architect-projection/3`,
`ramify.architect-module/3` and `ramify.architect-view/3`.

### S3: `modularity-report.spec.md`

`omittedScopes` "owned-ignored and external" becomes "owned nested and
external". `ramify.modularity/3` does not move.

## R: ramify-audit (iteration 3)

### R1: principles, "Projects keep separate audit evidence" (a principles edit)

Old: `An audit covers one project by default. A project within an owned-ignored`
`tree has its own definition, change set, reuse lookup and evidence key.`

New: `An audit covers one project by default. An owned nested project has its`
`own definition, change set, reuse lookup and evidence key.`

### R2: specification, seed kinds

Replace "a path in an owned-ignored or scratch tree (`ignored`)" with "a path
in an owned nested or scratch tree (`ignored`)", and "including inside an
owned-ignored or external tree" with "including inside an owned nested or
external tree".

## H: ramify-agent (iteration 4)

### H1: harness specification, "Every Agent Scope Is a Cut on the Module Tree"

Old:

```text
A module assignment covers its owned contents, including configuration,
documentation and scratch, except its owned-ignored trees. Child subtrees and
owned-ignored trees require explicit inclusion, each as a whole. External
trees are never writable in the enclosing run.
```

New:

```text
A module assignment covers its owned contents, including configuration,
documentation, scratch and owned-unwired trees, except its owned-nested-project
trees. Child subtrees and owned nested projects require explicit inclusion,
each as a whole. External trees are never writable in the enclosing run.
```

Old:

```text
The issuing architect names each included tree with a reason and instructions
for its meaning. The tree is excluded from Ramify source checks; the owner's
tests and README define its use. Where it is a project, its own instructions
and commands apply from its root.
```

New:

```text
The issuing architect names each included project tree with a reason and
instructions for its meaning. The tree is excluded from Ramify source checks;
its own instructions and commands apply from its root.
```

In "Verification Follows Scope And Audit Policy", "An included ignored tree
is verified by its owner's tests during ordinary iterations" becomes "An
included project tree is verified by its owner's tests during ordinary
iterations".

### H2: glossary

Old:

```text
An **included child** is a child module whose entire subtree is included in
an assignment's scope, subject to the scope's external and ignored-tree rules.
```

New:

```text
An **included child** is a child module whose entire subtree is included in
an assignment's scope, subject to the scope's external and project-tree rules.
```

Old:

```text
An **included tree** is an owned-ignored tree of an assigned module explicitly
included, whole, in the assignment's scope.
```

New:

```text
An **included tree** is an owned nested project of an assigned module explicitly
included, whole, in the assignment's scope.
```

## Rename-only sites, not protected

Iteration 1 updates these in the same change, without approval:
`docs/architecture/daemon.md` (dispositions and watch registrations),
`docs/architecture/README.md`, `docs/development/batch-verification.md`,
`README.md`, `CLAUDE.md`, the module READMEs of `analysis`,
`analysis/descriptions`, `analysis/project`, `analysis/typescript`, `cli` and
`daemon/contexts`, `scripts/reference-harness/README.md` and the root
`module.ramify` comment. `docs/architecture/project-boundary.proposal.md`
gets an amendment under decisions 2 and 7 that links this plan and repeats
the kind table; its other sections follow the new names.
