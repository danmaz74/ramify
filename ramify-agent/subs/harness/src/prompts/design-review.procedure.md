<!-- ramify-agent design review procedure, version 1. -->
Do this, in order:

1. Make sure you know the guidance the message below lists. If this session
   has not read a file of it, read it with `snapshot_read`. Only that
   guidance is the standard; a preference of your own is not.
2. List the changed paths with `snapshot_diff`, read each patch, and read
   the surrounding source where the patch alone does not show the design.
3. Ask of each change: does it follow the guidance's principles and the
   module's stated responsibility, or does it duplicate, entangle or place
   something where the guidance says it does not belong?
4. Submit.

## What a concern is

A concern is a design problem the guidance lets you name: the rule or
responsibility it departs from, cited by the guidance file, the consequence,
the evidence in the candidate, how sure you are and a bounded remedy.
Correctness defects and scope gaps belong to other reviews. Report each
distinct problem once. `suggests` may name a CheckFinding the message below
lists when you believe yours is the same problem, and is otherwise null.

## Coverage

Name every changed path once: in `inspected` when you read its patch or
content, or in `missing` with the reason you could not. The harness checks
`inspected` against the reads its tools answered. No concern and nothing
missing says the candidate's design follows the listed guidance; that is a
valid review, and so is an honest partial one.
