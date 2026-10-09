# Plan 25 instruction-block contracts

**Status:** proposed. [Main plan](main-plan.md). Incorporates former Plan 26
with the briefing-occurrence and invariant-framing corrections from review.

## C1. Identity and effective version

A logical block has a stable key, exact rendered model-visible text, a hash from
the existing SHA-256 helper, provenance and an effect: `set` or `remove`.
Add optional `{ key, effect }` block metadata to `DeliveredInput`; retain its
existing delivery identity and exact bytes. Unannotated historical/ad hoc inputs
remain valid history.

Replay annotated inputs in order. Latest set wins; remove makes the block
unavailable. Derive any effective-state map in memory from the selected point's
actual history. Never infer delivery from files, prepared packets, other sessions
or the parent's current head. Duplicate desired keys fail before dispatch.

| Block | Logical key | Rule |
| --- | --- | --- |
| Role | `role:<role>` | Existing pinned role delivery; current task selects role |
| Procedure | `procedure:<role>:<family>` | Missing/changed body delivered; select key/hash every task |
| Environment | `environment:<TaskEnvironment field>` | Current whole value replaces previous value |
| Briefing | `brief:<existing section key>` | Corrected occurrence-ordered revision delivery; same section policy |
| Submission | `tool:<name>` | Existing immutable-name declaration rule |
| Current task/revision notice | Existing task component keys | Always appended; not reusable blocks |

Procedure families are explicit task-definition metadata, not inferred from
equal prose or filenames. Main local-architect assignment/completion/repair share
a family; orientation, reconciliation and qualification have distinct families.
Reviewer code/scope/design/orientation and catalog turns are distinct. Main
engineer tasks share where they use the same procedure; consultation is distinct.
Declare the rest from the existing role/task table, including inline procedures
with no source file. Package/source identity remains provenance, not the block key.

One key changing A → B → A requires the final A even if it appeared earlier.
Separate available procedure families may be selected again without resending.
Role bodies stay pinned under the existing package/run contract; diagnose a
conflicting same-role body instead of hiding it behind an old key. No mid-run
role-package upgrade is introduced. Changed same-name submission schemas still fail.

## C2. Selection, replacement and withdrawal

Every task carries phase/kind, objective, active role, selected procedure key/hash,
submission tool and current evidence/changed-path instructions. It explicitly
supersedes prior task selection. The selected procedure must match a body in
inherited or appended inputs. Selecting another procedure does not withdraw the
previously available body; explicit withdrawal does.

Replaceable blocks use this invariant set framing on every delivery, including
the first (the placeholders below stand for the exact key and rendered body):

```text
# Block <key>
Current value; replaces any earlier value for this key.
<body>
```

The exact set text is `"# Block " + key + "\nCurrent value; replaces any earlier value for this key.\n" + body`.
Preserve the rendered body's bytes, including its own trailing newline if any;
append no additional terminator. The framing separators are LF. The hash used
for block equality and procedure selection is SHA-256 of this exact
rendered set text, including framing. A set does not receive a different header
because the block was already present. Changed origin metadata does not license
claiming the same bytes were delivered from a new source; retain actual provenance.
Pinned role and immutable tool entries keep their existing physical framing.

A withdrawal renders `"# Block " + key + "\nWithdrawn; this block no longer applies.\n"`,
with effect `remove`. Its physical entry has its own hash; it does
not become a selectable set version. Removing an unavailable block adds nothing;
reintroducing a withdrawn block delivers the canonical set text. After that set,
an unchanged task adds nothing. Store and report the bytes actually delivered;
there is no synthetic shorter manifest or separate hidden body-hash comparison.

Render environment fields in the fixed declared `TaskEnvironment` order with
deterministic JSON object-property ordering; preserve array order. Arrays/objects
replace atomically. Null, empty arrays and empty objects are explicit values,
not absence. No recursive patch language, path probing or relevance judgment.
Fresh packets include every currently required field. Add no new optional-input
completeness gate.

Keep canonical briefing sections and ordered updates, with the occurrence fix
in C6. Apply canonical block framing when turning selected section updates into
model-visible inputs; keep canonical goal/requirement content validation against
the structured section bodies. Do not compare those bodies to framed messages.

Annotate caller-selected withdrawals structurally at construction, before render;
do not infer a remove effect by parsing a sentence. Preserve selector retention:
omission by a retaining selector does not mean withdrawal. Other callers keep
the existing explicit replacement policy. The briefing algorithm owns which
updates are needed; the block layer records them, rather than running a second
revision-selection algorithm. Discovery sections follow the same policy.

Update role/embedded-skill wording that demands the complete procedure/environment
in the latest message. Explain effective inherited instructions plus explicit
updates. Keep current task selection concise; do not repeat reusable policy there.

## C3. Exact points, appends and immutable retries

Use ordered `Context.inherited` at the named point in `HarnessSessionOperations`.
Fresh starts have no inherited blocks. Forks use their source point, not a later
parent or sibling. Preserve the complete provider prefix; do not trim history.

