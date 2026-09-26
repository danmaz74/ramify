# Import denials that explain themselves

When `ramify check` denies an import, its message is an internal key. The
reader, often an agent that has just made the edit, cannot act on it without
knowing Ramify's source. Make every import denial state, in its own text, what
was imported, from where, which rule fails and what the project declares about
it. Print that text the same way in the hook form as in the full report.

## What a reader gets today

Planted in a sample project, `runtime.ts` of module `app/reviews/core`
imports `findRecord`. Module `app/catalog/core` declares that function and
does not expose it. `ramify check` prints:

```text
Error [not-visible] subs/reviews/subs/core/src/runtime.ts:1:10: app/catalog/core:records.ts#findRecord: not-visible
  Importer: app/reviews/core (ordinary; tags: none)
  Original: app/catalog/core/records.ts#findRecord
  Related: subs/catalog/subs/core/src/records.ts:50:1
```

The hook form, `ramify check --changed <file>`, prints only the first line.
The other denial codes read the same way:

- `required-importer-tag` ends in `: required-importer-tag (ui)`.
- `required-symbol-tag` ends in `: required-symbol-tag (browser)`.
- `testing-origin` ends in `testing-origin via <path>, <path>`, and prints
  the same path twice.
- `missing-export` already reads as a sentence, for example
  `…/vocabulary.ts has no export named reviewVerdictSchema`. It names no
  alternative.

`related` is a flat list with no labels. A not-checked reply names only its
reason code, such as `Not checked (configuration-changed)`, and drops the
explanation the daemon already has.

## Request

1. **The five denial codes explain themselves.** For `not-visible`,
   `required-importer-tag`, `required-symbol-tag`, `testing-origin` and
   `missing-export`, `message` is one paragraph that states:

   | Code | The message states |
   | --- | --- |
   | `not-visible` | the importing file, the symbol, the file that declares it, and its owning module; that the owner does not expose it to the importing module, so the import is denied; that a type-only import needs the same exposure |
   | `required-importer-tag` | the same identification; the tag the symbol carries and that it is a required-importer tag; the importing area's own tags; that a type-only import needs the tag too |
   | `required-symbol-tag` | the same identification; the importing area's tag and that it is a required-symbol tag; that the symbol lacks it; that this rule does not restrict a type-only import |
   | `testing-origin` | that ordinary source reaches testing source, through which files, and that this holds for same-owner and type-only imports too |
   | `missing-export` | the file or child imported from, the name, and whether that export description is complete or not established; both producers of the code use one wording |

2. **Each of these diagnostics carries `details`,** a list of labelled lines:

   | Code | `details` |
   | --- | --- |
   | `not-visible` | each exposure of the original, with its destination and why it does not reach the importer (another destination, an ancestor on the way that does not re-expose it, or ineffective), or `none`; then the names the importing module already receives from that file |
   | `required-importer-tag`, `required-symbol-tag` | where the tag is assigned |
   | `testing-origin` | the blocking origins in order, each once |
   | `missing-export` | the exported names nearest to the requested one, at most five |

3. **Every related location carries a role.** The roles are
   `original-declaration`, `exposure`, `ineffective-exposure`,
   `tag-evidence`, `blocking-origin`, `statement` and `other`.

4. **A proposal, where exactly one change fixes the denial.** A
   `not-visible` diagnostic has a `proposal` when an existing `expose-src`
   statement for the same file already has a destination that reaches the
   importer, and adding the name to that statement satisfies the rule. The
   proposal names the statement's location and the name to add. In every other
   case, including a denial that needs a second hop, `proposal` is `null` and
   a `details` line names the missing hops.

5. **One block, in both human forms.** The full report and the hook form
   print the same block for each diagnostic:
   1. the header line;
   2. the `message`;
   3. `Importer:` and `Original:`;
   4. each `details` line;
   5. each related location with its role;
   6. the proposal, under the fixed label
      `Proposed declaration (not an existing permission)`.

   The hook form stops dropping lines. Its warning line uses the same
   singular or plural and the same file list as the full report's.

6. **A not-checked reply explains itself.** The changed-check document carries
   `reasonMessage`, the provider's own explanation of `reason`, or `null`.
   The human form prints `Not checked (<reason>): <reasonMessage>`, then a
   fixed sentence saying that nothing was verified and that this is not a pass.

