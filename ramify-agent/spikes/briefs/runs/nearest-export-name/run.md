# Projected run: nearest-export-name

## Items at the stop point

```text
i1 architect:plan      done: map revision 1
i2 decide:approve-map  ready (a person)
i3 implement:"Suggest the nearest name for an unknown exposed symbol"  root ramify/analysis; waiting for i2
i4 integrate           waiting for i3
```

## What the expansion table would add

```text
if ramify/cli reports need "report-suggestion-data": + contract:"report-suggestion-data" + implement:"Suggest the nearest name for an unknown exposed symbol" (root ramify/analysis)
```

## New capabilities that are not seams

- close-name-candidates (owner ramify/analysis/descriptions; held by "Suggest the nearest name for an unknown exposed symbol")
- src-selection-suggestions (owner ramify/analysis/descriptions; held by "Suggest the nearest name for an unknown exposed symbol")
- sub-contract-suggestions (owner ramify/analysis/descriptions; held by "Suggest the nearest name for an unknown exposed symbol")

## Gaps found mechanically

- seam "report-suggestion-data": its consumer ramify/cli lies within no work item, so no item ever reports the need and no contract item is ever created
