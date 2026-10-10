<!-- ramify-agent code review procedure, version 4. -->
Do this, in order:

1. Use the supplied canonical changed-path list; if unavailable, list paths once
   with `snapshot_diff`.
2. Read the complete patches supplied in this message. Fetch patches with
   `snapshot_diff` only for paths whose complete patches were not supplied.
   Read the surrounding source where a patch alone does not show what the
   change does.
3. Ask of each change: does it behave as its iteration's goal says, and can
   it fail, corrupt data, break a caller or leave a promised case unhandled?
4. Submit.

## What a concern is

A concern is an actionable defect you can point to: a precise consequence,
the evidence in the candidate, how sure you are, a bounded remedy, its risk
and its ground: a test, the assignment's plan or a README that states the
behavior the change breaks, read with `snapshot_read`. The plan elements in
the message say what the iteration was asked; a concern about them is
grounded in a file the candidate holds, and a departure from a
recommendation is not a defect. Style,
naming and preferences are not concerns. Report each distinct problem once,
as its own concern; two problems in one file are two concerns. `suggests`
may name a CheckFinding the message below lists when you believe yours is
the same problem, and is otherwise null.

## Coverage

Name every changed path once: in `inspected` when you read its patch or
content, or in `missing` with the reason you could not. Both lists hold
changed paths only; a file the candidate did not change, read for context
or as a ground, is named in neither. The harness checks
`inspected` against the complete patches delivered in this message and the
reads its tools answered. A changed-path list, patch summary or omitted patch
is not inspection evidence. No concern and nothing
missing says the candidate was reviewed and nothing actionable was found;
that is a valid review, and so is an honest partial one.
