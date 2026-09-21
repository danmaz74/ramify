# Capability progress iteration 2: Ramify package surface

**Date:** 2026-09-21. **Owner:** `ramify/presentation`, the root package manifest
and `scripts/reference-harness`.
**Plan:** [capability progress visualizations](../initial-hypothesis-vs-implemented-module-tree.proposal.md#iteration-2-ramify-package-surface).
**Status:** complete. Iteration 5 can import the canvas once Ramify is rebuilt.

## What changed

- New `subs/presentation/src/module-tree-entry.ts` forwards `ModuleTreeCanvas`
  and the types `ModuleTreeCanvasProps`, `ModuleTreeCanvasNode` and
  `ModuleTreeCanvasEmphasis` from `project-view`. It follows the
  `inventory-entry.ts` pattern.
- `presentation/module.ramify` (P6) re-exposes the canvas to its parent, via
  `expose-sub ... from project-view`, and the three types untagged. The canvas
  keeps its original `[ui, browser]` tags. The self-check found no
  `exposed-without-companion`.
- New `subs/presentation/src/module-tree-entry.css` is the package stylesheet.
  See [stylesheet mechanism](#stylesheet-mechanism) below.
- `package.json`:
  - `"./module-tree": { types: ./dist/subs/presentation/src/module-tree-entry.d.ts, import: ./dist/subs/presentation/src/module-tree-entry.js }`
  - `"./module-tree.css": "./dist/subs/presentation/src/module-tree-entry.css"`
  - `react` and `react-dom` (`^19.2.8`) moved out of `dependencies` into
    `peerDependencies` and `devDependencies`. `peerDependenciesMeta` marks
    both optional. `@xyflow/react` remains a dependency.
  - `package-lock.json` was updated by `npm install`.
- `ramify.ts/presentation` and `src/index.ts` are unchanged. `ModuleTreeView`
  still imports its three stylesheets, so the explorer is unchanged.
- The `presentation` README documents both entries.
- `scripts/reference-harness/relocation.ts` changes:
  - The entry table gains `'ramify.ts/module-tree': 'ModuleTreeCanvas'`.
  - A new `stylesheetEntries` list holds `ramify.ts/module-tree.css`. An
    optional third parameter of `prepareRelocatedPackage` defaults to it.
  - Object exports must equal the entry table, and string exports must equal
    the stylesheet list. Both kinds must be in the tarball.
  - New assertion: `react` and `react-dom` are optional peers and absent from
    `dependencies`.
  - The consumer installs the peer ranges (`react@^19.2.8`,
    `react-dom@^19.2.8`) beside the tarball.
  - The Node probe also resolves the stylesheet entry to its packed `.css`
    file. Node does not evaluate it.
  - The assertion "all eight actual package entry imports executed" is
    renamed "every actual package entry import executed".
  - The `relocation-installed-entries` observation keeps its array shape. A
    new `relocation-installed-stylesheets` observation is beside it.
- New runner `scripts/reference-harness/relocation-smoke.ts` runs
  `prepareRelocatedPackage` and the I1-28 installed denial and restore in an
  external copy. It skips `testRelocatedPackage`, which runs the copied
  toolkit's full `npm test`. It gives no matrix credit.
- New package consumer `scripts/reference-harness/fixtures/module-tree-consumer/`
  has its own manifest with `react`/`react-dom` 19.2.8, TypeScript 7.0.2,
  Vite 8.3.0, jsdom, tsx and types. It also has its own `tsconfig.json`
  (Bundler resolution, `vite/client` types), `index.html`, `src/main.tsx` (the
  only stylesheet import), `src/app.tsx` and `src/render-check.tsx`, and a
  `jsdom-globals.mjs` preload. Neither `tsconfig.scripts.json` nor the harness
  `tsconfig.json` includes it.
- New runner `scripts/reference-harness/module-tree-consumer.ts`. It:
  1. requires the built entry files;
  2. copies the fixture outside the checkout into a temporary directory with
     no enclosing `node_modules`;
  3. requires that consumer source imports only `ramify.ts/module-tree` and
     `ramify.ts/module-tree.css`;
  4. runs `npm pack` on the checkout and installs the tarball
     (`file:ramify.ts.tgz`);
  5. checks the installed manifest's entries and peers;
  6. counts `react` and `react-dom` copies on disk and with `npm ls`;
  7. runs `tsc`, then `vite build`, then checks the built CSS;
  8. runs the jsdom render (`node --import ./jsdom-globals.mjs --import tsx
     src/render-check.tsx`);
  9. runs the plain-Node load probe (a `module.registerHooks` resolve
     recorder, with no loader flags) on `ramify.ts/presentation` and on
     `ramify.ts/module-tree`.
- The harness README gained a "Module-tree package surface" section.
- `subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` pins every
  `module.ramify`. Iteration 1 left it failing: the project-view canvas
  statements were missing. It now pins both the project-view statements and
  the new presentation P6 statements.

## Stylesheet mechanism

The production selection copies selected non-compiler source files verbatim
into `dist/` (`promoteProductionArtifacts`). It cannot concatenate or emit a
derived file. The packaged stylesheet is therefore a source stylesheet in
`presentation/src` with two `@import` rules:

```css
@import '@xyflow/react/dist/style.css';
@import '../subs/project-view/src/module-tree-canvas.css';
```

The consumer keeps its single import, `import 'ramify.ts/module-tree.css'`. Its
CSS bundler inlines both rules. `@xyflow/react/dist/style.css` resolves from the
installed `@xyflow/react` dependency, and the relative import resolves to the
promoted `module-tree-canvas.css`.

The consumer's Vite build emits one CSS asset of 16,984 bytes. It holds the
React Flow base rules (`.react-flow__pane`, `__viewport`, `__minimap`,
`__controls`) and the canvas rules (`.module-tree__canvas`, `__node--muted`,
`__node--provisional`, `__node-body`, `__toggle`). It contains no unresolved
`@import` and none of the explorer-only rules (`.module-arch__radial-canvas`,
`.module-tree__node-content`).

Limit: a consumer without a CSS bundler, such as a plain `<link>`, must itself
resolve the bare `@import`. The explorer-only `project-view.css` and
`module-tree.css` are not part of the entry.

## Runner outcomes

| Command | Result |
| --- | --- |
| `npx tsx scripts/reference-harness/module-tree-consumer.ts` | **passed**, 47 assertions |
| `npx tsx scripts/reference-harness/relocation-smoke.ts` | **passed**, 74 assertions (baseline and installed denial and restore) |

Consumer runner details:

- The tarball has 2,965 files and holds `module-tree-entry.{js,d.ts,css}`,
  `ModuleTreeCanvas.{js,d.ts}` and `module-tree-canvas.css`.
- The installed manifest has no `react` or `react-dom` in `dependencies`.
  Both are peers, marked optional.
- Exactly one `node_modules/react` and one `node_modules/react-dom` are on
  disk. `npm ls react --all` reports the single version 19.2.8.
- The type check and the Vite build pass.
- The jsdom render uses real React Flow under the consumer's React. Five
  cases pass, with no `console.error`:
  - hook-using bodies render in four variable-height nodes (48 to 272 px),
    with the muted and provisional shells;
  - children are placed below their parents and siblings stay apart;
  - a body button keeps its `useState` state, carries `nodrag nopan` and does
    not select its node, while a shell click does select it;
  - the collapse control shows `+1`;
  - no invalid-hook-call or duplicate-React error occurs.
- Plain-Node probe (CM22):
  - `ramify.ts/presentation` resolves 318 modules, no `@xyflow/react`, no
    stylesheet.
  - Negative control `ramify.ts/module-tree` resolves `@xyflow/react`
    (`xyflow: true`) and no stylesheet.

Relocation runner details:

- Assertions cover the clean copy, `npm ci`, the build and type check, and the
  compiled reference baseline.
- Every declared entry and the stylesheet are in the tarball, and the optional
  peers assertion holds.
- The install includes the consumer's React. All nine JS entries import under
  Node, and the stylesheet resolves to its packed file.
- The installed command's baseline, denial and restore pass.

## Other verification

| Command | Result |
| --- | --- |
| `npm run type-check` | clean |
| `npm run build` | success. `dist/subs/presentation/src/module-tree-entry.{js,d.ts,css}` are promoted. |
| `npm run check:self` | passed: 15 owners, 0 errors, 0 warnings, the same 10 pre-existing `signature-inferred` limits |
| `npx vitest run subs/presentation/subs/project-view/src/tests subs/analysis/subs/descriptions/src/tests/descriptions.test.ts` | 7 files, 127 tests passed |
| `npx vitest run -c scripts/reference-harness/vitest.config.ts scripts/reference-harness/relocation.test.ts` | 4 passed |

The full `npm test` was not run, by instruction. The daemons that
`check:self` and the explorer session started were stopped with
`dist/src/ramify daemon stop`. The explorer web process was stopped by its
PID.

## MT14 and bundle size (CM13)

`npm run measure:project-explorer -- --only tree --output …/iteration2-artifacts/tree-browser-acceptance.json`
ran Chromium on the rebuilt explorer and **passed**. Evidence:
[tree-browser-acceptance.json](iteration2-artifacts/tree-browser-acceptance.json).

- **MT14 (toolkit, 15 modules):**
  - Collapsing `ramify/analysis` labelled its toggle `+4` and left 11 nodes;
    expanding restored them.
  - Selecting `ramify/analysis/model` showed its README paragraph.
  - Double-clicking it opened `/analysis/latest?module=ramify%2Fanalysis%2Fmodel`
    with breadcrumb `All Modules / ramify / analysis`.
  - "Show in module tree" returned to `/modules/latest?module=ramify%2Fanalysis%2Fmodel`.
  - The full-height fit held at 1440×1000 and 1100×700, with 15 minimap marks.
  - No console errors.
- **MT15:** the refresh after adding `fixture/extra` kept `fixture/provider`
  selected, moving from revision 1 to revision 2.
- **MT16 (reference):** first render took 43 ms. Collapse and expand of
  `collection-review/workspace` took 29 and 33 ms.

Screenshots from a separate manual Playwright session on
`ramify explore --root .`, at 1440×1000:

- [initial tree](iteration2-artifacts/it2-modules-latest-initial.png)
- [`ramify/analysis` collapsed](iteration2-artifacts/it2-modules-latest-collapsed.png)
- [`ramify/analysis/model` selected with its detail](iteration2-artifacts/it2-modules-latest-model-selected.png)

The only console message was React Flow's attribution warning. It predates
this iteration.

**Explorer bundle delta: 0 bytes.** Before the edits, the build at 56b0c38
produced `index-CAiLSvLx.js` (713,135 bytes raw, 207,018 gzipped by
`node:zlib`) and `index-BKrLaVB7.css` (34,072 bytes). The rebuilt explorer
emits the same content-hashed files at the same sizes. The explorer source
graph is unchanged, since the new entry and stylesheet are not imported by
it. MT16's own measurement shows 13,145 gzipped bytes added over Plan 6B's
recorded 193,873-byte baseline, within its 25 KiB budget. That growth
predates this iteration.

## Acceptance rows

| Row | Evidence |
| --- | --- |
| CM10, iteration 2 part | Consumer runner: tarball install, type check, Vite build, a hook-using body rendered in variable-height nodes, exactly one `react` |
| CM13, iteration 2 part | MT14–MT16 browser acceptance and the unchanged explorer bundle |
| CM22 | Consumer runner, plain-Node load probe |
| CM23 | Both runners: tarball contents, optional peers absent from `dependencies`, built CSS from one import, relocation with every earlier entry importable |
| CM24, iteration 2 part | A search of the new and changed Ramify files for agent or capability names found no match |

## Deviations and notes

1. **No Vitest in the consumer.** A fresh `npm install` of `vitest@4.1.11`
   with npm 10.9.8 fails with `Cannot read properties of null (reading
   'edgesOut')` in arborist's `#loadPeerSet`. It fails even with vitest as the
   only dependency. The render check therefore runs under `tsx` with a jsdom
   preload, using `node:assert`. This avoids `--legacy-peer-deps`, which
   would have weakened peer resolution in the one-React evidence.
2. **Stylesheet by `@import`.** This is the recorded mechanism above, because
   the production selection cannot emit a combined file.
3. **The consumer packs the working checkout.** It packs the built worktree
   directly, not a clean copy. The relocation runner covers the clean-copy
   path.
4. **Descriptions fixture.** `descriptions.test.ts`, in the `analysis`
   owner's tests, was out of this iteration's owner scope. It was updated to
   fix the failure iteration 1 left and to pin P6.
5. **Screenshots were moved.** The Playwright MCP could only write under
   `/ramify/.playwright-mcp`. The three PNGs were moved from there into this
   worktree's artifacts directory. That tool also leaves its own
   console and snapshot logs in `/ramify/.playwright-mcp`.

## Open issues

- **Historical Plan 2 and Plan 2B package gates now fail.** Several frozen
  gates compare the manifest's `exports` exactly against the reviewed eight
  entries: `validatePackageEntries` in `scripts/validate-final-contracts.ts`,
  `completion-cases.ts`, `plan5-completion-cases.ts`, and `entryClosures` in
  `plan2b-cases.ts`. They also pass the eight-entry `completionEntries` to
  `prepareRelocatedPackage`. `completion-regression.ts` also matches the old
  assertion name "all eight …". Those gates will report the two new exports
  as a difference if run again. They were left unchanged as historical
  contracts. Accepting the new surface there, for example by comparing the
  reviewed subset, is a decision for their owners.
- I1-28 still needs `testRelocatedPackage`, the copied full `npm test`,
  through `npm run reference:verify` for matrix credit. `relocation-smoke.ts`
  does not claim it.

## Successor inputs (iteration 5)

- Import only `ramify.ts/module-tree` and `ramify.ts/module-tree.css`, once,
  after `npm run build` from the repository root.
- React is now an optional peer. The linked `file:..` checkout still holds
  Ramify's React as a development dependency, so the plan's `resolve.dedupe`
  and Vitest inline settings remain necessary.
