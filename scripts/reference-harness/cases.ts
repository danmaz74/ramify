/**
 * The reference project's case inventory.
 *
 * One record per case family in `docs/plans/reference-project/cases.md`. The
 * catalogue states what each family must witness; this file states, for each
 * of them, what the baseline authored, which capability the expectation needs,
 * and whether that capability exists yet. It is harness data: it is not a
 * second `module.ramify` format, not a permission language, and not a place to
 * calculate an expected result by asking the checker under test.
 *
 * Two axes are kept apart here, as the
 * [harness plan](../../docs/plans/reference-project/harness.md) requires.
 * `authority` says whether an expectation is binding and at what scope;
 * `implementation` says whether anything can perform the analysis. A family
 * whose capability is absent is reported as **not executed**, never as passed
 * and never as a skip that disappears from a summary. Execution status is not
 * stored here at all: `report.ts` derives it from the tiers it actually ran.
 */

/**
 * How a case is exercised, using the catalogue's letters:
 *
 * - `B` the clean runnable baseline
 * - `M` a focused temporary mutation of a copy
 * - `C` a real tool compatibility fixture
 * - `H` a small generic host-adapter contract
 * - `P` a comparison of an undecided design
 * - `E` a separate responsibility, recorded rather than enforced
 *
 * The catalogue writes this column as `Mode / authority`; the retained
 * policies X01 and X02 give one letter, `E`, which is both.
 */
export type CaseMode = 'B' | 'M' | 'C' | 'H' | 'P' | 'E';

/**
 * What an expected result is worth:
 *
 * - `A` a definitive model, layout, source-interpretation or reporting rule
 * - `D` a definitive reference-project design, not a universal Ramify rule
 * - `P` a genuinely undecided alternative, with no normative pass or fail
 * - `E` an independent policy, verifier or host responsibility
 */
export type CaseAuthority = 'A' | 'D' | 'P' | 'E';

/**
 * The capability a case's expectation needs before it can be executed.
 *
 * A case is listed under the capability its own assertion is about. Where an
 * absent capability sits behind another one — nearly every model case also
 * needs the loader before it can read this reference — the prerequisite is
 * named in `coverageNotes` rather than changing the grouping.
 *
 * - `application` the example's own application tier: its independent
 *   TypeScript check, in-memory tests, Node entry and Vite build.
 * - `protocol` real typed tRPC request/client checks and MCP client/server
 *   list and call tests over the example's own transports, plus the source
 *   ownership review of its adapters.
 * - `model` supported evaluator queries over known originals, exposure
 *   arrangements and profiles, without a parser or source integration.
 * - `source-areas` evaluator support for a module's two owned source areas and
 *   the fixed `src/tests/` profile derived from its header.
 * - `custom-registry` a resolved tag registry carrying project-defined names
 *   of both fixed rule kinds.
 * - `loader` filesystem discovery and the `module.ramify` parser, including
 *   the real export descriptions an interface-file wildcard expands.
 * - `resolver` resolution of the original binding, resource or forwarding
 *   alias behind an import specifier.
 * - `source-form` the TypeScript source checker's treatment of a written
 *   import or export construct, and the diagnostics it reports.
 * - `browser` execution of the real browser and tool compatibility suite.
 * - `host-adapter` a generic host-integration adapter over the model.
 * - `probe` a comparison of an undecided alternative design.
 * - `separate-responsibility` a policy or verifier outside Ramify's import
 *   predicate, which Ramify deliberately does not analyse.
 */
export type CaseCapability =
  | 'application'
  | 'protocol'
  | 'model'
  | 'source-areas'
  | 'custom-registry'
  | 'loader'
  | 'resolver'
  | 'source-form'
  | 'browser'
  | 'host-adapter'
  | 'probe'
  | 'separate-responsibility';

/** Whether a checker can perform the analysis this case asks for. */
export type ImplementationStatus = 'available' | 'absent' | 'deliberately-unsupported';

/**
 * Where the baseline authored the case.
 *
 * - `baseline-source` a file of the example that carries the case.
 * - `baseline-declaration` a `module.ramify` statement, identified by the id
 *   the contract map gives it.
 * - `document` no baseline artifact: the pointer is the document that states
 *   the expectation. Used where a case needs a mutation, a fixture or an
 *   adapter that does not exist yet.
 */
export type WitnessKind = 'baseline-source' | 'baseline-declaration' | 'document';

/** A pointer at what carries the case today. Every path must exist on disk. */
export interface BaselineWitness {
  readonly kind: WitnessKind;
  /** Repository-relative paths, from the Ramify root. */
  readonly paths: readonly string[];
  /** Statement ids from `docs/plans/reference-project/contract-map.md`. */
  readonly statements?: readonly string[];
  /** What the witness establishes, in one line. */
  readonly note: string;
}

/** One case family from the catalogue. */
export interface ReferenceCase {
  /** The catalogue's family id, such as `E07`. */
  readonly id: string;
  /** What the family is about, in one line. */
  readonly intent: string;
  readonly mode: readonly CaseMode[];
  readonly authority: readonly CaseAuthority[];
  /** The baseline entry, or the mutation, overlay or fixture the case needs. */
  readonly entry: string;
  readonly capability: CaseCapability;
  /** The supported result and the identities that matter in it. */
  readonly expected: string;
  /** What the result would and would not establish; what has run so far. */
  readonly coverageNotes: string;
  readonly implementation: ImplementationStatus;
  readonly baselineWitness: BaselineWitness;
}

const example = 'examples/collection-review';
const workspace = `${example}/subs/workspace`;
const catalog = `${workspace}/subs/catalog`;
const reviews = `${workspace}/subs/reviews`;
const reviewCore = `${reviews}/subs/core`;
const plans = 'docs/plans/reference-project';
const model = 'docs/model';

/** Every capability, in the order the report groups by. */
export const capabilityOrder: readonly CaseCapability[] = [
  'application',
  'protocol',
  'model',
  'source-areas',
  'custom-registry',
  'loader',
  'resolver',
  'source-form',
  'browser',
  'host-adapter',
  'probe',
  'separate-responsibility',
];

/** One line per capability, for the report's grouped inventory. */
export const capabilityDescriptions: Readonly<Record<CaseCapability, string>> = {
  application: "the example's TypeScript check, in-memory tests, Node entry and Vite build",
  protocol: 'real typed tRPC client checks and MCP list/call sessions over the example',
  model: 'evaluator queries over originals, exposure arrangements and profiles',
  'source-areas': "the two owned source areas and the derived `src/tests/` profile",
  'custom-registry': 'a resolved registry carrying project-defined tag names',
  loader: 'filesystem discovery, the description parser and real export descriptions',
  resolver: 'the original binding, resource or alias behind an import specifier',
  'source-form': 'the source checker on one written construct, and its diagnostics',
  browser: 'the real browser and tool compatibility suite',
  'host-adapter': 'a generic host-integration adapter over the model',
  probe: 'a comparison of an undecided alternative design',
  'separate-responsibility': "a policy outside Ramify's import predicate",
};

