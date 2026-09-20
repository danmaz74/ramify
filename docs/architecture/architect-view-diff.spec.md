# Architect-view differences

**Date:** 2026-09-20. **Status:** Proposed feature specification; not implemented.
Command names, schemas and limits below are proposed contracts, not available
CLI behavior. Implementation requires its own plan and acceptance evidence.

## Purpose and boundary

Let a consumer refresh the [architect view](architect-view.spec.md) and inspect
what changed since a specific saved view without rereading the whole project.
An explicit baseline supports consumers that skip intermediate refreshes and
consumers with different update schedules.

Ramify compares its derived evidence. It does not infer capabilities, explain
the intent of a change, classify compatibility, establish test success, or
decide which changes matter to a particular task. A consumer supplies its own
request, decisions and unfinished-work context. This follows the
[module architect principles](../agents/module-architect.principles.md).

The first version adds an opt-in comparison to materialization. It introduces
no session tracking, automatic baseline advancement, snapshot-retention
service, historical source analysis or semantic rename detection.

## Invocation

```sh
ramify materialize --view architect --diff-from <baseline-directory> [--root <dir>]
```

`--diff-from` names a caller-retained, complete architect-view directory. Relative
paths resolve against the invocation's working directory, independently of
`--root`. It requires an explicit `--view architect`, may occur once, and may
be combined with `--view api`; existing API selection rules still apply.

Without this flag, existing materialization behavior and output are unchanged.
There is no implicit comparison against the previous contents of the live view.
`check`, watch and source-change hooks do not publish diffs automatically.

The workflow is:

1. Materialize and consume an initial view. Save a complete copy as a baseline.
2. Refresh with `--diff-from` that saved directory, even if other refreshes have
   happened in between.
3. Consume the diff and selectively inspect the new view.
4. Save the newly consumed view if it should become the next baseline.

The caller chooses when a baseline advances. Ramify neither edits nor deletes
the baseline. Store copies outside the project, or beneath a directory with
the already reserved `.ramify-architect` path segment. Arbitrary snapshot
directories inside source areas are not automatically excluded from analysis.
Copy only a completed publication while its files are stable; preserve the
directory layout and metadata. Ramify-managed snapshot export is deferred.

## Baseline validation and identity

Accept the current `ramify.architect-view/1` format, including bounded or
unavailable evidence explicitly represented by its metadata. A complete
publication is not the same as complete source knowledge.

Validate before publication:

- The directory is distinct from, and does not overlap, any publication target.
  Reject symbolic links in the baseline and its traversal, as for output paths.
- Metadata and module schemas are supported; JSON and JSONL are valid.
- All declared modules have their required files, including empty record files.
  Parent/child topology, module counts, file locations and record owners agree.
- All module revisions agree with the baseline metadata. Reject duplicate
  symbol keys and unexpected files rather than silently omitting input.
- The root module identity agrees with the current project's root identity.
  This is a sanity check, not proof that two directories have the same origin;
  choosing the correct project history remains the caller's responsibility.

Capture a bounded, immutable copy of the baseline for comparison and detect
changes during capture. A changing or structurally incomplete baseline is an
error. No check can authenticate an already modified but internally consistent
copy as an original Ramify publication; callers must retain snapshots faithfully.

Each side has three identities in diff metadata:

- `revision`: the existing analysis generation identifier;
- `input`: the existing captured input identity, including dirty source;
- `snapshot`: a digest of the actual saved view contents.

`snapshot` is `sha256:<lowercase-hex>`. Hash a UTF-8 JSON array of
`[relativePath, fileSha256]` pairs, sorted by path in UTF-8 byte order, with no
whitespace. File hashes cover exact bytes; paths use `/`; include every file
of the validated view, including `README.md` and `_meta.json`. The array has
no trailing newline. Neither filesystem timestamps nor absolute paths enter
the digest. This is snapshot identity, not a semantic equality test.

Both sides must use supported view and module schemas and the same dependency
scope. Schema conversion and cross-profile comparison are deferred. Different
input or revision identifiers are expected, including after a daemon restart.
Changes between measured and unavailable evidence are supported and reported.

## Output location and layout

Publish one sibling of the current view:

```text
<root>/
  .ramify-architect/           # current facts; unchanged layout
  .ramify-architect-diff/
    _meta.json                # comparison identity, evidence limits, totals
    README.md                 # compact entry point
    modules.jsonl             # complete index of changed modules
    changes.jsonl             # deterministic factual changes
```

