# Projected run: why-import

## Items at the stop point

```text
i1 architect:plan      done: map revision 1
i2 decide:approve-map  ready (a person)
i3 implement:"Carry the question and its answer in the dispatch vocabulary"  root ramify; waiting for i2
i4 integrate           waiting for i3
```

## What the expansion table would add

```text
if ramify/daemon/contexts reports need "why-answer": + contract:"why-answer" + implement:"Explain a hypothetical import from analyzed facts" (root ramify/analysis)
if ramify/cli reports need "why-operation": + contract:"why-operation" + implement:"Answer from the resident revision" (root ramify/daemon)
if ramify/service-api reports need "why-operation": + contract:"why-operation" + implement:"Answer from the resident revision" (root ramify/daemon)
if ramify/explorer reports need "why-procedure": + contract:"why-procedure" + implement:"Browser-facing question procedure" (root ramify/service-api)
if ramify/explorer reports need "why-panel": + contract:"why-panel" + implement:"Answer panel beside the module tree" (root ramify/presentation/project-view)
```

## New capabilities that are not seams

- hypothetical-import-decision (owner ramify/analysis/model; held by "Explain a hypothetical import from analyzed facts")
- exposure-steps (owner ramify/analysis/model; held by "Explain a hypothetical import from analyzed facts")
- declaration-spelling (owner ramify/analysis/descriptions; held by "Explain a hypothetical import from analyzed facts")
- why-service-contract (owner ramify; held by "Carry the question and its answer in the dispatch vocabulary")
- why-revision-answer (owner ramify/daemon/contexts; held by "Answer from the resident revision")
- why-command (owner ramify/cli; held by "The ramify why command")
- why-page-query (owner ramify/explorer; held by "Asking from the explorer page")
- why-agreement (owner ramify/integration-tests; held by "Agreement across the surfaces")

## Gaps found mechanically

- work items "Explain a hypothetical import from analyzed facts" and "Carry the question and its answer in the dispatch vocabulary" have nested roots: their scopes overlap
- work items "Carry the question and its answer in the dispatch vocabulary" and "Answer from the resident revision" have nested roots: their scopes overlap
- work items "Carry the question and its answer in the dispatch vocabulary" and "The ramify why command" have nested roots: their scopes overlap
- work items "Carry the question and its answer in the dispatch vocabulary" and "Browser-facing question procedure" have nested roots: their scopes overlap
- work items "Carry the question and its answer in the dispatch vocabulary" and "Answer panel beside the module tree" have nested roots: their scopes overlap
- work items "Carry the question and its answer in the dispatch vocabulary" and "Asking from the explorer page" have nested roots: their scopes overlap
- work items "Carry the question and its answer in the dispatch vocabulary" and "Agreement across the surfaces" have nested roots: their scopes overlap
