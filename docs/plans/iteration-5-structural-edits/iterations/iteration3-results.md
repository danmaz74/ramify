# Iteration 3 results: Membership witness and contribution index

**Date:** 2026-09-13. **Outcome:** SE-6 to SE-8 pass. Direct work; no Studio
workflow.

- One incremental update with `invalidateAll: false` gives the same program
  membership, descriptions, catalog and accesses as a fresh adapter. This holds
  for a created unreferenced file, a created file that satisfies an absence
  probe, a created file that satisfies an extensionless specifier, a deleted
  referenced file and a deleted unreferenced file.
- During that update the compiler reports every path the affected files
  contribute, including the created path an importer probed.
- `FactIndexes.contributors` names the owned files contributing each
  observation path.

The witness also found two gaps that resolved decisions 4 and 5 do not
account for. **Iteration 4 depends on both:**

1. **Extensionless specifiers are missed.** A created file that satisfies an
   extensionless or aliased specifier is not named exactly by any retained
   candidate or absent dependency. The description set had the same gap and
   left a re-exporter stale. This iteration fixes the description set; the
   session's affected-set rule must apply the same completion rule.
2. **Some obsolete compiler probes have no contributor.** The compiler's own
   resolution probes, and the reads of a package reached only through a
   deleted file, are not named by any contribution. A fresh adapter no longer
   reports them. Retiring only contributed observations, as decision 5 states,
   would leave them in the session's inputs, so the inputs would differ from
   batch in four of the five cases. See
   [Findings for iteration 4](#findings-for-iteration-4).

## Implemented behavior

- **Description selection, `typescript`.** Before this iteration, a created
  file selected only the retained descriptions whose `dependencies.absent`
  held its exact path. The selection now uses `completes(absent, created)`
  (`subs/analysis/subs/typescript/src/descriptions.ts:84-86`, used at `:122`).
  It holds when the created path equals the absent path, or extends it after
  a `.` or a `/`. An extensionless or aliased specifier records only its base,
  such as `src/soon` or `src/aliased`. Without the rule, a created
  `src/soon.ts` left `export * from "./soon"` described as before, and the
  catalog differed from a fresh adapter even after interpreting every file.
  The rule can only select more descriptions, and recomputing more is allowed.
- **Contribution index, `analysis`.** `buildIndexes(files, root)`
  (`subs/analysis/src/session-facts.ts:109-146`) also builds `contributors`.
  For each file it collects the file's own path, its `candidates`, and its
  description `dependencies.files`, `resources`, `shims` and `absent`. A
  dependency outside the root, which a description spells
  `external:<absolute path>`, is keyed by its relative spelling (`../...`),
  the form candidates already use. Keys and file lists are in byte order and
  frozen. `emptyIndexes.contributors` is `{}`. Both callers pass
  `inventory.scope.root`: `recomputeAll` (`session-revision.ts:231`) and the
  source path (`:498`). The metadata and description paths keep the previous
  indexes with unchanged files. Invalid facts keep `emptyIndexes`. The audit's
  `compareFacts` already compares `indexes` as a whole, so it now also verifies
  `contributors`.
- **Witness, `typescript` tests.** `membershipWitness` in
  `src/tests/retained-membership.ts:142` sets up the `membershipProject`
  fixture and describes and interprets every file. It then applies one
  created or deleted file with a single `update`, recording each sink
  callback and whether it arrived during the update. Next it calls
  `describe([file])` and interprets every file. Finally it opens a fresh
  adapter over the same disk and compares the two. The existing
  `retainedMembershipWitness` is unchanged.

## Contract shapes

```ts
// subs/analysis/src/session-facts.ts
export interface FactIndexes {
  readonly importers: Readonly<Record<string, readonly string[]>>;
  readonly selectors: Readonly<Record<string, readonly string[]>>;
  readonly owners: Readonly<Record<string, string>>;
  /** Observation path, relative to the root, to the owned files contributing it:
   * each file's own path, its candidates and its description dependencies. Keys
   * and files are in byte order; a path outside the root keeps its relative spelling. */
  readonly contributors: Readonly<Record<string, readonly string[]>>;
}
export function buildIndexes(files: Readonly<Record<string, FileFacts>>, root: string): FactIndexes;

// subs/analysis/subs/typescript/src/descriptions.ts (owner-private; the witness imports it)
export function completes(absent: string, created: string): boolean;
```

`contributions(root, path, file)` is private to `session-facts.ts`. No
exposure line, package entry or port member changed.

**Size.** On `examples/collection-review`, one in-process cold open reports
`factBytes` of 1,294,168 with the index and 1,268,539 without it. The index
adds 25,629 bytes, 2.0 %.

## Witness outcomes

In the tables below, the *affected* set contains:

- the changed file;
- the files whose pre-change candidates or description dependencies name it,
  using `completes` for a created file and exact equality for a deleted one;
- the importers of the descriptions that `describe([file])` recomputed.

*Contributed* lists the paths the affected files contribute after the change
that a fresh adapter observes.

Every case keeps the same compiler server and one live snapshot. In every case
the program membership of each owned path and of both package declarations,
the sorted descriptions, the catalog, and the accesses with coverage equal a
fresh adapter's.

| Case | Recomputed | Compiler re-read during the update | Affected | Contributed, all reported during the update |
| --- | --- | --- | --- | --- |
| created `src/fresh.ts`, unreferenced | `src/fresh.ts` | `src/fresh.ts`, `tsconfig.json` | `src/fresh.ts` | `src/api.ts`, `src/fresh.ts` |
| created `src/later.ts`, probed by `./later.js` | `src/hub.ts`, `src/later.ts` | `src/later.ts`, `tsconfig.json` | `consumer`, `hub`, `later` | `api`, `consumer`, `hub`, `later`, `remove` (all `src/*.ts`) |
| created `src/soon.ts`, named by `./soon` | `src/barehub.ts`, `src/soon.ts` | `src/soon.ts`, `tsconfig.json` | `bare`, `barehub`, `soon` | `src/bare.ts`, `src/barehub.ts`, `src/soon.ts` |
| deleted `src/remove.ts`, referenced | `src/hub.ts` | `tsconfig.json` | `hub`, `remove`, `user` | `src/hub.ts`, `src/user.ts`, `src/remove.ts` and its `.d.ts`, `.js`, `.jsx`, `.tsx` probes, and the five `src/later.*` probes |
| deleted `src/lonely.ts`, sole importer of `pkg` | none | `tsconfig.json` | `src/lonely.ts` | none |

**What the compiler reports on a membership update.**

- **Reads.** The compiler reads only the created file, as `file` then
  `probe`, and the configuration, through the adapter's `parseConfigFile` of
  the regenerated roots.
- **Probes of owned sources.** Unchanged owned sources are reported as
  `fileExists` probes, never read again.
- **Resolutions.** The compiler resolves every owned source's imports again,
  so each failed resolution's probes, including `node_modules` walks, are
  reported again.
- **Default libraries.** 63 library files are never reported again.
- **Package files.** `node_modules/pkg/other.d.ts` and
  `node_modules/pkg/package.json` are not reported again. The first is
  reached only through a dependency declaration; the second comes from the
  compiler's package cache.
- **Plain source edits.** A `changed`-only update reported one read in a
  scratch run and none of the resolution probes, so re-resolution follows
  membership updates only.

The in-root paths a fresh adapter observes that the update did not report
are exactly those two package files, as `file` and `probe` (`freshNotReported`).
In the deleted unreferenced case the list is empty.

**Contributed paths that are not observations.** Candidates include literal
specifier spellings such as `src/api.js` and `src/remove.js`, which neither
adapter ever reports (`unobserved`). A contribution is an observation only when
some adapter reports it.

## Findings for iteration 4

**F1, extensionless and aliased specifiers.** Before the change, `bare.ts`
(`import ... from "./soon"`) has candidates `["src/soon"]`, and `alias.ts`
(`@fixture/aliased`) has `["src/aliased"]`. The fallback probe in
`resolution.ts` substitutes extensions only for a candidate that has one, so no
retained record holds `src/soon.ts` or `src/aliased.ts`. In a scratch run, the
plan's exact affected-set rule left `bare.ts`, `barehub.ts` and `alias.ts`
interpreted as before, and their accesses differed from a fresh adapter.
`barehub.ts`'s description also differed until the description fix above.
Iteration 4 must match created paths against candidates and absent
dependencies with the same completion rule. The witness computes its affected
set that way and gets `bare.ts` and `barehub.ts`.

To look up the index for a created path `X`, try every prefix of `X` that
ends just before a `.` in its basename or before a `/`. Two cases are still
not named by any record:

- a non-relative specifier resolved through `baseUrl`;
- a specifier resolved through `rootDirs`.

A created file that satisfies either would still be missed; it could be
routed to the broad path or recorded as a limit.

**F2, obsolete compiler probes without a contributor.** Suppose iteration 4
retires every in-root path the adapter reported before the change that a
pre-change contribution of an affected file names. The paths below are
reported before the change, are not observed by a fresh adapter, and are not
named by any such contribution (`obsoleteUnattributed`). A fresh batch would
not record them, so keeping them, as decision 5 states, makes the session's
inputs and `inputId` differ from batch:

| Case | Obsolete, not contributed |
| --- | --- |
| created unreferenced | none |
| created, probed by `./later.js` | probes `src/later.js.d.ts`, `.js.js`, `.js.jsx`, `.js.ts`, `.js.tsx` |
| created, named by `./soon` | probes `src/soon.d.ts`, `.js`, `.jsx`, `.tsx` |
| deleted referenced | probes `src/ghost.js.d.ts`, `.js.js`, `.js.jsx`, `.js.ts`, `.js.tsx`, from the deleted file's own failed import |
| deleted sole importer of `pkg` | probes `node_modules/pkg`, `pkg.d.ts`, `pkg.ts`, `pkg.tsx`, `pkg/other.ts`, `pkg/other.tsx`, `src/node_modules`; reads and probes of `node_modules/pkg/other.d.ts` and `node_modules/pkg/package.json` |

The compiler does report everything the next promotion needs (SE-7).
What is missing is attribution: these are the compiler's internal extension
and package probes, and only the index declaration is a candidate. The
evidence suggests one alternative for review. On a membership update, retire
every compiler-reported probe, absence and listing, since the compiler reports
again every one that is still needed. Keep compiler-reported reads unless a
contribution of the affected set names them. The only non-retired
obsolete reads in this witness are the package files of the last row. The
program no longer holds `other.d.ts` (`programHas` is false), but
`package.json` is not a program file. That row therefore still needs a rule,
or the broad path when a deleted file had a package target. This is iteration
4's decision; resolved decision 5 does not cover it as written.

**F3, what holds.** The compiler handles a membership change incrementally
and the facts equal a fresh adapter. No whole invalidation is needed for the
compiler's program, descriptions, catalog or accesses.

## Matrix rows

| ID | Evidence | Result |
| --- | --- | --- |
| SE-6 | `subs/analysis/subs/typescript/src/tests/retained-membership.test.ts` `membership-incremental-equal, membership-reads-reported: ...`, five cases, each with `expectFreshEquality`: program membership, descriptions, catalog and accesses equal a fresh adapter, same server, one live snapshot, 120 s timeouts. The cases are `:31` created unreferenced, `:44` created satisfying an importer's absence probe, `:56` created satisfying an extensionless specifier, `:67` deleted referenced, `:80` deleted unreferenced. Each also asserts the recomputed set and the files re-read | pass |
| SE-7 | Same five tests, `expectReported`: `unreported` is `[]`, meaning every contribution of the affected files that a fresh adapter observes reached the sink during the update. The created files arrive as `file` and `probe`, including `src/later.ts`, which `consumer.ts` probed as absent. The deleted file arrives as a `probe`. The tests also pin `unobserved`, `freshNotReported` and `obsoleteUnattributed` as recorded above | pass |
| SE-8 | `subs/analysis/src/tests/session-revision.test.ts:673` `contribution-index: maps each file, candidate and description dependency to its sorted contributors, relative to the root`: synthetic facts give the exact map, including `external:` normalization, byte order, frozen lists, `emptyIndexes.contributors` and an empty rebuild | pass |
| SE-8 | `session-revision.test.ts:698` `contribution-index: equals a rebuild after every revision kind and holds no path of a removed file`: real session with a `pending.ts` that imports an absent `./later.js`. The revision kinds are cold, unchanged-surface, source (twice, one changing `pending.ts`'s candidates), description, metadata, invalid, recovery, a created file, two deletions and a configuration edit. After each, the index equals `buildIndexes(files, root)` and an independent derivation, every file contributes its own path, and `audited` holds. A created `later.ts` maps to `[later, pending]`; after its deletion no list names it and its path maps to `[pending]`. After `pending.ts` is deleted no key starts with `subs/branch/src/later`. The sequence ends equal to batch | pass |

**Mutation checks**, reverted before the commit:

- Restoring exact `absent.includes(added)` in `descriptions.ts` fails the
  extensionless SE-6 case: the descriptions differ.
- Dropping candidates from `contributions` fails both SE-8 tests.
- Keeping the previous `contributors` on the source path fails the engine
  SE-8 test at its rebuild comparison, and the audit would report `indexes`.

## Commands

| Command | Result |
| --- | --- |
| `npx vitest run subs/analysis/subs/typescript/src/tests` | 14 files, 151 tests passed |
| `npx vitest run subs/analysis/src/tests` | 14 files, 220 tests passed |
| `npm run type-check` | pass, including the portable, scripts and reference-harness projects |
| `git diff --check` | clean |
| Scratch exploration, `npx tsx <scratch>/explore*.mts`, `print.mts` | the case sets, extra alias and plain-edit cases, and the retirement simulation behind F1 and F2; not committed |
| Scratch size check, `npx tsx <scratch>/bytes.mts` | `factBytes` with and without the index on the reference example; not committed |

The typescript run printed `context canceled` from a compiler process that a
test ends deliberately; every test passed.

## Deviations

- **Adapter-side change in `descriptions.ts`.** Deliverable 2 allows an
  adapter change only for a suppressed re-probe, and none was needed: the
  compiler reports every contribution. The description fix corrects a stale
  description, which SE-6 requires. The fifth witness case, a created file
  satisfying an extensionless specifier, was added to expose it.
- **Witness affected set.** It applies the completion rule to created paths
  (F1). With the exact rule of resolved decision 4, `bare.ts` and `barehub.ts`
  are not affected.
- **Outside-root keys.** The plan says observation paths are relative to the
  root. Paths outside the root use the relative `../` spelling, which is how
  candidates are recorded. Capture labels spell such paths
  `external:<hash>/<basename>`, so iteration 4 converts them through the
  absolute path.
- **New test file.** `retained-membership.test.ts` holds the SE-6 and SE-7
  cases beside the witness helper, rather than in
  `retained-source-analysis.test.ts`.

## Remaining limits

- `baseUrl` and `rootDirs` resolutions have no candidate spelling, so the
  completion rule cannot name a created file that satisfies them (F1).
- The witness covers relative, extensionless and package specifiers. Resource
  shims and `paths` aliases with a created target appear only in the scratch
  runs.
- F2 is recorded, not resolved.

## Successor inputs

- **Iteration 4, affected set.** Seed with the changed files and add the
  files whose candidates or description dependencies name them. A created
  path matches by `completes` (F1); a deleted path matches exactly, since the
  resolved declaration path is always a candidate. Then add the importers of
  the recomputed descriptions. The description set expands the rest on its
  own: `describe([created or deleted file])` recomputed `hub.ts` for a created
  `later.ts` and for a deleted `remove.ts`, and `barehub.ts` for a created
  `soon.ts`. Iteration 4 therefore names only the seed set.
- **Iteration 4, retirement.** Look up `contributors[path]` for each
  observation, converting capture labels to root-relative paths. Retiring only
  paths whose contributors are all affected leaves the F2 table stale; design
  the retirement against it. SE-9's "created file that satisfies an absent
  probe" and "referenced deletion" cases will show the `.js.*` probes.
- **Iteration 4, promotion cost.** On a membership update the compiler reads
  only the created file and the configuration. Everything else it reports is
  a probe, so promotion should not read and hash dependency files as the broad
  path does.
- **Iteration 6.** A configuration edit keeps the whole invalidation, and
  contributors are rebuilt by `recomputeAll` as today.

## Audit

The cucumber-viz commit audit of `39d8d20` (source commits `9ae894e` and
`39d8d20`), run with `use_existing_head` on the worktree, passed in 2 min 44 s.
It covered worktree dependencies, type-check and the Vitest regression suite.
Evidence: `refs/audited/runs/2026-09-13T20-12-39Z-39d8d20`. These results are
a docs-only follow-up.