A sibling avoids historical or removed records appearing in existing recursive
searches of `.ramify-architect/`. Search the diff explicitly when historical
evidence is wanted. The generated files are never edited or imported.

Only the most recently requested diff is retained at this location. A later
materialization without `--diff-from` leaves it unchanged. Its identities still
describe the old comparison; it is not implicitly a diff of the newest view.
Consumers must use the successful invocation's result and verify the target
snapshot before combining the diff with a live view that may have advanced.
Concurrent consumers must retain their own completed outputs if needed.

### `_meta.json`

Schema: `ramify.architect-diff/1`. Required fields, in output order:

| Field | Content |
| --- | --- |
| `schema` | Diff schema identifier. |
| `from` | Baseline `revision`, `input`, `snapshot`. |
| `to` | Current `revision`, `input`, `snapshot`. |
| `evidence` | `before` and `after`: each view's complete metadata except `revision` and `input`, already present above. |
| `counts` | Changed module count; added, removed and changed unit counts, separately for `module`, `behavior`, `supporting` and `tests`; changed metadata-field count. |
| `files` | Byte length and SHA-256 of `README.md`, `modules.jsonl` and `changes.jsonl`, in path order. |

No timestamps, host paths, agent identity or source diff are included. Both
evidence profiles are present even when equal, so limitations of a zero-change
comparison are explicit. Metadata changes do not fabricate module changes.

### `README.md` and `modules.jsonl`

The README identifies this as a historical comparison of generated evidence,
names both snapshots, shows totals and highlights changed evidence availability
or coverage. It explains that a removed view record is not proof of removed
source behavior and that unchanged evidence does not prove unchanged source.

List at most 40 changed modules in UTF-8 byte order, also respecting a 16 KiB
README limit. Show an explicit omitted count and point to the complete index
when the list exceeds either bound. Shorten only the module preview, not the
identity, coverage warning or instructions. Do not repeat the current view's
full module map or unchanged purposes and symbols.

Each `modules.jsonl` record identifies a module, whether the module itself was
added, removed or changed, the affected view-file kinds, and change counts by
kind. Include both modules with local changes and ancestors whose own rendered
facts changed. Do not equate an ancestor's changed subtree metrics with edits
to that ancestor's source. The index is complete and sorted by module ID.

Example discovery commands in the README:

```sh
rg -n '"module":"app/notifications"' .ramify-architect-diff/changes.jsonl
rg -n 'sendEmail' .ramify-architect/notifications/
```

The first searches change evidence; the second searches current facts. Consumers
read only relevant results. They need not load `changes.jsonl` in full.

## Comparison and change records

Compare parsed, canonical view data, not raw line positions. Existing symbol
records are sorted partly by usage, so a changed use count can move many lines
without changing the other records. Do not emit changes for these reorderings.

Canonical JSON recursively sorts object keys in UTF-8 byte order, retains array
order and uses compact JSON encoding with no insignificant whitespace. Compare
values structurally. Absence, `null`, empty arrays and unavailable evidence are
distinct; never normalize them to zero or an empty set.

Use these comparison units:

| Kind | Key and comparison |
| --- | --- |
| `metadata` | Singleton `_meta.json`, excluding `revision` and `input`. |
| `module` | Module ID; compare `module.json`, excluding its repeated `revision`. |
| `behavior`, `supporting` | Kind, module ID, defining `file`, exported `name`, and optional `binding`. Compare all remaining record fields. |
| `tests` | Module ID plus SHA-256 of the canonical complete test record. Compare as a multiset, retaining identical-record multiplicity. |

The generated README is derived from other records and is not separately
diffed. Revision/input changes are represented once in the comparison metadata.
Metrics, coverage, documentation and bounded-list remainder counts are not
discarded as noise. Preserve their existing production/testing and exact/subtree
distinctions. Changes to view instructions alone affect snapshot identity but
do not create architectural-evidence changes.

For a matched module or symbol, emit one `changed` row with only differing
top-level fields in `before` and `after`. A field absent on one side is omitted
from that side's object. Include whole array or nested-object values when that
top-level field differs; minimal nested patches are deferred.

For an added or removed module or symbol, include the complete normalized
record on the corresponding side. A module addition or removal also includes
the changes to its symbols and tests. Counts describe units, not a count of
source edits. Metadata uses the same sparse changed-field rule.

Test changes are additions/removals of exact rendered records, with `count`
equal to the positive multiplicity difference. Do not infer suite identity
from titles, which may repeat. Reordering JSONL rows alone produces no change;
changing title order within a record is a change. A title edit or a change to
the existing 40-title chunk boundary may replace several records. Finer test
matching is deferred.

