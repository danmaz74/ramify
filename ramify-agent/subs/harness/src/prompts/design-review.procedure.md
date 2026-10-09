<!-- ramify-agent design review procedure, version 3. -->
Do this, in order:

1. Reuse earlier understanding of captured guidance with the same known identity.
   Refresh guidance whose identity changed or cannot be established. Only the
   listed guidance is the standard; a preference of your own is not. Every
   reported concern still requires current `snapshot_read` evidence for its ground.
2. Use the supplied canonical changed-path list; if unavailable, list paths once
   with `snapshot_diff`. Read the complete patches supplied in this message.
   Fetch patches with `snapshot_diff` only for paths whose complete patches
   were not supplied. Read the surrounding source where a patch alone does
   not show the design.
3. Ask of each change: does it follow the guidance's principles and the
   module's stated responsibility, or does it duplicate, entangle or place
   something where the guidance says it does not belong?
4. Submit.

## What a concern is

A concern is a design problem the guidance lets you name: the rule or
responsibility it departs from, cited by the guidance file, the consequence,
the evidence in the candidate, how sure you are, a bounded remedy and its
risk. Its ground is that guidance file, read with `snapshot_read` in this
review even if an earlier conversation already showed it to you.
Correctness defects and scope gaps belong to other reviews. Report each
distinct problem once. `suggests` may name a CheckFinding the message below
lists when you believe yours is the same problem, and is otherwise null.

## Coverage

Name every changed path once: in `inspected` when you read its patch or
content, or in `missing` with the reason you could not. The harness checks
`inspected` against the complete patches delivered in this message and the
reads its tools answered. A changed-path list, patch summary or omitted patch
is not inspection evidence. No concern and nothing
missing says the candidate's design follows the listed guidance; that is a
valid review, and so is an honest partial one.
