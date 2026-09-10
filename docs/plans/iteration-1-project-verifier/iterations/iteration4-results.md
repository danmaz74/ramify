<!-- cucumber-viz: managed artifact — use MCP tool "workflow.write_iteration_results" to make changes -->

# Iteration 4 results: description parser

Status: implementation and focused verification complete, ready for draft publication and automatic regression checks. This iteration establishes description syntax support only; it does not claim linked descriptions, source checking or Plan 1 completion.

## Prerequisites and scope

The workflow detail confirmed iterations 1, 2 and 3 completed with accepted publication before implementation. Iteration 4 requires iteration 2 and uses the reviewed iteration 1 contracts unchanged. All edits, checks and Git operations used the authoritative checkout `/tmp/worktrees/ramify-67e9dd0f/iteration-1-project-verifier`, branch `workflow/iteration-1-project-verifier`, starting revision `17db228`.

The pre-existing control-plane modification to `iteration3-checklist.json` was preserved. It changes only the generated `mcpTool` marker from `workflow.write_iteration_checklist` to `workflow.publish_iteration`; it is excluded from the implementation changes. No prior result, checklist or check outcome was edited.

## Delivered

- Implemented the exact reviewed syntax vocabulary in `subs/analysis/subs/descriptions/src/interfaces/syntax.ts` and public `parseDescription(file, text): ParsedDescription` in `src/parse.ts`.
- Added a local tokenizer and line-oriented parser for the complete version 1 grammar: version/module headers, all three exposure forms, named selections and aliases, complete wildcards, source and child providers, explicit tag clauses and destination lists.
- Tokenization recognizes maximal ASCII words before keyword classification. The exact fourteen keywords require quotes in every name position; keyword prefixes, differently cased export names, `tests`, `dispatch` and project tag names do not become extra keywords. Quoted module names still obey the declared-name spelling constraint.
- Strings decode quote, backslash, slash and Unicode escapes, including immediately paired surrogate escapes. Literal non-ASCII scalar values remain exact without normalization. Empty decoded names/paths and decoded controls are invalid. Unknown/malformed escapes, unpaired raw or escaped surrogates, physical multiline strings and unescaped controls receive located diagnostics.
- One initial BOM, LF/CRLF, optional final newline, spaces/tabs and line comments are supported. Bare CR and unsupported separators are rejected. Comment text is excluded from the token stream as the reviewed syntax variants require; `//` inside a string remains data.
- Every token retains its raw spelling, decoded value and original UTF-16 span. Header, statement, selection, provider and tag-clause spans use the original input, including BOM and CRLF offsets, with one-based lines/columns. Statements retain authored order and indexes. Spans exclude indentation, trailing whitespace and comments.
- Valid results contain the complete located document. Invalid results contain sorted located issues and tokens, with no recovered partial document. Lexical errors are collected across the input; a lexically invalid line is not parsed from incomplete tokens. Grammar recovery proceeds at the next physical line. Every repeated tag/destination item receives its own diagnostic.
- Both result variants are deeply frozen plain JSON data. The parser owns no filesystem/compiler objects, handles, external runtime dependencies or persistent mutable caches.
- Syntactic custom tag names remain valid until registry validation. Decoded paths are preserved without path normalization, probing, alias/extension resolution or wildcard-directory checks. These are acquisition/linking responsibilities.
- Activated descriptions D1/D2 and only the syntax-name portions of analysis A6/root R4 exactly as reviewed. D3/D4, linking vocabulary, analysis assembly and package entries remain at their scheduled stages.
- Added three owned parser test files. They include the exact current texts of all fifteen reference and nine toolkit descriptions read from disk, with independent expected headers and every exposure selection/provider/tag/destination from the contract map and current declaration stage. A fixture inventory assertion detects omitted owners.
- Registered only the real `parse` capability and all 53 exact I1-04 syntax handlers in the existing harness. Each invalid variant first asserts the unchanged reviewed D description; every variant records its own assertions. Expected AST values, reason codes and responsible text are independent literals. No instance inventory or required membership was changed.
- Updated the existing harness invocation/runtime expectation tests for actual parser availability and the full gate's new totals. Documented the parser API, recovery, location conventions and handoff limits.

## Executed matrix evidence

