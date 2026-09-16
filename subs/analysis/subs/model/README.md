# Model

The model defines canonical module and original identities, validates the shared tag registry, derives source profiles, and explains visibility and importability from grounded exposure evidence without filesystem, compiler or UI dependencies.

The iteration 3 API is available from `src/index.ts`. `resolveTagRegistry`,
`deriveSourceAreas`, `assignOriginalTags` and `buildModel` return explicit valid
or invalid results. Build a complete model before calling `explainVisibility`
or `explainImport`; questions with unknown originals or inconsistent source
profiles are caller errors. The adapter must classify binding requests and
report missing exports or unresolved access before asking the model.

`listAvailableOriginals` enumerates every foreign original available to a
consumer's source area, sharing `explainImport`'s testing-origin, visibility
and tag-requirement rules through one private requirement helper: an original
is present precisely when at least one of its requests would be
`explainImport`-allowed there, in exactly the `value` or `type-only` form that
request would allow, never both. Same-owner originals are absent; results are
unique by original identity and byte-ordered by owner, then file, then binding.

Module IDs use declared name chains. Original IDs use the original owner,
source-relative file and lexical binding or resource binding. `SourceOrigin.file`
and area roots are project-relative. Derived areas retain intended ordinary
and tests roots even when the corresponding directory is absent. These pure
operations neither read paths nor establish filesystem existence.

The model validates grounded owned and direct-child exposure selections,
including the supplied effective state. It retains ineffective child selections
and their evidence, combines equivalent repeated exposures, and keeps tag
compatibility separate from permission to expose. Visibility explanations retain
one shortest witness per receiving exposure. Import explanations check target,
forwarding and defining origins before same-owner access, then visibility and
all applicable tag requirements.

Results are detached, deeply frozen JSON data. Registry identities include all
definitions and descriptions; no global registry or decision cache is retained.
Unknown header-tag issues identify the supplied owner and source root. The
profile API takes no header coordinates; the future linker must attach its
parsed header span. Explicit symbol assignments already retain supplied spans.

Owned tests include the independently retained shop visibility table and cases
for registry replacement, source profiles, tags, identities, exposure evidence
and testing origins. I1-14 harness assertions consume this public entry over
constructed trees. Presentation adapts its teaching fixtures to this same model
through the declared analysis and root relays; the legacy evaluator is retired.
Filesystem and TypeScript source evidence belongs to the analysis assembly and
its acquisition and compiler adapters.