Record keys are compared as tuples, not ambiguous concatenated strings.
Moving or renaming a symbol/module, changing a symbol's defining export name,
or moving between behavior and supporting classification appears as removal
plus addition. No cross-revision compiler identity or rename inference is needed.

Examples of `changes.jsonl` rows:

```jsonl
{"kind":"behavior","module":"app/notifications","key":{"file":"subs/notifications/src/send.ts","name":"sendEmail"},"change":"changed","before":{"sig":"function sendEmail(to: string): Promise<void>;"},"after":{"sig":"function sendEmail(request: EmailRequest): Promise<void>;"}}
{"kind":"metadata","change":"changed","before":{"dependencies":"measured"},"after":{"dependencies":"unavailable","dependencyReason":"wait-limit"}}
```

Row field order is `kind`, `module` when applicable, `key` when applicable,
`change`, `count` for tests, `before` when applicable, `after` when applicable.
Module rows use `module` as their key; test keys contain `recordHash`. Metadata
has no module or key. Embedded values use canonical JSON.

Sort metadata first, then by module ID, kind (`module`, `behavior`, `supporting`,
`tests`), key tuple and change (`removed`, `added`, `changed`), using UTF-8 byte
order for strings and absent binding before present binding. Files use UTF-8,
LF and a terminating newline. Empty JSONL files contain a single newline.
Repeated comparison of the same two snapshots produces byte-identical output.

## Meaning and evidence limits

The diff describes the two rendered views, including their bounds. It cannot
reveal differences hidden by truncated signatures, documentation or consumer
lists. It cannot reveal implementation-body changes absent from the projection.
Do not add a label claiming that the project or capability is unchanged.

In particular, measured-to-unavailable dependencies can remove consumer fields
from many records. These rows report loss of evidence, not removal of source
dependencies. The README must foreground this condition. The metadata carries
both coverage profiles even if there are no changed records. Unknown shapes,
cut fields, unavailable test references and improvements in coverage receive
the same treatment.

A successful comparison with zero changes means only that the compared
normalized architectural evidence is equal. Input and snapshot identities can
still differ. Importability remains a question for a requester's API view at
the matching current revision. Test titles and references are not test results.

## Publication, failure and resource contract

Produce the new architect view and diff from one synchronized current revision.
Comparison uses the staged current output and captured baseline; it does not
run another source analyzer or compare against a view changing on disk.

