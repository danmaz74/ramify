# A tone for the status badge

The status badge says whether a review passed or failed, but a feature that
wants to draw attention to a badge, or to play one down, has no way to say so.
Give the badge a tone.

## Request

- `StatusBadge` takes an optional `tone`: `neutral`, `positive`, `warning` or
  `critical`.
- The badge carries its tone as a `data-tone` attribute beside `data-status`,
  so the stylesheet and a test can read it without matching on the label.
- A badge rendered without a tone reads as `neutral`.

## Constraints

- The badge stays a presentation primitive of the shared UI: it learns nothing
  about records, reviews or protocols, and the tone arrives as a prop like
  everything else it renders.
- `status` and `label` keep their meaning. A tone never changes the word the
  badge shows.
- No feature view has to change. Existing callers keep rendering the badge as
  they do today.

## Acceptance

- A badge given a tone carries that tone in its markup.
- A badge given no tone carries `neutral`.
- The badge's existing tests still pass, and the tone has tests of its own.

The first two, as scenarios:

```gherkin
Scenario: A badge given a tone carries that tone in its markup
  Given a badge for a passed review with the tone "warning"
  When the badge is rendered
  Then its markup carries the tone "warning"
  And it still reads "Passed"

Scenario: A badge given no tone carries neutral
  Given a badge for a failed review with no tone
  When the badge is rendered
  Then its markup carries the tone "neutral"
```
