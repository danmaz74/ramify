# Projected run: explorer-outside-source

## Items at the stop point

```text
i1 architect:plan      done: map revision 1
i2 decide:approve-map  ready (a person)
i3 implement:"Show the count on the home page and the list on the module tree page"  root ramify/explorer; waiting for i2
i4 integrate           waiting for i3
```

## What the expansion table would add

```text
if ramify/service-api reports need "outside-source-classification": + contract:"outside-source-classification" + implement:"Report why each outside file is outside and which module is nearest" (root ramify/analysis)
if ramify/explorer reports need "outside-source-projection": + contract:"outside-source-projection" + implement:"Publish the bounded outside-source list in the explorer service model" (root ramify/service-api)
if ramify/explorer reports need "outside-source-model": + contract:"outside-source-model" + implement:"Describe and render the grouped outside-source list in the module tree" (root ramify/presentation)
if ramify/explorer reports need "outside-source-list": + contract:"outside-source-list" + implement:"Describe and render the grouped outside-source list in the module tree" (root ramify/presentation)
```

## New capabilities that are not seams

- outside-source-count (owner ramify/explorer; held by "Show the count on the home page and the list on the module tree page")
- outside-source-page (owner ramify/explorer; held by "Show the count on the home page and the list on the module tree page")

## Gaps found mechanically

- touched module ramify (exposure-only) lies within no work item's root: nothing is scoped to change it