export const referenceCases: readonly ReferenceCase[] = [
  // ---------------------------------------------------------------- Ownership
  {
    id: 'L01',
    intent: 'Every source, test and resource has exactly one owner under `src/`.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      'The baseline tree: fourteen descriptions, each owning the `src/` beside it, with nested `src/tests/` and `src/interfaces/` areas and children only under `subs/`. The mutation puts a description inside a `src/`.',
    capability: 'loader',
    expected:
      'Discovery attributes each file to the deepest owning module, classifies `src/tests/` once with its testing profile and `src/interfaces/` with the ordinary one, keeps a child separate, and reports a description inside `src/` as invalid rather than attributing its files to the parent.',
    coverageNotes:
      'The baseline half is authored and hand-checked against the plan checklist; nothing has read it. The invalid-description half needs a temporary copy the mutation runner will make.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${example}/module.ramify`, `${catalog}/subs/core/module.ramify`],
      note: 'The root description and one leaf owner with both an ordinary `src/` and a nested `src/tests/`; all fourteen owners repeat the shape.',
    },
  },
  {
    id: 'L02',
    intent: 'Ownership errors and outside-source warnings remain distinct.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'Copies with the root description removed, a child description made invalid, two siblings sharing a declared name, a syntactically valid stray `tests/module.ramify` beside selected `tests/helper.ts`, and compiler-selected project source loose under `subs/`.',
    capability: 'loader',
    expected:
      'Description faults, including the stray description with valid contents, are located errors: no file is re-attributed to a guessed ancestor owner and no valid model is published. Loose source under `subs/` produces a warning without invalidating the tree and receives no owned source-area classification.',
    coverageNotes:
      'A pure mutation family: the baseline authors nothing for it. Neither the mutation runner nor the parser exists.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [
        `${model}/module-description.principles.md`,
        'docs/architecture/cli-invocation.md',
      ],
      note: 'The principles define invalid descriptions and source claims; the CLI contract defines outside-source warnings.',
    },
  },
  {
    id: 'L03',
    intent: "An empty owner still has its own `src/` implementation scope.",
    mode: ['M', 'H'],
    authority: ['A'],
    entry:
      'A variant tree with an owner that has no source yet, read through the module-information adapter.',
    capability: 'loader',
    expected:
      'The implementation scope is exactly `<module>/src/`, created before work when absent and never replaced by the module root or `subs/`; a search of it excludes child implementations; test and metadata scopes are separate; no `index.ts`, package or build is required per owner.',
    coverageNotes:
      'The baseline has no empty owner, and the adapter this case reads through is H03/H01 work. Needs the loader first.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${model}/module-description.principles.md`],
      note: 'The required-layout principle, including the rule that a missing `src/` is created rather than substituted.',
    },
  },
  {
    id: 'L04',
    intent: 'Declared identity survives a move through a grouping directory.',
    mode: ['M', 'H'],
    authority: ['A'],
    entry:
      'One copy that moves a child under an ordinary grouping directory beneath the same `subs/`, and one that renames or reparents it.',
    capability: 'loader',
    expected:
      "The identifier is unchanged by the move and changes on rename or reparent; grouping directories contribute no identifier segment; a parent's `expose-sub` reference keeps working because it names the child, not a path.",
    coverageNotes:
      'The baseline uses no grouping directory, so the positive half needs the copy as well. Historical-reference migration stays explicit host work.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${model}/module-description.principles.md`],
      note: 'The identifier rules for declared names, grouping directories and reparenting.',
    },
  },
  {
    id: 'L05',
    intent: 'Source-reference roots, collisions and small parser inputs.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'Copies exercising the two reference roots, a missing export, a `..` escape, an alias collision and duplicate declarations, plus small parser inputs for quoting, comments and the version token, and a child declared `module tests tagged [testing]`.',
    capability: 'loader',
    expected:
      '`expose-src` resolves from `src/` and `expose-test` from `src/tests/`; a test file selected through either form keeps one identity and its testing tags; each malformed declaration is diagnosed; `tests` is an ordinary bare name while the reserved `testing` requires quotes.',
    coverageNotes:
      'The baseline uses both reference roots correctly, which is L05’s positive shape, but no negative and no parser input has been run.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${example}/module.ramify`, `${catalog}/subs/core/module.ramify`],
      statements: ['R1', 'R2', 'K1', 'K2'],
      note: 'The four statements that use the two reference roots: `expose-src` from `src/`, `expose-test` from `src/tests/`.',
    },
  },
  {
    id: 'L06',
    intent: 'Version 1 rejects symlinked roots, descriptions and `from` paths.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'Filesystem fixtures with an actual symlinked root, an actual symlinked description, and a `from` path that traverses a directory symlink.',
    capability: 'loader',
    expected:
      'Each is a validation error, and discovery does not traverse directory symlinks; a filesystem alias never introduces a second ownership tree or lets a reference escape its checked boundary.',
    coverageNotes:
      'Deliberately filesystem fixtures rather than parser strings, so this family cannot be approximated by an in-memory model.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${model}/module-description.principles.md`],
      note: 'The discovery principle that fixes the version 1 symlink policy.',
    },
  },
  {
    id: 'L07',
    intent: '`src/interfaces/` is ordinary source of its owner.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`contracts/src/interfaces/vocabulary.ts` and the wildcard that selects it; mutations move a binding into a second, unselected interface file, add compiler-selected source at sibling `tests/` and `interfaces/`, and add an ordinary `src/helpers/tests/`.",
    capability: 'loader',
    expected:
      'The wildcard covers the named file alone; a binding moved into an unselected file is neither exposed nor reclassified; compiler-selected source at sibling `tests/` or `interfaces/` produces warnings without failing layout validation and receives no owned source-area classification; `src/helpers/tests/` keeps the ordinary profile.',
    coverageNotes:
      'The baseline half is authored; every assertion needs the loader, and the added-export half overlaps E07.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${workspace}/subs/contracts/src/interfaces/vocabulary.ts`,
        `${workspace}/subs/contracts/module.ramify`,
      ],
      statements: ['C1'],
      note: 'The one interface file in the tree and the wildcard that selects it.',
    },
  },

  // ----------------------------------------------------------------- Exposure
  {
    id: 'E01',
    intent: 'Parent, sibling-through-ancestor and deeper-descendant routes work.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "The baseline's routes: catalog core upward to its adapter, the shared vocabulary down from `workspace` into every descendant, and the catalog fixture relayed into a review test.",
    capability: 'model',
    expected:
      'Each route makes its original visible exactly where the contract map records it; an exported symbol no statement selects stays private across owners; same-owner imports remain allowed once the testing-origin guard passes.',
    coverageNotes:
      "The positive routes are what the example compiles and runs on, so they are exercised by the application and protocol tiers. Nothing has evaluated them as exposure, and the private-across-owners half needs the source checker. Also needs the loader to read this tree.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${workspace}/module.ramify`, `${catalog}/subs/core/module.ramify`],
      statements: ['K1', 'K2', 'C1', 'W1', 'A4', 'W3'],
      note: 'One upward route, one downward route and the three-hop fixture relay.',
    },
  },
  {
    id: 'E02',
    intent: 'Removing one upward hop removes the original from the root.',
    mode: ['M'],
    authority: ['A'],
    entry:
      "A copy with one upward adapter hop deleted, leaving the root's source import unchanged; then the hop restored.",
    capability: 'model',
    expected:
      'The root loses the original even though its tags match, and the source import that still names it becomes a definite violation; restoring the hop restores access without touching source.',
    coverageNotes:
      'The mutation edits a baseline declaration, so the family already has its positive half on disk; the negative needs the mutation runner and the source checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${catalog}/module.ramify`, `${workspace}/module.ramify`],
      statements: ['A1', 'W2'],
      note: 'The two-hop route from the catalog adapter to the root that the mutation breaks.',
    },
  },
  {
    id: 'E03',
    intent: 'Downward exposure reaches the whole subtree, and no further.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`workspace`'s two downward relays and the review runtime's local one; mutations add a redundant relay and try to carry a descendant-only symbol above its owner.",
    capability: 'model',
    expected:
      'One exposure to descendants reaches every depth and branch, including the branch a re-exposed symbol arrived from; a descendant cannot carry it above the exposing owner; a redundant relay adds nothing.',
    coverageNotes:
      "The baseline's downward routes are used by real imports; the escape and redundancy halves need the evaluator over the real tree.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${workspace}/module.ramify`, `${reviewCore}/module.ramify`],
      statements: ['W1', 'W5', 'RC3', 'RV4'],
      note: 'Two shell-level downward relays and the runtime-local one that joins two children.',
    },
  },
  {
    id: 'E04',
    intent: 'A browser ancestor relays a server original it cannot import.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`workspace`, classified `[ui, browser, dispatch]`, relaying both features' server factories upward to the root; the variant replaces the declaration relay with a source re-export.",
    capability: 'model',
    expected:
      'Forwarding requires visibility, not importability, so the relay is legal; replacing it with a source re-export produces the corresponding source and tag violation. A sibling-shell comparison records that the root’s downward exposure reaches every compatible UI module, not the shell alone.',
    coverageNotes:
      'The relay itself is in the baseline and carries the application; the source-re-export variant needs the checker. Keep the browser-ancestor relay even if the topology changes.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${workspace}/module.ramify`],
      statements: ['W2', 'W4'],
      note: 'The two relays whose symbols the shell can never value-import.',
    },
  },
  {
    id: 'E05',
    intent: 'Renaming an exposure does not change original identity.',
    mode: ['M'],
    authority: ['A'],
    entry:
      "The baseline alias `expose-sub inspect as inspectRecord`; mutations add a second unrelated binding of the same spelling and a fresh wrapper that only looks like an alias.",
    capability: 'model',
    expected:
      'The alias and the original are one symbol with one owner and one tag set; two unrelated bindings spelled alike stay distinct; a fresh wrapper or type alias is a new binding with its own defining area.',
    coverageNotes:
      "The baseline half is on disk and the root's source imports the original under its own name, which is the identity half of the case. The mutations need the evaluator.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${catalog}/module.ramify`, `${example}/src/assembly.ts`],
      statements: ['A3'],
      note: 'The rename, and the root file that imports the original under its original name.',
    },
  },
  {
    id: 'E06',
    intent: 'A named selection does not grow when the file grows.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'A copy that adds an unselected export to a file exposed through named selections, and one that adds an upward exposure behind a child-contract wildcard.',
    capability: 'loader',
    expected:
      "The named contract is unchanged by the added export; a child wildcard relays the child's upward contract rather than every export in its files; a missing child exposure and a wildcard name collision stay diagnosed.",
    coverageNotes:
      'Needs the parser and real export descriptions, like E07. The baseline supplies both shapes to compare: three named selections from `catalog.ts` and one wildcard over `vocabulary.ts`.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${catalog}/subs/core/module.ramify`, `${catalog}/subs/core/src/catalog.ts`],
      statements: ['K1'],
      note: 'A named three-symbol selection over a file that exports more than three names.',
    },
  },
  {
    id: 'E07',
    intent: 'An interface-file wildcard expands to that file’s whole export set.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`expose-src * from \"interfaces/vocabulary.ts\" tagged [browser] to parent`, over a file exporting seventeen names; mutations add and remove exports and add a second, unselected interface file.",
    capability: 'loader',
    expected:
      'Expansion covers type and runtime exports alike, including `default` when present, and matches explicit selections of the same exports; adding or removing an export changes the expanded contract and every child-wildcard relay of it without a description edit; a second interface file stays private; a merely referenced signature type gains no exposure; an empty valid file yields no names.',
    coverageNotes:
      'Definitively a format requirement, and one an in-memory exposure set cannot establish: it needs the parser plus real source export descriptions.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [
        `${workspace}/subs/contracts/module.ramify`,
        `${workspace}/subs/contracts/src/interfaces/vocabulary.ts`,
      ],
      statements: ['C1', 'W1'],
      note: 'The wildcard, the file it expands, and the child-contract wildcard that relays the expansion onward.',
    },
  },
  {
    id: 'E08',
    intent: 'Owned-source wildcards accept exactly one interface file.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'Copies pointing the wildcard at an ordinary implementation file, `src/tests/interfaces/`, `src/helpers/interfaces/`, a path normalized out of `src/interfaces/`, a directory, a glob, a missing file and a symlink, plus every `expose-test *` form.',
    capability: 'loader',
    expected:
      "Only a file beneath the declaring owner's `src/interfaces/`, including a nested one, qualifies; every other target is a validation error; `expose-test *` is always invalid; a testing module's own `src/interfaces/` qualifies and keeps its testing classification; child-contract wildcards stay valid.",
    coverageNotes:
      'Every assertion is a rejection, so the baseline can only supply the one accepted form. Needs the parser.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${workspace}/subs/contracts/module.ramify`],
      statements: ['C1'],
      note: 'The one accepted wildcard form the rejections are compared against.',
    },
  },
  {
    id: 'E09',
    intent: 'Wildcard expansion preserves identities and tag assignments.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'Copies adding a same-owner forwarding alias, a foreign-owned re-export, an ambiguous export description, conflicting `tagged` clauses, a clause omitting a required tag, duplicate selections and a `"*"` literal name.',
    capability: 'loader',
    expected:
      'Expansion keeps canonical resource and binding identity, including through a same-owner forwarding alias; a foreign-owned export or an incomplete description invalidates the declaration rather than being skipped; a uniform `tagged` clause assigns every selected original and conflicting or incomplete assignments fail; duplicate same-original selections merge and same-name different-original collisions fail; a quoted `"*"` is a literal name.',
    coverageNotes:
      "The baseline's own wildcard carries a `tagged [browser]` clause over seventeen originals, which is the accepted half. Everything else needs the parser and real export descriptions.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${workspace}/subs/contracts/module.ramify`],
      statements: ['C1'],
      note: 'A uniform tag clause assigned to every original of one expansion.',
    },
  },

  // --------------------------------------------------------- Tags and areas
  {
    id: 'T01',
    intent: 'Shared UI reaches both feature views and neither core sibling.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      '`StatusBadge` and `StatusBadgeProps`, exposed upward from `shared-ui` and relayed to every descendant of `workspace`; both feature views render the badge.',
    capability: 'model',
    expected:
      'Both `[ui, browser]` views may value-import the badge; both untagged core owners see the same symbols through the same statement and can import neither, in value or type form, because `ui` is a required-importer tag.',
    coverageNotes:
      'The positive half compiles and renders in the example; the denials need the evaluator over this tree, and the source-form half needs the checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${workspace}/subs/shared-ui/src/status-badge.tsx`,
        `${catalog}/subs/ui/src/catalog-card.tsx`,
        `${reviews}/subs/ui/subs/pure-ui/src/review-result.tsx`,
      ],
      statements: ['SU1', 'W5'],
      note: 'The one shared primitive and the two views that import it.',
    },
  },
  {
    id: 'T02',
    intent: 'Dispatch contracts reach adapters and connected UI only.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "The root's protocol vocabulary and router type, exposed to descendants and imported by the two feature adapters and the connected panel; the value negative first makes a dispatch original visible in a mutation.",
    capability: 'model',
    expected:
      'Dispatch-classified source imports the contracts; core owners and `pure-ui` are denied them for values and types; adding `dispatch` to an importer never repairs a missing exposure route.',
    coverageNotes:
      'The mutation deliberately makes an existing dispatch original visible before testing the denial, so what fails is the tag and not a missing route. Needs the evaluator and the checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${example}/src/interfaces/protocol.ts`,
        `${catalog}/src/router.ts`,
        `${reviews}/subs/ui/src/review-panel.tsx`,
      ],
      statements: ['R1', 'R3'],
      note: 'The exposed dispatch vocabulary and two of its dispatch-classified importers.',
    },
  },
  {
    id: 'T03',
    intent: 'An unmarked import of a purely type original needs no `browser`.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`catalog/ui` imports `CatalogSummary` with `import { CatalogSummary }`, no `type` keyword, under a compiler configuration with `verbatimModuleSyntax` off; the contrast is an unmarked class or function import.",
    capability: 'source-form',
    expected:
      'The resolved original exists only as a type, so the request is type-only and exempt from the required-symbol rule; exposure, required-importer tags and testing-origin checks still apply; an unmarked runtime-bearing original still requires `browser`; a same-owner import keeps its exemption.',
    coverageNotes:
      'The baseline authors the exempt form and its compiler configuration; the source checker is what would classify it. Compiler diagnostics stay a separate report.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${catalog}/subs/ui/src/catalog-card.tsx`, `${example}/tsconfig.json`],
      note: 'The unmarked type import, and the configuration that keeps it legal source.',
    },
  },
  {
    id: 'T04',
    intent: 'Project-defined tag names of both kinds behave identically.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'A resolved registry that renames the ordinary definitions to project-defined names of the same two kinds, supplied directly as the evaluation input.',
    capability: 'custom-registry',
    expected:
      'Results are unchanged by the renaming; two restrictions conjoin as expected; unknown or conflicting definitions are invalid; there is no per-owner shadow registry, and reserved `testing` cannot be removed or rebound.',
    coverageNotes:
      "The registry's configuration serialization is deliberately unspecified, so this family uses the resolved contract directly. The baseline uses the default registry throughout.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${model}/cross-module-importability.principles.md`],
      note: 'The registry principle that fixes the two rule kinds and the reserved `testing` definition.',
    },
  },
  {
    id: 'T05',
    intent: 'New exports carry their source area’s required-importer tags.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "The root's `createTestSystem`, defined in a `[testing, dispatch]` test area, and the catalog fixture, defined in a `[testing]` one; mutations declare a standalone `tests tagged [...]` and change a parent profile.",
    capability: 'source-areas',
    expected:
      "Each new binding defaults to exactly its area's required-importer tags; a `src/tests/` profile is `testing` plus the header's required-importer tags and never `browser`; a standalone `tests tagged [...]` declaration is invalid; changing a parent's profile classifies none of its child owners.",
    coverageNotes:
      "The two baseline bindings are the positive half, and the example's test areas already behave that way at runtime. The derivation itself has not been evaluated.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${example}/module.ramify`, `${catalog}/subs/core/module.ramify`],
      statements: ['R2', 'K2'],
      note: 'Two testing-area bindings whose default tags differ because their owners’ headers differ.',
    },
  },
  {
    id: 'T06',
    intent: 'Forwarding a restricted original preserves its restrictions.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'The baseline relay of the `[testing]` catalog fixture through two owners whose ordinary source could not import it; mutations forward it through a wrapper and through a source re-export.',
    capability: 'resolver',
    expected:
      "The forwarded original keeps its owner and tags, so its restrictions survive the relay; a newly defined wrapper or type alias takes its own defining area's required tags instead; a source-forwarding path must pass its own checks.",
    coverageNotes:
      'The relay is on disk and carries a real fixture into a foreign test; distinguishing a forwarding alias from a new binding needs the resolver.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${catalog}/module.ramify`, `${workspace}/module.ramify`],
      statements: ['K2', 'A4', 'W3'],
      note: 'A testing-tagged original relayed through a `[dispatch]` owner and a `[ui, browser, dispatch]` one.',
    },
  },

  // ------------------------------------------------- Testing and composition
  {
    id: 'O01',
    intent: "A module's own tests read its private helper; no other owner can.",
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`catalog/core/src/tests/catalog.test.ts` importing the unexposed `resolvePredecessors` from its owner's `src/history.ts`; mutations try the same import from a foreign parent and sibling test, and move a test-looking file into ordinary `src/`.",
    capability: 'source-areas',
    expected:
      'The same-owner import is allowed with no exposure; a foreign test is denied; a file moved out of `src/tests/` loses its testing classification and its filename adds none back.',
    coverageNotes:
      "The positive half runs in the example's suite. The denials and the reclassification need the checker.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${catalog}/subs/core/src/history.ts`,
        `${catalog}/subs/core/src/tests/catalog.test.ts`,
      ],
      note: 'The private helper and the owner-local test that reads it directly.',
    },
  },
  {
    id: 'O02',
    intent: 'A foreign test fixture follows ordinary exposure into other tests.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`makeCatalogFixture`, defined in the catalog core's test area and relayed to every descendant of `workspace`, used by the review runtime's own integration test; the mutation removes the fixture exposure.",
    capability: 'source-areas',
    expected:
      "The foreign test may import the fixture and its type; production source anywhere is denied both; removing the exposure denies the foreign test without affecting the owner's own tests.",
    coverageNotes:
      "The relay carries a real fixture in the example's suite today. The production denial and the removal half need the checker.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${catalog}/subs/core/src/tests/fixture.ts`,
        `${reviewCore}/src/tests/runtime.test.ts`,
      ],
      statements: ['K2', 'A4', 'W3'],
      note: 'The fixture and the foreign test that builds its inspection port out of it.',
    },
  },
  {
    id: 'O03',
    intent: 'Production source cannot reach testing source by any route.',
    mode: ['M'],
    authority: ['A'],
    entry:
      "Copies in which production source imports the root's testing setup as a value and as a type, loads a testing-owned stylesheet, and reaches a production original through a test barrel.",
    capability: 'source-form',
    expected:
      'Every one of those is forbidden once its origin is identified, including within one owner; a non-testing forwarding file cannot hide a testing original.',
    coverageNotes:
      "The baseline deliberately contains no such import, which is what makes the mutations meaningful; a grep over the example confirms it. Needs the source checker.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${example}/src/tests/setup.ts`],
      statements: ['R2'],
      note: 'The testing-owned binding the mutations try to reach from production source.',
    },
  },
  {
    id: 'O04',
    intent: 'View tests keep their own coupling profile without `browser`.',
    mode: ['B', 'M'],
    authority: ['A', 'D'],
    entry:
      "`pure-ui`'s tests over its private formatter and its public component, and `reviews/ui`'s test driving the connected panel; mutations change module-header tags, including project-defined names of both kinds.",
    capability: 'source-areas',
    expected:
      "Pure-view tests stay with the private formatting and connected tests use the public view; a `[ui, browser]` owner's tests derive `[testing, ui]` and a `[ui, browser, dispatch]` owner's derive `[testing, ui, dispatch]`; neither inherits `browser`.",
    coverageNotes:
      "The derived profiles are what the example's Node tests actually rely on; the derivation itself has not been evaluated, and the custom-tag half also needs the registry input.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${reviews}/subs/ui/subs/pure-ui/src/tests/format.test.ts`,
        `${reviews}/subs/ui/src/tests/review-panel.test.tsx`,
      ],
      note: 'A private-formatting test in a pure view and a connected test one level above it.',
    },
  },
  {
    id: 'O05',
    intent: 'Root and shell test areas use their fixed profiles.',
    mode: ['B'],
    authority: ['A', 'D'],
    entry:
      "The root's `[testing, dispatch]` protocol and assembly tests, the shell's `[testing, ui, dispatch]` integration test, and the testing-only setup the root exposes to descendants.",
    capability: 'source-areas',
    expected:
      "Both areas import what their fixed profile permits and nothing else; the shell's test uses views already exposed upward to its owner; the root's exposed setup preserves the actual router and client identity; feature peers gain access to neither each other's views nor that setup.",
    coverageNotes:
      "Baseline-only, and every part of it runs in the example's suite as behaviour. As a profile assertion it needs the evaluator; the last clause also needs the checker.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${example}/src/tests/setup.ts`,
        `${example}/src/tests/protocol-typing.test.ts`,
        `${workspace}/src/tests/shell.test.tsx`,
      ],
      statements: ['R2', 'R3'],
      note: 'The exposed setup and the two test areas whose fixed profiles differ.',
    },
  },
  {
    id: 'O06',
    intent: 'A `testing` tag on a production binding is not a testing origin.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      'A variant that tags a binding defined in ordinary `src/` with `testing` and imports it from that owner’s other production files and from a foreign production importer.',
    capability: 'source-areas',
    expected:
      "The same-owner production import stays available, because the restriction follows the binding's defining area; the foreign production importer is denied by the tag. This differs from defining the binding in testing source, which forbids both.",
    coverageNotes:
      'No baseline binding carries this shape, so the family needs the variant as well as the evaluator.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${model}/cross-module-importability.principles.md`],
      note: 'The principle separating the source-origin restriction from a same-owner symbol-tag check.',
    },
  },
  {
    id: 'O07',
    intent: 'A separately declared testing module carries its own header tags.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'A variant that adds a child `module <name> tagged [testing, ui, browser]` with its test code in ordinary `src/`.',
    capability: 'source-areas',
    expected:
      "Its `src/` uses all three tags; it has no private access to its parent without exposure; a foreign value import needs the declared `browser` promise; its own optional `src/tests/` still derives `[testing, ui]`; a forwarding alias cannot acquire new tags.",
    coverageNotes:
      "The baseline carries one testing module, `integration-tests [testing, dispatch]`, holding the Cucumber scenario in its ordinary `src/`: it has no private access to the root and imports `createTestSystem` through the root's exposure to descendants, with a header that must carry both of that symbol's tags. The `[testing, ui, browser]` variant with a `browser` promise on a foreign value, a testing module's derived `src/tests/` profile, and the forwarding-alias half remain variant-only, and no checker executes any of it.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${example}/subs/integration-tests/module.ramify`,
        `${example}/subs/integration-tests/src/support/world.ts`,
      ],
      note: "The testing module's header, and the World that imports the root's exposed setup across the owner boundary.",
    },
  },

  // -------------------------------------- Dispatch, reports, runtime direction
  {
    id: 'D01',
    intent: 'One configured tRPC runtime composes both feature factories.',
    mode: ['B'],
    authority: ['D'],
    entry:
      "`assembleSystem` mounting both feature routers on one runtime, a `TRPCClient<AppRouter>` over the fetch adapter, the same client over a real socket, and the compiler negatives beside them.",
    capability: 'protocol',
    expected:
      'A valid call preserves the exact inferred input and output types; the client output of `catalog.get` is exactly `CatalogSummary` and of `reviews.run` exactly `ReviewOutcome`; invalid input, a missing invocation context and a wrong result are compiler errors, with no widening or narrowing cast anywhere.',
    coverageNotes:
      "Executed: the runtime half by the example's tests, the type half by its `type-check`, where an unused `@ts-expect-error` is itself an error. Establishes the reference project's design, not a universal Ramify rule.",
    implementation: 'available',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${example}/src/assembly.ts`,
        `${example}/src/tests/protocol-typing.test.ts`,
        `${reviews}/src/tests/typing.test.ts`,
        `${workspace}/src/tests/shell.test.tsx`,
      ],
      note: 'The assembly and the three type-assertion files that hold its compiler negatives.',
    },
  },
  {
    id: 'D02',
    intent: 'One MCP surface dispatches two feature-owned tools.',
    mode: ['B'],
    authority: ['D'],
    entry:
      "`createMcpServer` over the collected contributions, with `catalog.inspect` and `reviews.run` owned by their features, listed and called through real MCP clients in process and over HTTP.",
    capability: 'protocol',
    expected:
      "Both tools list and call; each adapter owns its own argument parsing and result adaptation; the root routes by name and reads no business argument; the review's coordination runs behind the review capability rather than in the root's switch.",
    coverageNotes:
      "Executed as behaviour by the example's suite. The ownership half is a source review of where the handling lives, recorded here: tags alone cannot prove the absence of business logic.",
    implementation: 'available',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${example}/src/protocol.ts`, `${catalog}/src/mcp.ts`, `${reviews}/src/mcp.ts`],
      note: 'The root’s name-routing server factory and the two feature-owned contributions.',
    },
  },
  {
    id: 'D03',
    intent: 'Every list and call re-resolves its session binding.',
    mode: ['B'],
    authority: ['D'],
    entry:
      "The review session table and its wrapper, driven over in-memory sessions and over two HTTP sessions whose ids the transport generated.",
    capability: 'protocol',
    expected:
      "A binding changed between requests is seen by the next listing and the next call; two concurrent sessions never read each other's binding; each handler works from its own immutable invocation snapshot; the catalog sees only the neutral scope and observation callback, never the review's session identity.",
    coverageNotes:
      "Executed by the example's suite, including the HTTP test where the session ids are the transport's own. Ordinary correctness for fresh context, not a security mechanism.",
    implementation: 'available',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${reviews}/src/session.ts`,
        `${reviews}/src/tests/sessions.test.ts`,
        `${example}/src/tests/http.test.ts`,
      ],
      note: 'The table, the in-process session tests and the two-session HTTP test.',
    },
  },
  {
    id: 'D04',
    intent: 'Factories travel up; only neutral contracts travel down.',
    mode: ['B', 'M'],
    authority: ['A', 'D'],
    entry:
      "The upward relays of both features' factories and the root's downward protocol vocabulary; mutations delete a hop and add a direct core import of dispatch plumbing.",
    capability: 'model',
    expected:
      'Each direction is carried by its own statement, and the two mutations fail for distinct reasons: a missing exposure route in one, a required-importer tag in the other.',
    coverageNotes:
      'Both directions are in the baseline and carry the running application; the two denials need the evaluator and the checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${workspace}/module.ramify`, `${example}/module.ramify`],
      statements: ['W2', 'W4', 'R1'],
      note: 'The two upward relays and the one downward exposure they are contrasted with.',
    },
  },
  {
    id: 'D05',
    intent: 'Both features consume one neutral report contract.',
    mode: ['B', 'P'],
    authority: ['A', 'D', 'P'],
    entry:
      "`contracts`' vocabulary, consumed by the catalog's inspection and by the review runtime through ordinary exposure, plus the core-owned `CatalogSummary` returned by `getRecord`.",
    capability: 'model',
    expected:
      'Neither feature imports the other, and the shared contract owner imports neither of its consumers; the core-owned return type is exposed explicitly alongside the behaviour that produces it.',
    coverageNotes:
      'The arrangement carries the running application. The "shared contracts cannot import their consumers" half needs the checker; the alternatives are probes P01 and P04 and stay non-normative.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${workspace}/subs/contracts/src/interfaces/vocabulary.ts`,
        `${catalog}/subs/core/src/catalog.ts`,
        `${reviewCore}/src/interfaces/port.ts`,
      ],
      note: 'The neutral vocabulary, the producer that speaks it and the port written in it.',
    },
  },
  {
    id: 'R01',
    intent: 'The runtime’s local downward route joins its two children.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`reviews/core` relaying the task operations back down to the controller that schedules them, and `reviews` relaying the validator down into the runtime; mutations import the controller from tasks and runtime behaviour from validation.",
    capability: 'model',
    expected:
      'The controller reaches its sibling only through the parent relay; `tasks` cannot import the controller, whose exposure is upward only; `validation`, outside the runtime subtree, can import neither the runtime’s behaviour nor its types.',
    coverageNotes:
      'The positive route is what the review actually runs on. Both denials need the evaluator and the checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${reviewCore}/module.ramify`, `${reviews}/module.ramify`],
      statements: ['RC3', 'CT1', 'RV4'],
      note: 'The two-child relay, the upward-only controller exposure and the validator’s route back down.',
    },
  },
  {
    id: 'R02',
    intent: 'A parent composes its children through exposed factories.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`createReviewRuntime` calling the controller and the task through their exposures, the parent-owned integration test that drives them, and a mutation importing the task's private observation collector from the parent.",
    capability: 'model',
    expected:
      "The parent-owned test exercises the actual supervisor and task; the parent's new import of a child-private helper fails, because a private export is not part of the child's contract.",
    coverageNotes:
      "The integration test runs in the example's suite today. The private-helper denial needs the checker.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${reviewCore}/src/tests/runtime.test.ts`,
        `${reviewCore}/subs/tasks/src/inspection-task.ts`,
      ],
      statements: ['TK1', 'TK2'],
      note: 'The parent-owned integration test and the child file whose private helper the mutation reaches for.',
    },
  },

  // ------------------------------------------ Source, resources, diagnostics
  {
    id: 'S01',
    intent: 'Specifiers, aliases and import forms identify their originals.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "The example's `.js` specifiers for `.ts` sources, the one configured `@features/*` alias used by the shell, and its named, default and type-import expressions.",
    capability: 'resolver',
    expected:
      'Each specifier resolves to the correct original with the correct import form, and the alias path introduces no second owner for the files it reaches.',
    coverageNotes:
      "The alias and the specifiers are exercised by the example's compiler, bundler and runner; identifying originals from them is resolver work that does not exist.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${workspace}/src/app.tsx`, `${example}/tsconfig.json`, `${example}/vite.config.ts`],
      note: 'The one aliased importer, and the two configurations that declare the alias.',
    },
  },
  {
    id: 'S02',
    intent: 'Bounded selection for namespace, lazy and star forms.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "The shell's literal lazy import selecting one named member of the review panel; mutations add a namespace member access, a destructuring form and an explicit source-star re-export, plus one computed member access.",
    capability: 'source-form',
    expected:
      'Each identifiable selection is checked against its selected original; an unknown escaping or computed member use is a visible coverage limit, never a reason to grant every export of the target.',
    coverageNotes:
      'The lazy literal is in the baseline and splits a real chunk in the build. The other forms need mutations, and all of them need the checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${workspace}/src/app.tsx`],
      note: 'The literal dynamic import that selects `ReviewPanel` and nothing else.',
    },
  },
  {
    id: 'S03',
    intent: 'Both `type` import forms keep their coupling restrictions.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "The shell's statement-level `import type { AppRouter }` and the connected panel's inline `import { type AppRouter }`.",
    capability: 'source-form',
    expected:
      'Both forms are type-only requests that still satisfy `dispatch`; neither is rejected merely because an ordinary statement could initialize its target under the specified runtime-load policy.',
    coverageNotes:
      'Both forms are authored deliberately, one per importer, so the two spellings can be compared on the same original. Needs the checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${workspace}/src/client.ts`, `${reviews}/subs/ui/src/review-panel.tsx`],
      statements: ['R3'],
      note: 'The two written forms of the same type-only import of `AppRouter`.',
    },
  },
  {
    id: 'S04',
    intent: 'Two CSS modules under one shim are two distinct resources.',
    mode: ['B', 'M'],
    authority: ['A'],
    entry:
      "`catalog/ui` and `pure-ui` each importing their own `*.module.css`, both described by the same ambient declaration; mutations alias one resource, select a missing export and reference a missing file.",
    capability: 'resolver',
    expected:
      "Each resource binding belongs to the owner whose `src/` contains it, with its own identity and its defining area's tags; the shim is not their owner; a resolution failure and an identity failure stay distinct diagnostics.",
    coverageNotes:
      'The two resources are in the baseline and the build emits both; resource identity needs the resolver.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${catalog}/subs/ui/src/catalog-card.module.css`,
        `${reviews}/subs/ui/subs/pure-ui/src/review-result.module.css`,
      ],
      note: 'Two same-named resource kinds owned by two different modules.',
    },
  },
  {
    id: 'S05',
    intent: 'A bound JSON resource and compiled source map to their originals.',
    mode: ['H', 'M'],
    authority: ['A'],
    entry:
      'Small separate fixture scopes holding a JSON resource, a generated directory and a compiled entry.',
    capability: 'resolver',
    expected:
      'Each maps to its actual original; a shim or generated directory defines no ownership; packaging and generation support stays in its own fixture scope rather than becoming a production owner.',
    coverageNotes:
      'The baseline deliberately holds no generated or packaging support, so this family is fixture-only.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/harness.md`],
      note: 'The instruction to keep generated and packaging samples in small separate fixture scopes.',
    },
  },
  {
    id: 'S06',
    intent: 'Five diagnostic classes are reported separately.',
    mode: ['M'],
    authority: ['A'],
    entry:
      'A copy carrying, at once, an invalid layout, a definite forbidden import, a known external target, an unresolved target and an unsupported loader.',
    capability: 'source-form',
    expected:
      'Each is reported as its own class, and the definite violation fails the check even though the unsupported loader is only a coverage note.',
    coverageNotes:
      'The distinction is the point of the family: an accepted analysis limit must never absorb a definite violation.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/harness.md`],
      note: 'The reporting rule that an additional definite forbidden import must change the result to failure.',
    },
  },
  {
    id: 'S07',
    intent: 'A clean run with known limits passes with partial coverage.',
    mode: ['B', 'H'],
    authority: ['A'],
    entry:
      'The clean baseline analysed by a bounded source check that leaves some runtime-selected sites unanalysed.',
    capability: 'source-form',
    expected:
      'The run succeeds, states its coverage limits, and labels no unchecked construct as allowed, external or completely covered.',
    coverageNotes:
      "The report format exists in this harness and already states that no source checker ran; what it cannot yet do is report a checker's own coverage. Needs the checker.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/harness.md`],
      note: 'The report block that separates a passing bounded check from complete coverage.',
    },
  },

  // ------------------------------------------------ Actual tool compatibility
  {
    id: 'K01',
    intent: 'A real browser renders a review from the real API.',
    mode: ['C'],
    authority: ['D'],
    entry:
      'The Vite application and the API listener, driven by one real browser session.',
    capability: 'browser',
    expected:
      'The screen lists both records, the Review button renders the finding for the broken one, and the lazily loaded panel resolves in the browser rather than only in a bundle.',
    coverageNotes:
      'Checked by hand during iteration 4 with `dev:api` and `dev:web` running; no automation exists, so the family is not executed. A passing static-markup test is explicitly not this evidence.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${workspace}/src/app.tsx`, `${reviews}/subs/ui/src/review-panel.tsx`],
      note: 'The screen and the lazily loaded panel a browser would exercise.',
    },
  },
  {
    id: 'K02',
    intent: 'Eager and lazy named glob selections render the same component.',
    mode: ['C', 'M'],
    authority: ['A', 'D'],
    entry:
      'A glob fixture whose files export both a selected component and an unrelated private helper, loaded eagerly in one variant and lazily in the other.',
    capability: 'browser',
    expected:
      'Both variants render the same selected component; changing the loading timing does not broaden exposure to the unrelated export; an unsupported macro remains a nonblocking coverage note.',
    coverageNotes:
      'The baseline has a literal lazy import but no glob fixture, so this family needs the fixture as well as the browser suite.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/harness.md`],
      note: 'The browser-fixture section that specifies the glob fixture and its private helper.',
    },
  },
  {
    id: 'K03',
    intent: 'A runtime-selected fallback and an injected setting keep working.',
    mode: ['C'],
    authority: ['A', 'D'],
    entry: 'A preview fallback chosen at runtime and a Vite-injected setting, in a small fixture.',
    capability: 'browser',
    expected:
      'Both work at runtime even where static analysis cannot enumerate the target set; no generated registry is required to make them analysable.',
    coverageNotes:
      'The baseline deliberately keeps normal loading rather than a mandatory registry, but holds no such fallback yet.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/harness.md`],
      note: 'The instruction to keep an ordinary runtime-selected fallback and a Vite-injected setting.',
    },
  },
  {
    id: 'K04',
    intent: 'Plain CSS and CSS modules visibly style the browser.',
    mode: ['C'],
    authority: ['A', 'D'],
    entry:
      "The workspace's plain stylesheet and the two owners' CSS modules, observed in a real browser; the negative loads a testing-origin stylesheet from production source.",
    capability: 'browser',
    expected:
      'Both styling routes are visible in the browser, and the testing-origin stylesheet still trips the source guard in its negative case.',
    coverageNotes:
      'Checked by hand during iteration 4: the shell and both views were styled in the browser. No automation exists, and the negative also needs the source checker.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${workspace}/src/styles.css`, `${catalog}/subs/ui/src/catalog-card.module.css`],
      note: 'The application stylesheet and one of the two owned CSS modules.',
    },
  },
  {
    id: 'K05',
    intent: 'One real Cucumber scenario with shared hook initialization.',
    mode: ['C'],
    authority: ['A', 'D'],
    entry:
      "The ordinary `src/` of `integration-tests`, a separately declared testing module under the root's `subs/` with header `[testing, dispatch]`: one `.viz.feature` scenario reviewing both records through the typed client and one MCP session, run by `@cucumber/cucumber` through `cucumber.js`. Its hook module is reached through two setup paths in one runtime — the runner's `import` glob and a symbol-free `import '../support/hooks.js'` in the step definitions — and the shared initialization is a side effect of loading it, with no exported capability invented to justify that load.",
    capability: 'browser',
    expected:
      'The scenario runs through the real runner and the intended initialization happens exactly once; legitimate side-effect setup needs no invented exported capability.',
    coverageNotes:
      "Executed: `npm run test:cucumber` in the example runs the scenario, and its last step asserts that the initialization was evaluated once and the run-level hook registered once, over a process-wide tally that a duplicate module instance would raise to 2. That establishes real runner registration and the two-path load under Node's ESM resolution with `tsx`, in process. It establishes nothing about a browser, nothing about other loaders or a CommonJS path, and nothing about how a source checker would classify either import: no analyser has read this fixture. The module reaches the configured system only through the root's exposed `createTestSystem`, so the fixture also carries a testing module's foreign import; that import is likewise unchecked.",
    implementation: 'available',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${example}/subs/integration-tests/src/features/collection-review.viz.feature`,
        `${example}/subs/integration-tests/src/support/hooks.ts`,
      ],
      note: 'The one scenario, and the hook module the runner and the step definitions both name.',
    },
  },
  {
    id: 'K06',
    intent: 'Real Jiti loads a TypeScript configuration that changes behaviour.',
    mode: ['C'],
    authority: ['A', 'D'],
    entry:
      'A small TypeScript configuration file loaded through real Jiti, plus a separate independent-project preview fixture.',
    capability: 'browser',
    expected:
      "The loaded value changes visible behaviour, and the independent project's source scope is recorded separately rather than certified as part of this application.",
    coverageNotes:
      'No Jiti dependency and no independent-project fixture exist yet; arbitrary future projects are explicitly not certified.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/README.md`],
      note: 'The tool budget entry that adds Jiti for focused compatibility checks only.',
    },
  },
  {
    id: 'K07',
    intent: 'Runners find every owned test area; production selection excludes them.',
    mode: ['C', 'H'],
    authority: ['A', 'D'],
    entry:
      "The example's two runner configurations, Vitest over fourteen nested `src/tests/` areas and Cucumber over the testing module's ordinary `src/`, plus fixtures for a mock or instrumentation case and a compiled-entry smoke case.",
    capability: 'browser',
    expected:
      "Discovery finds every owned test area and every testing module's `src/`; production selection excludes testing-classified source while keeping production `src/interfaces/` vocabulary; independently analysed fixture programs stay separate.",
    coverageNotes:
      "The discovery half already holds in the example: `vitest.config.ts` collects all fourteen `src/tests/` areas, twenty files in the current run, and `cucumber.js` collects the ordinary `src/` of the testing module `integration-tests`. The production-selection, instrumentation and compiled-entry halves have no fixture, and nothing selects production source yet.",
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${example}/vitest.config.ts`, `${example}/cucumber.js`],
      note: "The two runner configurations: one over every owner's nested test area, one over the testing module's ordinary source.",
    },
  },

  // ------------------------------------ Host integration and retained policies
  {
    id: 'H01',
    intent: 'Discover declared ids, parents and owned scopes.',
    mode: ['H'],
    authority: ['A', 'E'],
    entry: 'The baseline tree read through the module-discovery adapter.',
    capability: 'host-adapter',
    expected:
      'Canonical declared identifiers, parent relationships and source, test and resource owners come back for every owner, including an empty one, with no package or facade file required.',
    coverageNotes:
      'The tree and its identifiers exist and are recorded by hand in the contract map; no adapter reads them. Needs the loader first.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${example}/module.ramify`, `${workspace}/module.ramify`],
      note: 'The declared names and headers the adapter would report, at two levels of the tree.',
    },
  },
  {
    id: 'H02',
    intent: 'Render one symbol contract with owner, tags, alias and availability.',
    mode: ['H'],
    authority: ['A', 'E'],
    entry: 'A selected symbol, read through the symbol-contract adapter for a named consumer.',
    capability: 'host-adapter',
    expected:
      'The original owner, tags, alias, source reference and the consumer-specific value and type availability come back together; expanded interface-file and child-contract wildcards show their current contents even when no declaration changed; a receivable symbol is not reported as importable.',
    coverageNotes:
      'The contract map is the hand-built equivalent of this output and is what the adapter would have to reproduce.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/contract-map.md`],
      note: 'The hand-maintained record of exactly these fields for every exposed symbol.',
    },
  },
  {
    id: 'H03',
    intent: 'Return module roots, owned paths and the README purpose summary.',
    mode: ['H'],
    authority: ['A', 'E'],
    entry:
      "Each owner's `README.md` beside its `module.ramify`, plus fixtures for a missing README and a README with no prose paragraph.",
    capability: 'host-adapter',
    expected:
      "The module and metadata root, the owned `src/`, `src/tests/` and `src/interfaces/` paths, the README path and its first top-level prose paragraph as plain text; missing documentation is explicit and never borrows another owner's prose; ordinary and testing classifications stay disjoint despite containment.",
    coverageNotes:
      'All fourteen owners supply a purpose paragraph, checked by hand at the end of each iteration. The absence cases need separate fixtures, and nothing reads any of it.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${example}/README.md`, `${workspace}/subs/shared-ui/README.md`],
      note: 'The root README and one module README, each opening with its purpose paragraph.',
    },
  },
  {
    id: 'H04',
    intent: 'Exposure, dependency use, test ownership and write authority stay separate.',
    mode: ['H'],
    authority: ['E'],
    entry: 'Tiny known manifests supplied as adapter inputs and outputs.',
    capability: 'host-adapter',
    expected:
      'Each of the four remains its own input or output; possible exposure is never read as observed use, and neither is read as write authority.',
    coverageNotes:
      'Deliberately manifests rather than an agent launcher or workflow engine. Ramify supplies the exposure half only; the rest belongs to the host.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${model}/cross-module-importability.principles.md`],
      note: 'The principle that importability is independent of dependency use and enforcement mechanics.',
    },
  },
  {
    id: 'X01',
    intent: 'Naming, API quality and growth budgets are separate policies.',
    mode: ['E'],
    authority: ['E'],
    entry:
      'The reference keeps good examples of canonical paths, documented contracts and a modest file budget, and claims no enforcement of them.',
    capability: 'separate-responsibility',
    expected:
      'These stay independent review or checker policies; the reference does not present them as Ramify rules.',
    coverageNotes:
      'Recorded rather than executed, which is the whole point of the family: an unenforced convention must not look enforced.',
    implementation: 'deliberately-unsupported',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/README.md`],
      note: 'The design budget and quality guidance that the plan states as guidance, not as rules.',
    },
  },
  {
    id: 'X02',
    intent: 'Cycles, process conventions and packaging policy are separate checks.',
    mode: ['E'],
    authority: ['E'],
    entry: 'The reference keeps its scope explicit instead of simulating a whole platform.',
    capability: 'separate-responsibility',
    expected:
      'Each stays a separate check with its own scope; none is inferred from an importability result.',
    coverageNotes: 'Recorded rather than executed.',
    implementation: 'deliberately-unsupported',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/README.md`],
      note: 'The scope statement that keeps these outside the reference project.',
    },
  },
  {
    id: 'X03',
    intent: 'A `browser` promise is a declaration, not a verified closure.',
    mode: ['H', 'E'],
    authority: ['E'],
    entry:
      "The baseline's two `browser` promises: the contracts wildcard and the shared-UI exposure; a separate verifier would catch a deliberately false claim through a private dependency.",
    capability: 'separate-responsibility',
    expected:
      "Matching uses the declared promise alone; verifying it is a separate concern, and a rendering browser proves nothing about every export's runtime closure. A false claim is reported at the owner, not at the importer that relied on it.",
    coverageNotes:
      'The promises are authored and carry real value imports; no verifier exists and none is planned as part of the import predicate.',
    implementation: 'deliberately-unsupported',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [
        `${workspace}/subs/contracts/module.ramify`,
        `${workspace}/subs/shared-ui/module.ramify`,
      ],
      statements: ['C1', 'SU1'],
      note: 'The two owners that promise browser safety for the symbols a browser value-imports.',
    },
  },

  // --------------------------------------------------------- Design probes
  {
    id: 'P01',
    intent: 'Neutral shared report versus producer-owned or consumer-owned.',
    mode: ['P'],
    authority: ['P'],
    entry:
      "The baseline's neutral `contracts` owner, compared with a producer-owned report exposed to consumers and with a consumer-owned projection.",
    capability: 'probe',
    expected:
      'No normative result. The comparison tracks original identity, required adapters, type duplication and permitted audiences for each alternative.',
    coverageNotes:
      'Undecided. The baseline keeps one alternative running; a probe result cannot silently approve another.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [
        `${workspace}/subs/contracts/src/interfaces/vocabulary.ts`,
        `${reviewCore}/src/runtime.ts`,
      ],
      note: 'The neutral contract the probe compares against, and the runtime that consumes it.',
    },
  },
  {
    id: 'P02',
    intent: 'Parent-owned supervisor test versus task-local tests with a custom role.',
    mode: ['P'],
    authority: ['P'],
    entry:
      "The runtime's parent-owned integration test, compared with task-local tests under a meaningful project-defined required-importer role.",
    capability: 'probe',
    expected:
      "No normative result. The comparison includes production assembly's need for the same original and the mandatory export and test tag propagation each alternative implies.",
    coverageNotes: 'Undecided. Also needs the custom-registry input to compare the alternative.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-source',
      paths: [`${reviewCore}/src/tests/runtime.test.ts`],
      note: 'The parent-owned integration test that is one side of the comparison.',
    },
  },
  {
    id: 'P03',
    intent: 'Runtime grouping versus independently placed controller, tasks and validation.',
    mode: ['P'],
    authority: ['P'],
    entry:
      "The baseline's grouping of the controller and tasks beneath `reviews/core`, with validation outside it, compared with independent placement under custom roles.",
    capability: 'probe',
    expected:
      'No normative result. Both the positive and the negative edges of the current arrangement must survive the comparison, and no exact-child grant may be assumed as a feature.',
    coverageNotes:
      'Undecided. The baseline keeps the grouped arrangement running; the alternative placement needs project-defined roles as well as the evaluator.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${reviewCore}/module.ramify`, `${reviews}/subs/validation/module.ramify`],
      statements: ['RC3', 'VL1'],
      note: 'The grouping the probe compares against: one relay inside the runtime, one route from outside it.',
    },
  },
  {
    id: 'P04',
    intent: 'Explicit type exposures versus automatic associated-type exposure.',
    mode: ['P'],
    authority: ['P'],
    entry:
      "The catalog core's explicit exposure of `CatalogSummary` beside `getRecord`, compared with automatic exposure of a behaviour's associated types.",
    capability: 'probe',
    expected:
      'No normative result. The comparison measures declarations and added audiences on this small tree, including nested signature types, a fresh alias and a foreign-owned type.',
    coverageNotes:
      'Undecided. The baseline also shows the contrast in the other direction: the root exposes a contract without exposing the types its signature mentions.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${catalog}/subs/core/module.ramify`, `${catalog}/subs/core/src/catalog.ts`],
      statements: ['K1'],
      note: 'One statement exposing a behaviour and its return type explicitly, together.',
    },
  },
  {
    id: 'P05',
    intent: 'An unadopted all-types selector versus the adopted forms.',
    mode: ['P'],
    authority: ['P'],
    entry:
      'The adopted interface-file wildcard and legal named selections, compared with a proposed all-types selector.',
    capability: 'probe',
    expected:
      'No normative result. Only the all-types selector is proposed syntax; the wildcard’s binding expectations belong to E07 to E09 and stay definitive.',
    coverageNotes:
      'Undecided, and deliberately kept out of the description grammar: no accepted syntax may be invented for it.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'baseline-declaration',
      paths: [`${workspace}/subs/contracts/module.ramify`],
      statements: ['C1'],
      note: 'The adopted wildcard the proposal is measured against.',
    },
  },
  {
    id: 'P06',
    intent: 'A permitted launch-configuration dependency versus a core-owned launch port.',
    mode: ['P'],
    authority: ['P'],
    entry:
      'Two small designs compared on ownership and typed contracts; no real worker process is needed.',
    capability: 'probe',
    expected:
      'No normative result. The comparison is about which owner holds the protocol-specific launch operation, not about running one.',
    coverageNotes:
      'Undecided, and deliberately outside the required baseline: the example launches nothing.',
    implementation: 'absent',
    baselineWitness: {
      kind: 'document',
      paths: [`${plans}/README.md`],
      note: 'The decision keeping full protocol-independent launching out of the baseline, as an isolated probe.',
    },
  },
];
