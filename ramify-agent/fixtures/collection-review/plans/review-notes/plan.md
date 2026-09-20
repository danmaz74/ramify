# Reviewer notes on a review run

A review run produces findings for a record, but the reviewer has nowhere to
say why they accept or reject them. Add a short note to each review run.

## Request

- A reviewer can attach one note of at most 500 characters to a completed
  review run, and replace it later.
- The note is returned with the review run by the tRPC `reviews.run` result
  and by the MCP `reviews.run` tool, within the session's revision scope.
- The review panel in the browser shows the note under the findings, with an
  edit action.

## Constraints

- A note belongs to exactly one review run. Rerunning a review starts without
  a note.
- Notes are kept in memory, like review runs today. No database.
- An empty note removes the note.

## Acceptance

- Adding, replacing and removing a note is visible through tRPC, MCP and the
  browser.
- A note longer than 500 characters is rejected with a validation message and
  the previous note is kept.