Publish the diff as an additional target of the existing
[materialization transaction](materialized-api-view.spec.md#materialization),
with any requested API views. Stage complete outputs, switch through the
existing rollback/recovery mechanism, and publish diff `_meta.json` last.
Only replace a recognizably generated `ramify.architect-diff/1` directory.
Refuse symlinks and unexpected user directories. Report success only when all
requested targets are published. Cancellation, resource refusal, supersession
or a switching failure must not claim a completed pair. Reuse the publisher's
crash-recovery contract; concurrent arbitrary filesystem reads are not a
transactional snapshot. Consumers use completed receipts and identities.

On invalid or missing baseline, refuse the requested operation before replacing
outputs; never substitute the live view, an empty project or another snapshot.
An initial view is obtained by calling materialize without `--diff-from`.
Existing valid outputs remain available as explicitly old artifacts after a
failed request. No failure creates a successful zero-change diff.

Proposed first-version limits, enforced on escaped UTF-8 output and framing:

| Limit | Value |
| --- | --- |
| Captured baseline | 64 MiB total, 100,000 files |
| Current architect output | Existing architect materialization limits |
| Complete diff output | 128 MiB total |
| One change or module-index record | 256 KiB |
| Diff README | 16 KiB, at most 40 module previews |

Apply existing deadlines and cancellation across capture, comparison and
publication. Oversized baseline, record or output refuses the whole operation
with `resource-unavailable`; do not truncate records or publish partial totals.
The README preview is the only deliberately bounded display, backed by the
complete index. Limits are proposed defaults requiring fixture measurements
before implementation acceptance; especially measure large dependency arrays
and availability changes that touch most modules. Do not silently raise limits.

### CLI and service compatibility

Extend the materialize request with optional `architectDiff: { baselinePath }`.
The CLI resolves the path; the local service validates and captures it. Negotiate
an `architect-view-diff` capability before sending this field. An older service
returns `incompatible-service`; it must not silently ignore the comparison.

Successful materialization adds an `architectDiff` result containing its
project-relative directory, schema, both identities and counts. The CLI retains
existing success lines and adds a line naming `.ramify-architect-diff/`, the
two snapshot digests and the changed-module count. Zero changes is success.
No absolute baseline path is stored in generated output.

Use existing exit conventions: 0 for completed publication, 1 for an invalid
project, 2 for invocation, compatibility, baseline or resource failure. Stable
baseline reasons are `baseline-missing`, `baseline-invalid`,
`baseline-incompatible` and `baseline-changed`. Cancellation, supersession,
deadlines and publisher errors retain existing outcome categories. No baseline
failure is reported as an invalid project.

## Generated-output isolation and implementation boundaries

Reserve `.ramify-architect-diff`, its `.tmp-<suffix>` and `.old-<suffix>` staging
siblings and associated publisher markers wherever those path segments occur,
as for the current architect view. Inventory, compiler selection, capture,
observation and watching exclude them regardless of Git configuration.
Publishing or reading a diff cannot change analysis input identity, create a
source area or start another revision. Add matching generated-output ignore
entries during implementation. Exposure declarations and imports cannot use
these files as application resources.

Build on the existing architect renderer and transactional publisher. A pure
comparison of validated view records belongs with view projection in `analysis`;
filesystem capture and publication use the existing service/publisher boundary;
generated-path exclusion belongs with project acquisition; CLI handles options
and presentation. No new module or compiler-facing API is justified by this
specification. The implementation plan must verify exposure and ownership before
choosing concrete helpers; these are responsibility boundaries, not new exports.

The existing view is specified in [architect-view.spec.md](architect-view.spec.md).
Current grounding includes `subs/analysis/src/architect-render.ts` and
`subs/cli/src/materialize-command.ts`. They render and materialize the view;
they do not implement the proposed baseline or diff contract.

## Acceptance cases

| ID | Required evidence |
| --- | --- |
| AD01 | Identical snapshots yield empty changes and index, zero counts, byte-identical repeat output and no writes on unchanged publication. |
| AD02 | Revision-only change or daemon restart changes identities but emits no per-module revision churn. A source-body edit with unchanged projected facts is not reported as unchanged source. |
| AD03 | Compare A to C after another client materializes B; the result uses A, and two callers with different retained baselines get their requested comparisons. |
| AD04 | Add/remove a module and symbol; change purpose, signature, exposure, tags, documentation, metrics and use evidence. Counts and payloads match exactly. |
| AD05 | A usage-driven reorder emits changes only for differing records. Rename, move and behavior/supporting reclassification emit deterministic removal/addition pairs. |
| AD06 | Repeated suite titles, duplicate records and 40-title chunks retain multiplicity. Pure row reorder is ignored; content changes produce exact test-record replacements. |
| AD07 | Measured/unavailable transitions, unknown shapes, truncated fields and changing coverage are prominent and never interpreted as absent behavior or passing tests. |
| AD08 | Missing, partial, malformed, unsupported, overlapping, symlinked or changing baseline refuses publication; prior complete outputs survive. |
| AD09 | Cancellation, supersession, deadline, disk failure and crash/restart during publication preserve the existing transaction/recovery guarantees for view, diff and any API targets. |
| AD10 | A subsequent refresh without the flag leaves a clearly identifiable old diff. Pairing it with a newer current snapshot is detected by identity checks. |
| AD11 | Diff publication and caller snapshots under reserved segments do not alter inventory, watcher activity, input identities or revision counts. Current-view search returns no historical records. |
| AD12 | Baseline size/file-count, record and total-output limits refuse whole results, including escaped Unicode and exact-boundary cases. README omission is explicit and the index stays complete. |
| AD13 | Legacy invocations keep their output and request shape. Unsupported service capability fails before requesting comparison; new success and error exits match the contract. |
| AD14 | Compare realistic edits: one signature change, a new module, a broad consumer update and loss of dependency evidence. Record generation time, peak memory, bytes, index size and architect input size relative to rereading the full view. |
| AD15 | A consumer starting with only the diff README can find relevant changes, inspect current facts and recognize coverage loss without being given the full diff or a synthesized interpretation. |

Run structural/unit comparisons through quick service tests first, then real CLI
publication and recovery cases. Agent consumption trials validate usefulness;
schema-valid JSON alone does not establish token economy or decision quality.
Record tokenizer and model if reporting tokens; encoded byte counts remain
the deterministic resource contract. No fixed performance claim is made here.

## Deferred work

Managed snapshot retention/export, automatic previous-refresh baselines,
schema migrations, cross-project comparisons, nested field patches, semantic
test pairing, rename inference, source diffs, relevance ranking, synthesized
summaries, UI rendering and agent-session policy are outside this version.