`npm run reference:verify -- --plan 1 --iteration 4` passed with prerequisite closure `[1, 2, 4]`, 53 required/passed instances, 0 failed, 255 not executed and `planComplete: false`. All handlers consume the public text-only parser. No compiler configuration, filesystem ownership or registry evaluation is implied.

The final JSON invocation recorded **2,690 assertions**. Its ignored local report is `examples/collection-review/.reference-work/iteration4-evidence-LgYuxF/verification.json`. This results artifact preserves the portable case summary below.

| Instance | Outcome | Assertions |
| --- | --- | ---: |
| I1-04:syntax-valid/lf | passed | 44 |
| I1-04:syntax-valid/crlf | passed | 44 |
| I1-04:syntax-valid/bom | passed | 44 |
| I1-04:syntax-valid/no-final-newline | passed | 44 |
| I1-04:syntax-valid/comments | passed | 44 |
| I1-04:syntax-valid/string-comment | passed | 44 |
| I1-04:syntax-valid/space-tab | passed | 44 |
| I1-04:syntax-valid/quoted-reserved | passed | 50 |
| I1-04:syntax-valid/keyword-prefix | passed | 52 |
| I1-04:syntax-valid/escaped-quote | passed | 44 |
| I1-04:syntax-valid/escaped-backslash | passed | 44 |
| I1-04:syntax-valid/escaped-slash | passed | 44 |
| I1-04:syntax-valid/unicode-scalar | passed | 44 |
| I1-04:syntax-valid/surrogate-pair | passed | 44 |
| I1-04:syntax-valid/empty-tags | passed | 64 |
| I1-04:syntax-valid/all-destinations | passed | 50 |
| I1-04:syntax-valid/child-wildcard | passed | 69 |
| I1-04:syntax-valid/interface-wildcard | passed | 44 |
| I1-04:syntax-valid/named-test | passed | 89 |
| I1-04:syntax-valid/custom-tag | passed | 56 |
| I1-04:syntax-invalid/version | passed | 51 |
| I1-04:syntax-invalid/missing-version | passed | 51 |
| I1-04:syntax-invalid/header-order | passed | 51 |
| I1-04:syntax-invalid/unknown-clause | passed | 51 |
| I1-04:syntax-invalid/semicolon | passed | 51 |
| I1-04:syntax-invalid/test-profile | passed | 51 |
| I1-04:syntax-invalid/bare-cr | passed | 51 |
| I1-04:syntax-invalid/interior-bom | passed | 51 |
| I1-04:syntax-invalid/double-bom | passed | 52 |
| I1-04:syntax-invalid/unknown-escape | passed | 51 |
| I1-04:syntax-invalid/isolated-high-surrogate | passed | 51 |
| I1-04:syntax-invalid/isolated-low-surrogate | passed | 51 |
| I1-04:syntax-invalid/escaped-control | passed | 51 |
| I1-04:syntax-invalid/delete-control | passed | 51 |
| I1-04:syntax-invalid/empty-name | passed | 51 |
| I1-04:syntax-invalid/empty-path | passed | 51 |
| I1-04:syntax-invalid/unquoted-reserved | passed | 51 |
| I1-04:syntax-invalid/quoted-tag | passed | 51 |
| I1-04:syntax-invalid/quoted-destination | passed | 51 |
| I1-04:syntax-invalid/duplicate-tag | passed | 52 |
| I1-04:syntax-invalid/duplicate-destination | passed | 52 |
| I1-04:syntax-invalid/trailing-selection-comma | passed | 51 |
| I1-04:syntax-invalid/trailing-tag-comma | passed | 51 |
| I1-04:syntax-invalid/trailing-destination-comma | passed | 52 |
| I1-04:syntax-invalid/wildcard-mixed | passed | 51 |
| I1-04:syntax-invalid/wildcard-alias | passed | 51 |
| I1-04:syntax-invalid/child-tag-override | passed | 51 |
| I1-04:syntax-invalid/multiline-statement | passed | 51 |
| I1-04:syntax-invalid/non-ascii-whitespace | passed | 51 |
| I1-04:syntax-invalid/invalid-module-name | passed | 51 |
| I1-04:syntax-invalid/missing-source | passed | 51 |
| I1-04:syntax-invalid/missing-destination | passed | 52 |
| I1-04:syntax-invalid/json-object | passed | 51 |