## Constraints

- **Nothing about what is allowed or denied changes,** and neither do exit
  codes. The model's principles documents are not edited.
- **The report's schema identities stay** `ramify.analysis/1` and
  `ramify.check/1`. Every diagnostic in JSON output, of any code, carries
  `details` (`[]` when empty), `proposal` (`null` when none) and a role on
  each related location. A diagnostic outside the denial family keeps its
  message and gets empty values.
- **`message` is not a stable interface.** The
  [CLI invocation contract](../../docs/architecture/cli-invocation.spec.md)
  says so and describes the block. The compact reply in
  [daemon.md](../../docs/architecture/daemon.md) lists the new fields.
  Rewording may change a finding's id once. Retained daemon state does not
  outlive a version.
- **Wording rules:**
  - Use the model's vocabulary only. A module exposes a symbol to its parent
    or to its descendants, and the other side receives it. A tag is named
    with its kind. The text never names a consumer's workflow, role or tool.
  - A module is named by its declared path, a file by its project-relative
    path, and a symbol in backticks. The `owner:file#binding` form never
    appears in text.
  - State the fact first, then the consequence: "does not expose it to …, so
    the import is denied".
  - A proposal appears only in `proposal`, never in `message` or `details`.
- **Size limits:**
  - `message` is one paragraph of at most 400 characters.
  - `details` holds at most 8 lines of at most 300 characters each.
  - A list of names is cut at 20, with the remaining count stated.
- **Determinism:** the same revision produces the same bytes, and lists are
  sorted.
- **Tests and harness:**
  - Tests that match today's text are updated along with it.
  - The reference harness's renderer, `scripts/reference-harness/report.ts`,
    prints the same block.
  - `npm run check:self` and the reference harness pass.

## Out of scope

- Rewording description, layout, registry, model and analysis-limit messages,
  and `exposed-without-companion`. They get the new fields with empty values.
- A catalogue of every code's wording.
- `ramify explain`, and any proposal needing more than one declaration
  change.
- Consumers' own per-code sentences. A consumer changes separately to relay
  `message`, `details` and `proposal`.

## Acceptance

- Each denial code, planted in a test project, prints the block in both
  human forms. The block names the importing file, the symbol, its file and
  owning module, and the failed rule, and contains no `owner:file#binding`
  key.
- A `not-visible` denial with one missing statement change has a proposal. A
  denial that needs two hops has none, and a `details` line names the missing
  hops.
- A `not-visible` denial with 50 exposures and 50 received names stays within
  the size limits, and its cut lists state the remaining count.
- The JSON output carries `details`, `proposal` and related roles for every
  diagnostic.
- A not-checked hook reply prints the provider's explanation.

```gherkin
Scenario: A hook check explains an import its owner does not expose
  Given a module that imports a function another module declares and exposes to no one
  When the hook form checks the importing file
  Then the reply names the importing file, the function, its file and its owning module
  And it says the owner does not expose the function to the importing module, so the import is denied
  And it lists the function's exposures as none
  And it contains no key of the form `owner:file#binding`, such as `app/catalog/core:records.ts#findRecord`

Scenario: A proposal where one statement change fixes the denial
  Given a module that imports a function from a file whose owner exposes other names of that file to the importer
  When the hook form checks the importing file
  Then the reply proposes adding the function to that exposure statement
  And it labels the proposal as not an existing permission

Scenario: No proposal where two hops are missing
  Given a module that imports a function its owner exposes to its parent, and the parent does not re-expose it
  When the hook form checks the importing file
  Then the reply has no proposal
  And it names the ancestor that does not re-expose the function

Scenario: A tag denial names the tag and its kind
  Given a module without the ui tag that imports a component whose source area carries the ui tag
  When the hook form checks the importing file
  Then the reply says the component carries ui, a required-importer tag, which the importing module lacks
  And it names where the tag is assigned

Scenario: A testing-origin denial lists each blocking origin once
  Given ordinary source that imports a fixture from another module's tests
  When the full check runs
  Then the reply says ordinary source may not reach testing source
  And each blocking origin appears once

Scenario: A not-checked reply explains why
  Given a resident check after the compiler configuration changed
  When the hook form checks a file
  Then the reply says it was not checked because the configuration changed, with the provider's explanation
  And it says nothing was verified and this is not a pass
```
