# Architect notes: why-import

## Plan requirements with no schema field

- Exit codes, the never-writes rule and "ordinary checks do no added work" are
  cross-cutting constraints. They fit only inside `summary.preserves` and inside
  individual goal paragraphs, so they are repeated rather than stated once.
- The plan's "out of scope" list (writing declarations, explaining an existing
  violation, MCP, visibility without an import) has no field at all. I folded the
  writing prohibition into goals and dropped the rest; a later reader cannot tell
  from the map that they were considered and excluded.
- The four acceptance bullets are feature-level and belong to no single module. I
  turned them into one capability owned by the integration owner plus the entry
  point's acceptance sentence; the mapping from bullet to evidence is lost.
- The reference example the acceptance depends on lies outside every module's
  source area, so no `modulesTouched` entry can represent it.
- Ordering between work items (vocabulary before the surfaces that use it) has no
  field; only the seams hint at it.

## What an engineer at the entry point would still need

- Which work item lands first and what each may assume of the others. The map
  gives seams but no sequence and no interim contract.
- The shape of the answer that crosses every seam. Each side's goal describes the
  same answer in prose; nothing records one agreed shape, so two engineers can
  satisfy their goals and still disagree.
- Where the reference cases live and who adds them.
- The revision/identity story: the answer must name a revision, but the map has no
  place to say what the batch path names when there is no resident revision.

## Work-item roots

- The dispatch vocabulary is owned by the project root, so its work item is rooted
  at `ramify`. That root swallows every other item's subtree, which is misleading;
  I kept it separate and small rather than merging it into the daemon item,
  because the command line and the browser owner consume it too.
- The daemon item is rooted at `ramify/daemon`, not at `ramify/daemon/contexts`:
  the operation and the revision-bound answer change together and the parent is
  the lower common root of both.
- The panel and the page are one feature but two branches, so they are two items
  joined at a seam, as the procedure requires.

## Commands

No command was denied. I ran no materialization: every API view I needed was
already present, so I used it, as the spike's substitution permits. No proposal
was verified with a check, and I ran no validator over the submission.
