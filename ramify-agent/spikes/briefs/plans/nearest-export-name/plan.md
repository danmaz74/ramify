# Suggest the nearest name for an unknown exposed symbol

A typo in a `module.ramify` exposure is reported today as a symbol the file
does not export, and the author has to open the file to find the right
spelling. When a close name exists, say so.

## Request

- When an `expose-src` or `expose-test` declaration names a symbol that the
  file does not export, and the file exports a name that is close to it, the
  error adds that name as a suggestion.
- The same applies when an `expose-sub` declaration names a symbol that the
  child's contract to its parent does not contain.
- Several equally close names are all listed, in the file's export order, up
  to three.

## Constraints

- The declaration stays invalid and the check still fails. A suggestion never
  changes what is exposed.
- No suggestion is given when nothing is close. A name that differs only in
  case is always close.
- Suggestions come only from names the declaration could validly select:
  exports the module owns in that file, or the child's contract.
- The error's location and its existing text are unchanged; the suggestion is
  appended. The JSON report carries the suggestions as data, not only inside
  the message.

## Acceptance

- `expose-src startSever from "http/server.ts" to parent` reports the unknown
  symbol and suggests `startServer`.
- A misspelt name in a file with no similar export reports exactly what it
  reports today.
- A name that is close only to a re-exported symbol owned by another module
  gets no suggestion.
