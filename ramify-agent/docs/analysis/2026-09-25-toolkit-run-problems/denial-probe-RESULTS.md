# Ramify diagnostic probe: what `ramify check` prints today

Date: 2026-09-24. CLI: /ramify/dist/src/ramify (version 0.0.0; the ramify-agent harness's node_modules/.bin/ramify symlinks to the same build).
Project: pristine fixture /ramify/ramify-agent/fixtures/collection-review copied to ./project (node_modules symlinked to the trial copy), git baseline commit, then the violations commit, then extras.
Resident daemon: private endpoint via RAMIFY_ENDPOINT_DIR (a short /tmp/rfyp.* dir, because the scratchpad path makes the socket path exceed 100 bytes: `Error [internal-error]: Daemon socket path exceeds 100 bytes; choose a shorter RAMIFY_ENDPOINT_DIR`, exit 2). Stopped with `ramify daemon stop` and the dir removed.
Note: the CLI flag is `--format json`, not `--json`; the daemon stop command is `ramify daemon stop`.

Raw captures in this directory: a-human.txt (batch human), b.json (batch JSON, ramify.analysis/1), c.json / c-human-warm.txt (changed, ramify.check/1), c-human-incr.txt (changed with --since after an incremental revision), d-harness.txt, d-harness2.txt (harness text), x1-*.{txt,json} (extras), desc-*.{txt,json} (description error), nc-human.txt / nc.json (not-checked), harness-probe.mts, harness-probe2.mts.

## Baseline

`ramify check --batch` on the pristine copy: exit 0, `Findings: 0 errors, 2 warnings, 12 analysis limits; 173 allowed, 0 denied, 130 external` (2 outside-module-source warnings for vite.config.ts / vitest.config.ts, 12 signature-inferred analysis limits).

With all five violations planted: exit 1, `Findings: 6 errors, 2 warnings, 12 analysis limits; 175 allowed, 4 denied, 130 external`. The two missing-export errors are not counted as denied accesses.

## General observations

- Batch human output prints `Importer:`, `Original:` and `Related:` continuation lines for access findings; the changed (hook) human output prints only the one headline line, prefixed `Error [new]` when the finding is new relative to --since (with no --since every finding is `[new]`).
- A changed check reports **every** standing finding in the project, not only those located in the named files (all 6 appear for `--changed runtime.ts`).
- The changed JSON document (ramify.check/1) keeps findings under `findings` with an extra `"new": true`, and `removed` as a list of diagnostic ids; the batch document (ramify.analysis/1) keeps them under `diagnostics`. Diagnostic objects are otherwise identical (same ids).
- ramify.check/1 `outcome` is `"checked"` even with findings (exit code 1 carries the verdict).
- The message for access codes is terse: `<owner>:<file>#<binding>: <code>[ (<tag>)]`. It names no exposure path, no missing tag's kind, and no remedy. testing-origin repeats the same path twice after `via`.
- Warnings (`warnings`) and analysis limits (`coverage`) are separate arrays; the harness's `findingsOf` reads only `findings` and `diagnostics`, so the engineer never sees warnings or analysis limits.
- The harness identity (`findingIdentities`) is `code=...\u001fmessage=...` only: `location` is nested so file/line are not part of it.

## not-visible

Planted at subs/workspace/subs/reviews/subs/core/src/runtime.ts:1:

```ts
import { findRecord } from '../../../../catalog/subs/core/src/records.js';
```

reviews/core (untagged) imports catalog/core's private `findRecord` (records.ts is not exposed by catalog/core).

### (a) `ramify check --batch` (human)

```text
Error [not-visible] subs/workspace/subs/reviews/subs/core/src/runtime.ts:1:10: collection-review/workspace/catalog/core:records.ts#findRecord: not-visible
  Importer: collection-review/workspace/reviews/core (ordinary; tags: none)
  Original: collection-review/workspace/catalog/core/records.ts#findRecord
  Related: subs/workspace/subs/catalog/subs/core/src/records.ts:50:1
```

### (b) `ramify check --batch --format json` diagnostic object(s)

```json
{
  "id": "source-diagnostic/1:75e31fce77368f8d48f16efb8c1463035d3d4d216d03b7806f1badf046be22f5",
  "category": "import",
  "code": "not-visible",
  "message": "collection-review/workspace/catalog/core:records.ts#findRecord: not-visible",
  "location": {
    "file": "subs/workspace/subs/reviews/subs/core/src/runtime.ts",
    "start": 9,
    "end": 19,
    "line": 1,
    "column": 10
  },
  "related": [
    {
      "file": "subs/workspace/subs/catalog/subs/core/src/records.ts",
      "start": 1623,
      "end": 1759,
      "line": 50,
      "column": 1
    }
  ],
  "importer": {
    "owner": "collection-review/workspace/reviews/core",
    "kind": "ordinary",
    "root": "subs/workspace/subs/reviews/subs/core/src",
    "profile": []
  },
  "original": {
    "kind": "code",
    "owner": "collection-review/workspace/catalog/core",
    "file": "records.ts",
    "binding": "findRecord"
  },
  "accessId": "access/1:d62342062f4fed7a122b74d882194c115079310b797268e8951a3be2819c68cd"
}
```

### (c) `ramify check --changed <file>` (resident; human line)

```text
Error [new] [not-visible] subs/workspace/subs/reviews/subs/core/src/runtime.ts:1:10: collection-review/workspace/catalog/core:records.ts#findRecord: not-visible
```

In the changed JSON (ramify.check/1) the same object appears under `findings` with `"new": true` appended.

### (d) ramify-agent harness

`findingsOf` result and `sentenceOf` (identical for the batch and changed documents):

```text
HookFinding: {"identity":"code=not-visible\u001fmessage=collection-review/workspace/catalog/core:records.ts#findRecord: not-visible","code":"not-visible","message":"collection-review/workspace/catalog/core:records.ts#findRecord: not-visible","file":"subs/workspace/subs/reviews/subs/core/src/runtime.ts","line":1,"importer":"collection-review/workspace/reviews/core","original":{"owner":"collection-review/workspace/catalog/core","file":"records.ts","binding":"findRecord"}}
sentenceOf: subs/workspace/subs/reviews/subs/core/src/runtime.ts:1 imports `findRecord` from subs/workspace/subs/catalog/subs/core/src/records.ts (module `collection-review/workspace/catalog/core`), which does not expose it to your module. `import type` counts too.
```

What the engineer's tool result carries (the unexported `describe`, driven through `runHookCheck` with a fake RamifyCli returning the captured changed document filtered to this one finding):

```text
RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.
- subs/workspace/subs/reviews/subs/core/src/runtime.ts:1 imports `findRecord` from subs/workspace/subs/catalog/subs/core/src/records.ts (module `collection-review/workspace/catalog/core`), which does not expose it to your module. `import type` counts too.
Fix: drop the import and use what your API view, named in your assignment, lists instead. If nothing there serves, submit `unsuitable` with reason `scope`, naming `findRecord` and its owner: the architect decides whether it is exposed. Say so if a symbol you already receive mentions it in its signature; that is an incomplete exposure. Never copy or derive it, and `collection-review/workspace/catalog/core`'s module.ramify is outside your write scope. `completion-proposed` is refused while this stands.
```

## required-importer-tag

Planted at subs/workspace/subs/catalog/subs/core/src/catalog.ts:1:

```ts
import { StatusBadge } from '../../../../shared-ui/src/status-badge.js';
```

catalog/core (untagged) imports `StatusBadge`, visible via workspace `expose-sub * from shared-ui to descendants`, tagged [ui, browser]; `ui` is required-importer.

### (a) `ramify check --batch` (human)

```text
Error [required-importer-tag] subs/workspace/subs/catalog/subs/core/src/catalog.ts:1:10: collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)
  Importer: collection-review/workspace/catalog/core (ordinary; tags: none)
  Original: collection-review/workspace/shared-ui/status-badge.tsx#StatusBadge
  Related: subs/workspace/module.ramify:26:1
  Related: subs/workspace/subs/shared-ui/module.ramify:10:1
  Related: subs/workspace/subs/shared-ui/module.ramify:10:66
  Related: subs/workspace/subs/shared-ui/src/status-badge.tsx:32:1
```

### (b) `ramify check --batch --format json` diagnostic object(s)

```json
{
  "id": "source-diagnostic/1:49fb5a1750f405ed944f28d26fbb51787aa2694dfced86b35e5aae65275fa8e0",
  "category": "import",
  "code": "required-importer-tag",
  "message": "collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)",
  "location": {
    "file": "subs/workspace/subs/catalog/subs/core/src/catalog.ts",
    "start": 9,
    "end": 20,
    "line": 1,
    "column": 10
  },
  "related": [
    {
      "file": "subs/workspace/module.ramify",
      "start": 1382,
      "end": 1424,
      "line": 26,
      "column": 1
    },
    {
      "file": "subs/workspace/subs/shared-ui/module.ramify",
      "start": 432,
      "end": 527,
      "line": 10,
      "column": 1
    },
    {
      "file": "subs/workspace/subs/shared-ui/module.ramify",
      "start": 497,
      "end": 517,
      "line": 10,
      "column": 66
    },
    {
      "file": "subs/workspace/subs/shared-ui/src/status-badge.tsx",
      "start": 1049,
      "end": 1255,
      "line": 32,
      "column": 1
    }
  ],
  "importer": {
    "owner": "collection-review/workspace/catalog/core",
    "kind": "ordinary",
    "root": "subs/workspace/subs/catalog/subs/core/src",
    "profile": []
  },
  "original": {
    "kind": "code",
    "owner": "collection-review/workspace/shared-ui",
    "file": "status-badge.tsx",
    "binding": "StatusBadge"
  },
  "accessId": "access/1:16d25b263be938bfa8f3313ca729d900fbffa6098472bc9882c0a4f98b9f467b"
}
```

### (c) `ramify check --changed <file>` (resident; human line)

```text
Error [new] [required-importer-tag] subs/workspace/subs/catalog/subs/core/src/catalog.ts:1:10: collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)
```

In the changed JSON (ramify.check/1) the same object appears under `findings` with `"new": true` appended.

### (d) ramify-agent harness

`findingsOf` result and `sentenceOf` (identical for the batch and changed documents):

```text
HookFinding: {"identity":"code=required-importer-tag\u001fmessage=collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)","code":"required-importer-tag","message":"collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)","file":"subs/workspace/subs/catalog/subs/core/src/catalog.ts","line":1,"importer":"collection-review/workspace/catalog/core","original":{"owner":"collection-review/workspace/shared-ui","file":"status-badge.tsx","binding":"StatusBadge"}}
sentenceOf: subs/workspace/subs/catalog/subs/core/src/catalog.ts:1 imports `StatusBadge` from subs/workspace/subs/shared-ui/src/status-badge.tsx (module `collection-review/workspace/shared-ui`), which requires an importer tag your module does not carry: collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)
```

What the engineer's tool result carries (the unexported `describe`, driven through `runHookCheck` with a fake RamifyCli returning the captured changed document filtered to this one finding):

```text
RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.
- subs/workspace/subs/catalog/subs/core/src/catalog.ts:1 imports `StatusBadge` from subs/workspace/subs/shared-ui/src/status-badge.tsx (module `collection-review/workspace/shared-ui`), which requires an importer tag your module does not carry: collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)
Fix: drop the import and use what your API view, named in your assignment, lists instead. If nothing there serves, submit `unsuitable` with reason `scope`, naming `StatusBadge` and its owner: the architect decides whether it is exposed. Say so if a symbol you already receive mentions it in its signature; that is an incomplete exposure. Never copy or derive it, and `collection-review/workspace/shared-ui`'s module.ramify is outside your write scope. `completion-proposed` is refused while this stands.
```

## required-symbol-tag

Planted at subs/workspace/src/client.ts:1:

```ts
import { createFacilities } from '../../../src/protocol.js';
```

workspace [ui, browser, dispatch] value-imports root `createFacilities` (exposed to descendants, tags [dispatch], no browser); `browser` is required-symbol.

### (a) `ramify check --batch` (human)

```text
Error [required-symbol-tag] subs/workspace/src/client.ts:1:10: collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)
  Importer: collection-review/workspace (ordinary; tags: browser, dispatch, ui)
  Original: collection-review/protocol.ts#createFacilities
  Related: module.ramify:10:1
  Related: src/protocol.ts:24:1
```

### (b) `ramify check --batch --format json` diagnostic object(s)

```json
{
  "id": "source-diagnostic/1:8dad93ae43c3379a7d76e3605d90c69ffcf309025412c949bd25254f89c63db1",
  "category": "import",
  "code": "required-symbol-tag",
  "message": "collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)",
  "location": {
    "file": "subs/workspace/src/client.ts",
    "start": 9,
    "end": 25,
    "line": 1,
    "column": 10
  },
  "related": [
    {
      "file": "module.ramify",
      "start": 576,
      "end": 637,
      "line": 10,
      "column": 1
    },
    {
      "file": "src/protocol.ts",
      "start": 835,
      "end": 930,
      "line": 24,
      "column": 1
    }
  ],
  "importer": {
    "owner": "collection-review/workspace",
    "kind": "ordinary",
    "root": "subs/workspace/src",
    "profile": [
      "browser",
      "dispatch",
      "ui"
    ]
  },
  "original": {
    "kind": "code",
    "owner": "collection-review",
    "file": "protocol.ts",
    "binding": "createFacilities"
  },
  "accessId": "access/1:8f41ff2dd5ebc363de0473a65f4e8a159c8e08add82a58e54298281ffd25e25c"
}
```

### (c) `ramify check --changed <file>` (resident; human line)

```text
Error [new] [required-symbol-tag] subs/workspace/src/client.ts:1:10: collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)
```

In the changed JSON (ramify.check/1) the same object appears under `findings` with `"new": true` appended.

### (d) ramify-agent harness

`findingsOf` result and `sentenceOf` (identical for the batch and changed documents):

```text
HookFinding: {"identity":"code=required-symbol-tag\u001fmessage=collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)","code":"required-symbol-tag","message":"collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)","file":"subs/workspace/src/client.ts","line":1,"importer":"collection-review/workspace","original":{"owner":"collection-review","file":"protocol.ts","binding":"createFacilities"}}
sentenceOf: subs/workspace/src/client.ts:1 imports `createFacilities` from src/protocol.ts (module `collection-review`), which carries a tag your module does not accept: collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)
```

What the engineer's tool result carries (the unexported `describe`, driven through `runHookCheck` with a fake RamifyCli returning the captured changed document filtered to this one finding):

```text
RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.
- subs/workspace/src/client.ts:1 imports `createFacilities` from src/protocol.ts (module `collection-review`), which carries a tag your module does not accept: collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)
Fix: drop the import and use what your API view, named in your assignment, lists instead. If nothing there serves, submit `unsuitable` with reason `scope`, naming `createFacilities` and its owner: the architect decides whether it is exposed. Say so if a symbol you already receive mentions it in its signature; that is an incomplete exposure. Never copy or derive it, and `collection-review`'s module.ramify is outside your write scope. `completion-proposed` is refused while this stands.
```

## testing-origin

Planted at subs/workspace/subs/reviews/src/session.ts:1:

```ts
import { makeCatalogFixture } from '../../catalog/subs/core/src/tests/fixture.js';
```

reviews ordinary source imports catalog/core's test fixture (expose-test, relayed to workspace descendants).

### (a) `ramify check --batch` (human)

```text
Error [testing-origin] subs/workspace/subs/reviews/src/session.ts:1:10: collection-review/workspace/catalog/core:tests/fixture.ts#makeCatalogFixture: testing-origin via subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts, subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts
  Importer: collection-review/workspace/reviews (ordinary; tags: dispatch)
  Original: collection-review/workspace/catalog/core/tests/fixture.ts#makeCatalogFixture
  Related: subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts:21:1
```

### (b) `ramify check --batch --format json` diagnostic object(s)

```json
{
  "id": "source-diagnostic/1:f1cbe7c618648656fccd88d0fe70ce0f58e7965538cc8ff38d5fcf770a1b34a8",
  "category": "import",
  "code": "testing-origin",
  "message": "collection-review/workspace/catalog/core:tests/fixture.ts#makeCatalogFixture: testing-origin via subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts, subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts",
  "location": {
    "file": "subs/workspace/subs/reviews/src/session.ts",
    "start": 9,
    "end": 27,
    "line": 1,
    "column": 10
  },
  "related": [
    {
      "file": "subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts",
      "start": 706,
      "end": 935,
      "line": 21,
      "column": 1
    }
  ],
  "importer": {
    "owner": "collection-review/workspace/reviews",
    "kind": "ordinary",
    "root": "subs/workspace/subs/reviews/src",
    "profile": [
      "dispatch"
    ]
  },
  "original": {
    "kind": "code",
    "owner": "collection-review/workspace/catalog/core",
    "file": "tests/fixture.ts",
    "binding": "makeCatalogFixture"
  },
  "accessId": "access/1:6ebb3e7cdd677c0e41d6a7e262c1b34e6c78bee93d7276dc38744917ef5d7032"
}
```

### (c) `ramify check --changed <file>` (resident; human line)

```text
Error [new] [testing-origin] subs/workspace/subs/reviews/src/session.ts:1:10: collection-review/workspace/catalog/core:tests/fixture.ts#makeCatalogFixture: testing-origin via subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts, subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts
```

In the changed JSON (ramify.check/1) the same object appears under `findings` with `"new": true` appended.

### (d) ramify-agent harness

`findingsOf` result and `sentenceOf` (identical for the batch and changed documents):

```text
HookFinding: {"identity":"code=testing-origin\u001fmessage=collection-review/workspace/catalog/core:tests/fixture.ts#makeCatalogFixture: testing-origin via subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts, subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts","code":"testing-origin","message":"collection-review/workspace/catalog/core:tests/fixture.ts#makeCatalogFixture: testing-origin via subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts, subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts","file":"subs/workspace/subs/reviews/src/session.ts","line":1,"importer":"collection-review/workspace/reviews","original":{"owner":"collection-review/workspace/catalog/core","file":"tests/fixture.ts","binding":"makeCatalogFixture"}}
sentenceOf: subs/workspace/subs/reviews/src/session.ts:1 imports `makeCatalogFixture` from subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts (module `collection-review/workspace/catalog/core`), which is test code; non-test source may not import it.
```

What the engineer's tool result carries (the unexported `describe`, driven through `runHookCheck` with a fake RamifyCli returning the captured changed document filtered to this one finding):

```text
RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.
- subs/workspace/subs/reviews/src/session.ts:1 imports `makeCatalogFixture` from subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts (module `collection-review/workspace/catalog/core`), which is test code; non-test source may not import it.
Fix: drop the import and use what your API view, named in your assignment, lists instead. If nothing there serves, submit `unsuitable` with reason `scope`, naming `makeCatalogFixture` and its owner: the architect decides whether it is exposed. Say so if a symbol you already receive mentions it in its signature; that is an incomplete exposure. Never copy or derive it, and `collection-review/workspace/catalog/core`'s module.ramify is outside your write scope. `completion-proposed` is refused while this stands.
```

## missing-export

Planted at subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1 (cross-module) and subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:1 (same-module):

```ts
import { reviewVerdictSchema } from '../../../../../../contracts/src/interfaces/vocabulary.js';
import { formatFindings } from './format.js';
```

Names that the target files do not export.

### (a) `ramify check --batch` (human)

```text
Error [missing-export] subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1:10: subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema
  Importer: collection-review/workspace/reviews/core/controller (ordinary; tags: none)
Error [missing-export] subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:1:10: subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings
  Importer: collection-review/workspace/reviews/ui/pure-ui (ordinary; tags: browser, ui)
```

### (b) `ramify check --batch --format json` diagnostic object(s)

```json
{
  "id": "source-diagnostic/1:4fab4e0c0e1dec681c9eb1ae68440477ec3cd3b8b57f2d327a7dcae21ac60e86",
  "category": "missing-export",
  "code": "missing-export",
  "message": "subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema",
  "location": {
    "file": "subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts",
    "start": 9,
    "end": 28,
    "line": 1,
    "column": 10
  },
  "related": [],
  "importer": {
    "owner": "collection-review/workspace/reviews/core/controller",
    "kind": "ordinary",
    "root": "subs/workspace/subs/reviews/subs/core/subs/controller/src",
    "profile": []
  },
  "original": null,
  "accessId": "access/1:7d8bd6f2b909ab25e846ed5f43f30644e0217ae7a945e839656a69c1207001c1"
}
{
  "id": "source-diagnostic/1:a80363bd0f64d16a997b2a56f8c15dee46b83bff7ceee4ebf5d5166aa81194da",
  "category": "missing-export",
  "code": "missing-export",
  "message": "subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings",
  "location": {
    "file": "subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx",
    "start": 9,
    "end": 23,
    "line": 1,
    "column": 10
  },
  "related": [],
  "importer": {
    "owner": "collection-review/workspace/reviews/ui/pure-ui",
    "kind": "ordinary",
    "root": "subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src",
    "profile": [
      "browser",
      "ui"
    ]
  },
  "original": null,
  "accessId": "access/1:1744dfacaf81f268eca7b8bda8af9802db8f4d844f4f6191b443e94d2aac4577"
}
```

### (c) `ramify check --changed <file>` (resident; human line)

```text
Error [new] [missing-export] subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1:10: subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema
Error [new] [missing-export] subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:1:10: subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings
```

In the changed JSON (ramify.check/1) the same object appears under `findings` with `"new": true` appended.

### (d) ramify-agent harness

`findingsOf` result and `sentenceOf` (identical for the batch and changed documents):

```text
HookFinding: {"identity":"code=missing-export\u001fmessage=subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema","code":"missing-export","message":"subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema","file":"subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts","line":1,"importer":"collection-review/workspace/reviews/core/controller","original":null}
sentenceOf: subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1 imports a name its target does not export: subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema
HookFinding: {"identity":"code=missing-export\u001fmessage=subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings","code":"missing-export","message":"subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings","file":"subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx","line":1,"importer":"collection-review/workspace/reviews/ui/pure-ui","original":null}
sentenceOf: subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:1 imports a name its target does not export: subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings
```

What the engineer's tool result carries (the unexported `describe`, driven through `runHookCheck` with a fake RamifyCli returning the captured changed document filtered to this one finding):

```text
RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.
- subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1 imports a name its target does not export: subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema
Fix it inside your write scope, or submit `contract-needed`, or `unsuitable` with reason `scope`. `completion-proposed` is refused while this stands.
```

## Changed (hook) form: full human framing

Cold daemon, first `ramify check --changed subs/workspace/subs/reviews/subs/core/src/runtime.ts` (it waited 1598.9 ms for the cold revision and answered; it did not reply not-checked): exit 1.

```text
Root: /tmp/claude-1000/-ramify/6a2bf574-0998-4a1c-8378-30d81072a078/scratchpad/diag-probe/project
Mode: resident (revision 1; cold)
... (the six Error [new] lines above, 2 warnings, 12 analysis limits)
Checked: subs/workspace/subs/reviews/subs/core/src/runtime.ts; checked set: 60 files (src/assembly.ts, src/interfaces/protocol.ts, src/main.ts, src/protocol.ts, src/server.ts, src/tests/assembly.test.ts, src/tests/http.test.ts, src/tests/protocol-typing.test.ts, src/tests/setup.ts, subs/integration-... (all 60 files listed) ..., 309 accesses; wait: 1598.9 ms; findings: 6
```

After an incremental edit (a blank line appended to runtime.ts) with `--since rev/1:...:1` (revision 2; unchanged-surface): the `[new]` markers disappear.

```text
Root: /tmp/claude-1000/-ramify/6a2bf574-0998-4a1c-8378-30d81072a078/scratchpad/diag-probe/project
Mode: resident (revision 2; unchanged-surface)
Error [required-symbol-tag] subs/workspace/src/client.ts:1:10: collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)
Error [required-importer-tag] subs/workspace/subs/catalog/subs/core/src/catalog.ts:1:10: collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)
Error [testing-origin] subs/workspace/subs/reviews/src/session.ts:1:10: collection-review/workspace/catalog/core:tests/fixture.ts#makeCatalogFixture: testing-origin via subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts, subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts
Error [not-visible] subs/workspace/subs/reviews/subs/core/src/runtime.ts:1:10: collection-review/workspace/catalog/core:records.ts#findRecord: not-visible
Error [missing-export] subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1:10: subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema
Error [missing-export] subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:1:10: subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings
Warning [outside-module-source] vite.config.ts: 1 compiler-selected files outside module source
Warning [outside-module-source] vitest.config.ts: 1 compiler-selected files outside module source
Checked: subs/workspace/subs/reviews/subs/core/src/runtime.ts; checked set: 1 files (subs/workspace/subs/reviews/subs/core/src/runtime.ts), 0 accesses; wait: 49.4 ms; findings: 6

```

(Whether analysis limits are printed in this form: yes.)

Changed JSON top level (c.json, findings/coverage/checked.files elided):

```json
{
  "schemaVersion": "ramify.check/1",
  "root": "/tmp/claude-1000/-ramify/6a2bf574-0998-4a1c-8378-30d81072a078/scratchpad/diag-probe/project",
  "revision": {
    "id": "rev/1:4dbf6593-68f6-4ff9-8c7e-becff4f2ae07:1",
    "sequence": 1,
    "path": "cold"
  },
  "since": null,
  "changed": [
    {
      "path": "subs/workspace/subs/reviews/subs/core/src/runtime.ts",
      "sha256": "36a8384fd49d26d9c1a44f0c0462044ecd9b7382d6463834c341db7004ac7562",
      "covered": true
    }
  ],
  "outcome": "checked",
  "reason": null,
  "execution": "completed",
  "findings": "[6 objects]",
  "removed": [],
  "warnings": [
    {
      "code": "outside-module-source",
      "entry": "vite.config.ts",
      "count": 1,
      "files": [
        "vite.config.ts"
      ]
    },
    {
      "code": "outside-module-source",
      "entry": "vitest.config.ts",
      "count": 1,
      "files": [
        "vitest.config.ts"
      ]
    }
  ],
  "coverage": "[12 objects]",
  "checked": {
    "path": "cold",
    "files": "[60 paths]",
    "accesses": 309,
    "modelRebuilt": true
  },
  "timings": {
    "daemon": {
      "classify": 0,
      "inventory": 212.019501,
      "compiler": 488.662622,
      "descriptions": 182.975455,
      "accesses": 110.56972999999994,
      "link": 21.070748999999978,
      "decide": 20.741044999999986,
      "companions": 2.810999999999922,
      "publish": 13.416869000000133,
      "total": 1493.813357
    },
    "waitedMs": 0.769680000000001,
    "totalMs": 8.093462999999998,
    "reply": {
      "invocationCheck": 0,
      "promotion": 0,
      "workerStatus": 0,
      "workerRoundTrip": 0,
      "sweep": 0,
      "publication": 0,
      "service": 0.33783800000037445,
      "clientTransport": 0.358356999999625
    }
  },
  "exitCode": 1
}
```

## Harness: all six together

`runHookCheck(...).text` (describe) for the first changed check of an invocation that reports all six:

```text
RAMIFY MODULE VIOLATIONS. The iteration gate fails while they stand.
- subs/workspace/src/client.ts:1 imports `createFacilities` from src/protocol.ts (module `collection-review`), which carries a tag your module does not accept: collection-review:protocol.ts#createFacilities: required-symbol-tag (browser)
- subs/workspace/subs/catalog/subs/core/src/catalog.ts:1 imports `StatusBadge` from subs/workspace/subs/shared-ui/src/status-badge.tsx (module `collection-review/workspace/shared-ui`), which requires an importer tag your module does not carry: collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui)
- subs/workspace/subs/reviews/src/session.ts:1 imports `makeCatalogFixture` from subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts (module `collection-review/workspace/catalog/core`), which is test code; non-test source may not import it.
- subs/workspace/subs/reviews/subs/core/src/runtime.ts:1 imports `findRecord` from subs/workspace/subs/catalog/subs/core/src/records.ts (module `collection-review/workspace/catalog/core`), which does not expose it to your module. `import type` counts too.
- subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1 imports a name its target does not export: subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema
- subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:1 imports a name its target does not export: subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings
Fix: drop the import and use what your API view, named in your assignment, lists instead. If nothing there serves, submit `unsuitable` with reason `scope`, naming the symbol and its owner: the architect decides whether it is exposed. Say so if a symbol you already receive mentions it in its signature; that is an incomplete exposure. Never copy or derive it, and `collection-review` or `collection-review/workspace/shared-ui` or `collection-review/workspace/catalog/core`'s module.ramify is outside your write scope. `completion-proposed` is refused while these stand.
```

`openFindingsMessage` (completion refusal) for all six:

```text
RAMIFY MODULE VIOLATIONS still standing; the iteration gate fails on them. subs/workspace/src/client.ts:1 imports `createFacilities` from src/protocol.ts (module `collection-review`), which carries a tag your module does not accept: collection-review:protocol.ts#createFacilities: required-symbol-tag (browser) subs/workspace/subs/catalog/subs/core/src/catalog.ts:1 imports `StatusBadge` from subs/workspace/subs/shared-ui/src/status-badge.tsx (module `collection-review/workspace/shared-ui`), which requires an importer tag your module does not carry: collection-review/workspace/shared-ui:status-badge.tsx#StatusBadge: required-importer-tag (ui) subs/workspace/subs/reviews/src/session.ts:1 imports `makeCatalogFixture` from subs/workspace/subs/catalog/subs/core/src/tests/fixture.ts (module `collection-review/workspace/catalog/core`), which is test code; non-test source may not import it. subs/workspace/subs/reviews/subs/core/src/runtime.ts:1 imports `findRecord` from subs/workspace/subs/catalog/subs/core/src/records.ts (module `collection-review/workspace/catalog/core`), which does not expose it to your module. `import type` counts too. subs/workspace/subs/reviews/subs/core/subs/controller/src/controller.ts:1 imports a name its target does not export: subs/workspace/subs/contracts/src/interfaces/vocabulary.ts has no export named reviewVerdictSchema subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/review-result.tsx:1 imports a name its target does not export: subs/workspace/subs/reviews/subs/ui/subs/pure-ui/src/format.ts has no export named formatFindings Fix them and submit again, or submit `contract-needed` or `unsuitable` (reason `scope`). Editing `collection-review` or `collection-review/workspace/shared-ui` or `collection-review/workspace/catalog/core`'s module.ramify is outside your write scope.
```

## Extras

### Outside-module source warning and outside-scope analysis limit

Planted (on top of the violations commit): a loose file `subs/workspace/subs/stray/src/helper.ts` (no module.ramify in stray/, but matched by the tsconfig include `subs/**/src`), imported from `subs/workspace/subs/reviews/src/mcp.ts:1`:

```ts
import { strayHelper } from '../../stray/src/helper.js';
```

### Analysis limit: non-literal dynamic import

Appended to `subs/workspace/subs/reviews/src/mcp.ts` (line 163 is the `import(name)`):

```ts
export async function loadPlugin(name: string): Promise<unknown> {
  return import(name);
}
```

(a) batch human (non-violation lines):

```text
Warning [outside-module-source] subs: 1 compiler-selected file outside module source (subs/workspace/subs/stray/src/helper.ts)
Warning [outside-module-source] vite.config.ts: 1 compiler-selected file outside module source (vite.config.ts)
Warning [outside-module-source] vitest.config.ts: 1 compiler-selected file outside module source (vitest.config.ts)
Analysis limit [outside-module-target] subs/workspace/subs/reviews/src/mcp.ts:1:1: Accessed project file subs/workspace/subs/stray/src/helper.ts is outside every module source area
Analysis limit [nonliteral-target] subs/workspace/subs/reviews/src/mcp.ts:163:17: Cannot establish the accessed source or resource target
Execution: completed; check: failed; coverage: partial
Findings: 6 errors, 3 warnings, 14 analysis limits; 175 allowed, 4 denied, 130 external
```

(b) batch JSON: `warnings` entries and the two new `coverage` entries (not in `diagnostics`):

```json
{
  "code": "outside-module-source",
  "entry": "subs",
  "count": 1,
  "files": [
    "subs/workspace/subs/stray/src/helper.ts"
  ]
}
{
  "id": "access-limit/1:bd46b8e44a83fcaf469f46b5c779fbc1308fee86cfc051a5271309bba9a259aa",
  "code": "outside-module-target",
  "location": {
    "file": "subs/workspace/subs/reviews/src/mcp.ts",
    "start": 0,
    "end": 56,
    "line": 1,
    "column": 1
  },
  "message": "Accessed project file subs/workspace/subs/stray/src/helper.ts is outside every module source area",
  "related": []
}
{
  "id": "access-limit/1:01dac4772e978b19a0d616c45474a36e61901784ae6e167235e75d6d91c9d349",
  "code": "nonliteral-target",
  "location": {
    "file": "subs/workspace/subs/reviews/src/mcp.ts",
    "start": 5705,
    "end": 5709,
    "line": 163,
    "column": 17
  },
  "message": "Cannot establish the accessed source or resource target",
  "related": []
}
```

(c) `ramify check --changed subs/workspace/subs/reviews/src/mcp.ts subs/workspace/subs/stray/src/helper.ts` (revision 3; broad), non-violation lines. Note the changed form drops the file list from the warning and says "files" even for 1:

```text
Mode: resident (revision 3; broad)
Warning [outside-module-source] subs: 1 compiler-selected files outside module source
Warning [outside-module-source] vite.config.ts: 1 compiler-selected files outside module source
Warning [outside-module-source] vitest.config.ts: 1 compiler-selected files outside module source
Analysis limit [outside-module-target] subs/workspace/subs/reviews/src/mcp.ts:1:1: Accessed project file subs/workspace/subs/stray/src/helper.ts is outside every module source area
Analysis limit [nonliteral-target] subs/workspace/subs/reviews/src/mcp.ts:163:17: Cannot establish the accessed source or resource target
```

(d) harness: `findingsOf` returns nothing for these (it reads only `findings`/`diagnostics`, not `warnings` or `coverage`); the engineer is told nothing about them. Output of the probe:

```text
[]
(coverage entries in the document: outside-module-target, nonliteral-target ; warnings: 3 )
```

### Description error

Planted: `subs/workspace/subs/reviews/subs/validation/module.ramify:8` changed to `expose-src validateRevisionChain from "validate.ts" to sideways`.

(a) batch human. The description error blocks every later stage: the six import violations are no longer reported, and the invalid module's own source is reported as outside-module source:

```text
Mode: batch
Error [invalid-destination] subs/workspace/subs/reviews/subs/validation/module.ramify:8:56: Expected the bare destination parent or descendants.
Warning [outside-module-source] subs: 3 compiler-selected files outside module source (subs/workspace/subs/reviews/subs/validation/src/tests/validate.test.ts, subs/workspace/subs/reviews/subs/validation/src/validate.ts, subs/workspace/subs/stray/src/helper.ts)
Warning [outside-module-source] vite.config.ts: 1 compiler-selected file outside module source (vite.config.ts)
Warning [outside-module-source] vitest.config.ts: 1 compiler-selected file outside module source (vitest.config.ts)
Execution: invalid; check: failed; coverage: not-run
Stages: registry=completed, acquisition=invalid, parse=invalid, catalog=blocked, link=blocked, access=blocked, decide=blocked, report=completed
Incomplete scope: 14 owners, 53 source files, 5 resources, 0 accesses
Findings: 1 errors, 3 warnings, 0 analysis limits; 0 allowed, 0 denied, 0 external
```

(b) batch JSON diagnostic (`outcome`: {"execution":"invalid","check":"failed","coverage":"not-run"}):

```json
{
  "id": "validation:dc1d06534c7967b05d1d739376d629cb73d1bab8d5aee08e784bd711416e1397",
  "code": "invalid-destination",
  "message": "Expected the bare destination parent or descendants.",
  "category": "description",
  "location": {
    "file": "subs/workspace/subs/reviews/subs/validation/module.ramify",
    "start": 309,
    "end": 317,
    "line": 8,
    "column": 56
  },
  "related": [],
  "importer": null,
  "original": null,
  "accessId": null
}
```

(c) `ramify check --changed subs/workspace/subs/reviews/subs/validation/module.ramify` (exit 1). The changed JSON has `"execution": "invalid"`, `"outcome": "checked"`, and `removed` lists the six import diagnostics' ids (the human form does not mention them):

```text
Mode: resident (revision 5; broad)
Error [new] [invalid-destination] subs/workspace/subs/reviews/subs/validation/module.ramify:8:56: Expected the bare destination parent or descendants.
Warning [outside-module-source] subs: 3 compiler-selected files outside module source
Warning [outside-module-source] vite.config.ts: 1 compiler-selected files outside module source
Warning [outside-module-source] vitest.config.ts: 1 compiler-selected files outside module source
Checked: subs/workspace/subs/reviews/subs/validation/module.ramify; checked set: 0 files (none), 0 accesses; wait: 577.6 ms; findings: 1
```

(d) harness sentence and describe text (fresh invocation):

```text
subs/workspace/subs/reviews/subs/validation/module.ramify:8: Expected the bare destination parent or descendants. [invalid-destination]

RAMIFY MODULE VIOLATION. The iteration gate fails while it stands.
- subs/workspace/subs/reviews/subs/validation/module.ramify:8: Expected the bare destination parent or descendants. [invalid-destination]
Fix it inside your write scope, or submit `contract-needed`, or `unsuitable` with reason `scope`. `completion-proposed` is refused while this stands.
```

Same text when the invocation had previously been told about the six import findings (changed runtime.ts then changed module.ramify): the six are neither repeated as standing nor reported as cleared, because the changed check covered only module.ramify, and `open()` is not shown by describe.

### Not-checked reply (configuration-changed)

`ramify check --changed tsconfig.json` with an **unchanged** tsconfig.json answers checked (exit 1, the full findings list, `Checked: tsconfig.json; checked set: 60 files ...`). After editing tsconfig.json (a comment appended to one line):

(c) human, exit 2:

```text
Root: /tmp/claude-1000/-ramify/6a2bf574-0998-4a1c-8378-30d81072a078/scratchpad/diag-probe/project
Mode: resident (configuration-changed)
Not checked (configuration-changed): tsconfig.json; checked set: none; wait: 0.9 ms; findings: 0
```

JSON, exit 2:

```json
{
  "schemaVersion": "ramify.check/1",
  "root": "/tmp/claude-1000/-ramify/6a2bf574-0998-4a1c-8378-30d81072a078/scratchpad/diag-probe/project",
  "revision": null,
  "since": null,
  "changed": [
    {
      "path": "tsconfig.json",
      "sha256": "8594e3fcbcf49536dedd494a482a9d49485eecd1d475e31222c61e2f13d32e19",
      "covered": false
    }
  ],
  "outcome": "not-checked",
  "reason": "configuration-changed",
  "execution": null,
  "findings": [],
  "removed": [],
  "warnings": [],
  "coverage": [],
  "checked": null,
  "timings": {
    "daemon": null,
    "waitedMs": 0.6583049999999986,
    "totalMs": 9.667016000000002
  },
  "exitCode": 2
}
```

(d) The harness never passes a guarded configuration file to `checkChanged`; it records its own not-checked entry and runs a complete batch check, whose findings then speak. For a changed check that Ramify answers not-checked (cold daemon past the deadline, superseded content), describe produces, e.g. with this reply's reason:

```text
Ramify hook check:
- changed check over subs/workspace/subs/reviews/src/mcp.ts: not-checked (configuration-changed)
  Nothing was verified by this check. It is not a pass, and you may keep editing.
```

A cold daemon did not produce a not-checked reply in this probe: the first `--changed` call waited 1.6 s (inside the 2000 ms default deadline) and answered with revision 1 (`Mode: resident (revision 1; cold)`).