## Verification performed

Passed:

- `npm run worktree:prepare`.
- `npm run type-check`, including toolkit, portable owners, independent scripts and harness. Final execution passed after all source/test changes.
- `npm run build`.
- `npx vitest run subs/analysis/subs/descriptions/src/tests/grammar.test.ts subs/analysis/subs/descriptions/src/tests/locations.test.ts subs/analysis/subs/descriptions/src/tests/descriptions.test.ts`: **3 files, 175 tests passed**, Vitest 4.1.11, final reported duration 272 ms.
- `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/runner.test.ts scripts/reference-harness/verify.test.ts -t 'runs the model and parser instances|reports actual model/parser execution'`: **4 amended/new tests passed**; 29 existing tests were unselected by the focused filter and remain delegated to automation.
- `npm run reference:verify -- --plan 1 --iteration 4`: exit 0. The final direct Node/tsx JSON invocation of the same verifier also exited 0 with empty stderr and the individual results above.
- The focused invocation tests exercised real harness subprocesses for iteration 3 (14 model instances, exit 0), iteration 4 (53 parser instances, exit 0) and the unfiltered gate (67 executed model/parser instances, 241 pending, exit 1). All retain `planComplete: false`. The full gate still correctly fails for absent future capabilities.
- `npx tsx scripts/reference-harness/validate.ts`: 308 instance records, pointers and prerequisites valid. This is inventory validation, not conformance execution.
- Exact comparison of the syntax interface with the reviewed TypeScript block and of D1/D2 plus the A6/R4 syntax portions with `owners.md`: all match.
- Inspection of emitted imports starting at `dist/subs/analysis/subs/descriptions/src/parse.js` found exactly **2 local runtime modules**, `parse.js` and `tokenize.js`, with no external, Node, compiler, UI, dynamic-import, require or test dependencies. A real Node ESM import confirmed only the reviewed `parseDescription` export and a valid parsed header.
- `git diff --check` and staged diff inspection. No legacy model/viz, example application, diagram/site, package/configuration, reviewed plan or unrelated runtime changes were introduced.

The first focused parser run had 172 passing tests and two failures. One fixture had an incorrect hard-coded statement end offset; it was corrected from 124 to the original text's 119. The other exposed an extra empty-name diagnostic generated from an invalid escape's incomplete decoded string. Lexically invalid lines now retain their lexical diagnostics without interpreting incomplete tokens. The failing cases were rerun successfully, and the final complete new-parser suite passed with 175 tests. No new test failure remains.

The supplied automatic-check policy takes precedence over the iteration's broad `npm test` command: full toolkit/harness Vitest, Cucumber, scenario coverage and sealed-file checks were not run locally. Their automatic outcomes are not claimed here.

## Handoff and limits

Iteration 5 can inject `parseDescription` through the reviewed `DescriptionParser` contract, retain raw header tags and consume exact decoded `from.value` paths. It must perform UTF-8 byte validation before supplying text; the parser cannot distinguish a real replacement scalar from a lossy decoder's replacement. Invalid parsed descriptions must remain invalid acquisition input, with original reason codes and spans.

Iteration 7 can consume located selections and explicit assignments in source order while computing order-independent semantics. An omitted statement tag clause is `null`; `tagged []` preserves an explicit empty set. A bare wildcard has its own discriminant and span; quoted `"*"` remains a named selection. Header omission versus an empty tag list remains visible in the token stream, as the reviewed header contract requires.

This iteration does not validate registry membership, source areas, path containment, exact file existence, symlinks, wildcard file eligibility, source exports, original identity, child existence, tag assignment agreement or exposure permissions. No compiler, acquisition, linker, checker, CLI, daemon or server implementation was added.

## Recommendations for Next Iteration

1. Inject this text-only parser into acquisition and preserve its located invalid result. Do not turn parse failures into guessed ownership.
2. Validate UTF-8 bytes and paths in acquisition without changing parser string decoding or doing source-style extension/alias probing.
3. Continue staging declarations alongside their real exports. Linking and its vocabulary remain iteration 7 work; no placeholder exports are needed.
4. Run the delegated automatic regressions before accepting the draft. Keep the full Plan 1 gate failing until every future required instance executes.
