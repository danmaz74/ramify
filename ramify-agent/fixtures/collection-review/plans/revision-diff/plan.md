# Compare two revisions of a record

A catalog record keeps a history of revisions, but today a person can only see
the current one. Reviewers want to see what changed between two revisions
before they trust a review result.

## Request

- Add a comparison of two revisions of the same record: for each field, the
  value before, the value after, and whether it changed.
- Serve it through both protocol surfaces: a tRPC query `catalog.compare` and
  an MCP tool `catalog.compare`, both taking a record ID and two revision IDs.
- In the browser, each record card offers "Compare with previous" when the
  record has a predecessor revision, and shows the changed fields inline.

## Constraints

- A revision chain whose predecessor resolves to no revision must produce a
  clear error, not an empty comparison.
- The comparison is read-only. It never changes a record or a review.
- The pure view stays free of protocol knowledge, as it is today.

## Acceptance

- Comparing the intact record's two revisions lists exactly the fields that
  differ.
- Comparing across the broken chain reports the missing revision by ID.
- The browser card shows the comparison without a page reload.
