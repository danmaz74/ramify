# Model

The model defines canonical module and original identities, validates the shared tag registry, derives source profiles, and explains visibility and importability from grounded exposure evidence without filesystem, compiler or UI dependencies.

The iteration 3 API is available from `src/index.ts`. `resolveTagRegistry`,
`deriveSourceAreas`, `assignOriginalTags` and `buildModel` return explicit valid
or invalid results. Build a complete model before calling `explainVisibility`
or `explainImport`; questions with unknown originals or inconsistent source
profiles are caller errors. The adapter must classify binding requests and
report missing exports or unresolved access before asking the model.

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
constructed trees. Filesystem and TypeScript source evidence belongs to later
iterations. The legacy `src/model` remains for diagrams until iteration 8.