Proposed additions are retained in an immutable operation intent. They become
ancestry only at a point whose engine receipt establishes that the inputs were
committed. Prepared/conflicting/uncommitted failures are not delivery. A failure
with a genuinely committed point uses its actual retained context; do not assume
all failures delivered nothing. Preserve receipt/settlement discipline.

Retry uses the original packet/intent/destination exactly, including legacy
packets; never recompute a delta against later state or newly loaded files.
Keep accepted replay idempotent and operation conflicts unchanged.

Accepted standalone appends update the same point ancestry. Named briefing
appends retain their logical section key as metadata alongside their unique
append identity. Ad hoc prose remains history without being parsed into assumed
procedure/environment meaning. No model call is required for state recording.

Current tools, cwd, authority, validator and destination remain bound each
operation. Inherited text cannot reactivate an old tool or expand write scope.
Keep Plan 24's ordinary fresh fallback; add no recovery/reconstruction subsystem.

## C4. Compatibility and actual-delivery manifests

Write new manifests as `ramify-agent.delivered-inputs/2`, with optional block
metadata on entries. Keep ordered physical inherited/appended entries, hashes,
bytes, provenance and current-message identity. Update strict readers/projections
to accept `/1` and `/2` before new writers. Legacy hashes remain computed over
their original representation. Freeze both wire forms in fixtures.

New harness intents use `ramify-agent.harness-operation/2`; readers accept both
versions. Legacy retry uses its original `/1` packet. Point contexts can contain
annotated inputs without a separate mutable database or history rewrite.

On a new task from an old point, normalize only recognizable legacy components:
role/tool entries, known task/procedure families, valid complete environment JSON
and named briefing sections. Do not alter old bytes or attribute undelivered new
source files. If identity cannot be established, retain history and deliver the
current needed block once. Missing ancestry uses existing unavailable/fresh handling.

Normalization is an internal interpretation tied to the original delivered
component, not a new physical manifest entry. In particular, splitting an old
environment object must not manufacture separately delivered field messages.
Where the new field framing or procedure framing differs from the inherited
representation, deliver that block once to establish its new representation.
Do not omit it by claiming synthetic field text was already delivered.

Inherited provenance remains the provenance actually delivered, even if newly
loaded source has equal rendered text but different identity. Do not call the
effective-state map physical context size: superseded text remains in the prefix.
Preserve truthful support-path/size projections for inherited and appended content.

## C5. Qualification and benefit assessment

Deterministic checks establish blocks, selection, ancestry, authority and retry.
Scripted serialization establishes exact prefix/appended bytes, not provider
cache hits. Retain existing provider identity and tool-order behavior.

Existing manifests, usage/timing and fallback records support Dan's separate
benefit assessment. No new performance threshold, metrics-only model call,
benchmark collector or paid live trial is required. Audits establish configured
test health; responsible architects retain semantic judgment.

## C6. Briefing content and occurrence identity

A content identity is the hash of the canonical goal, requirements and ordered
section bodies/provenance. An occurrence identity denotes a particular accepted
update in one session ancestry. They are distinct: A1 → B2 → A3 has equal content
hashes at A1 and A3, but different occurrence identities. Current content matching
an earlier occurrence is not an attempt to rewind the session.

For new updates, derive an occurrence ID deterministically from the predecessor
occurrence, durable operation identity and current content identity. A standalone
named append uses its existing durable append operation identity. Capture that
choice in the immutable intent; retries reuse it. If current content equals the
selected point's current content, reuse that occurrence without adding a revision.
Do not use wall time or mutable parent-head counters to identify updates.

Extend the existing briefing history representation and algorithm to retain
occurrences in their actual order. Keep immutable same-occurrence checks. Compare
continuations against the selected point's current occurrence; a fork sees only
history through its selected source point. Returning to earlier content creates
an update after that predecessor, so it cannot fail merely because a matching
content hash first appeared earlier. Preserve ordered intermediate updates where
the existing post-fork delivery contract requires them.

Readers of legacy contexts interpret their retained revision entries in recorded
order; no original context, manifest, intent or hash is rewritten. The first new
update records the new occurrence representation in the new intent/context.
Missing ancestry still uses the ordinary unavailable/fresh handling. Legacy retry
remains byte-for-byte original and does not pass through occurrence regeneration.
This is a correction to `buildBriefingDelivery` and its callers, not a second
revision history or independently persisted effective-state map.

## C7. Discovery integration and schema compatibility

The optional source pointers in the main plan use existing `brief:<section key>`
blocks. Agent record fields, candidate provenance and snapshot-access filtering
are independent of instruction deduplication. Missing hints remain optional.
Repeated pointer content, withdrawals and restored pointers obey C2/C6.

New runs capture the expanded producer schemas. Historical record readers accept
missing pointer fields; old operation retry keeps its original packet/schema and
validator identity. Do not mutate an inherited same-name submission declaration
in order to add optional fields. Preserve existing captured-package/restart rules;
this plan adds no hot schema upgrade or fresh fallback for schema conflicts.

Combined qualification must exercise real task construction and session operations,
not just the pure resolver: pointer A → B → A, withdrawal/reintroduction, old-point
forks, ordinary fresh fallback, named appends, immutable retry and candidate-bound
NFR inputs. Distinguish physical inherited bytes from effective current blocks.
