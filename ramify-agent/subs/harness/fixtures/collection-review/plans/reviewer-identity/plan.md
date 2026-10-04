# Who reviewed a record

A review result says what was reviewed and what it found, but not who
reviewed it. Two reviewers looking at the same record produce results nothing
tells apart, and neither surface carries a reviewer at all.

## Request

- Every review run is attributed to a reviewer, and the attribution is
  structured: an identifier, a display name and the reviewer's role. A plain
  name string is not enough — the surfaces have to be able to tell two people
  with the same display name apart, and the browser has to show the role.
- `ReviewOutcome` carries the structured reviewer. It replaces the plain
  reviewer field a staged migration may introduce on the way; the final state
  has one representation, not two.
- Both protocol surfaces carry it. The tRPC `reviews.run` mutation takes the
  reviewer with the request; the MCP `reviews.run` tool binds the reviewer to
  the session, as it binds the revision scope today, and reports it with the
  outcome.
- The review panel shows the reviewer's display name and role above the
  verdict.

## Constraints

- This is a breaking change. The reviewer is required, not optional: a review
  with no reviewer is not a review, and nothing may fall back to a placeholder
  reviewer to keep an old caller compiling.
- The change runs through four owners: the review runtime that defines the
  outcome, the feature that adapts it to both surfaces, and the two views
  beneath it. Every intermediate state compiles, and every test of the project
  passes at each one.
- The pure view stays free of protocol knowledge and of the runtime's own
  vocabulary, as it is today: what crosses that boundary is the shared
  vocabulary both sides are written in.
- Reviewers are supplied by the caller. No registry, no persistence, no
  database.

## Acceptance

- A review run through tRPC answers the reviewer it was given, with all three
  parts.
- An MCP session bound to a reviewer reports that reviewer on every later
  call, and rebinding replaces it.
- The review panel shows the reviewer's display name and role.
- Nothing in the tree still reads a plain reviewer field: the old
  representation is gone, not deprecated.
