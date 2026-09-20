# Explain a hypothetical import

An engineer, or an agent working within one module, often wants to know
before writing code whether that module may import a symbol, and if not, what
would have to change. Today the only way to find out is to write the import
and run the check. Ramify's model can already explain an import decision; no
command asks it.

## Request

- A new command:
  `ramify why --from <module-or-file> --symbol <name> [--in <owner-module>]`.
  It answers whether the import would be allowed and explains the decision.
- The subject is hypothetical: no such import needs to exist in the source,
  and the command changes no file.
- An allowed answer shows the exposure path along which the importer receives
  the symbol, declaration by declaration with file and line, and the import
  spelling to use.
- A refused answer names the first rule that refuses it: not exposed to the
  importer, a required-importer tag the importer lacks, a required-symbol tag
  the symbol lacks, or testing-source isolation. For a missing exposure it
  lists the declarations that would make the import allowed, one per module
  along the path. It proposes them and never writes them.
- `--from` accepts a file, because a file under `src/tests/` has a different
  profile from its module's ordinary source.
- When `--symbol` matches originals in several modules and `--in` is absent,
  the answer lists the candidates and decides nothing.
- `--format json` returns the same content as data.
- The same query is available from the explorer: selecting a module and
  typing a symbol name shows the answer beside the tree, with the exposure
  path highlighted.

## Constraints

- With a resident daemon, the answer comes from the revision it has already
  published, names that revision, and analyzes nothing again. `--batch`
  analyzes once in a disposable session and gives the same answer.
- The decision is the model's. The command, the daemon and the explorer add
  no rule of their own, and the same question gives the same answer through
  all three.
- When analysis limits leave the answer uncertain, it says so and names the
  limit. It never reports allowed or refused from incomplete facts.
- Ordinary checks, watches and hooks do no added work for this command.
- No importability rule changes.
- Exit codes: 0 for an answer of either kind, and the documented usage and
  failure codes otherwise. A refused hypothetical import is not a failed
  check.

## Acceptance

- In the reference example, asking for a symbol a sibling exposes only to its
  parent is refused, and the proposed declarations, once written by hand, make
  `ramify check` accept the real import.
- Asking from a file under `src/tests/` for a testing-tagged symbol is
  allowed, and asking from the same module's ordinary source is refused with
  testing-source isolation as the reason.
- The command line, `--batch`, `--format json` and the explorer agree on one
  allowed case, one refused case and one ambiguous case.
- With the daemon running, the command starts no compiler.

## Out of scope

Writing the proposed declarations, explaining an existing violation in
`ramify check` output, MCP, and explaining visibility that involves no import.
