# Capability discovery

Use this workflow only to find whether requested behavior may already exist.

1. Restate the capability without turning it into a Ramify-derived fact. Form
   three to five search terms: domain words, likely symbol words, synonyms, and
   wording a test title might use.
2. Search `.ramify-architect/README.md` for module purposes and headline
   symbols. Use `rg -l` or `rg -c` over `*.jsonl` to locate candidate files
   before printing matching records. Do not search a module identifier across
   the whole view when its own directory answers the question.
3. Open at most three candidates' `module.json`, `behavior.jsonl`, and
   `tests.jsonl`. Use `supporting.jsonl` only when vocabulary or a type is
   relevant. Follow a matching test record's `exercises` to behavior when
   measured.
4. Prefer exposed and observed behavior as leads, but do not exclude internal
   or unused behavior. Exposure and use are evidence strength, not semantic
   relevance.
5. Read a candidate's defining source only when its bounded signature and
   documentation do not establish the needed behavior. For a class or object
   whose signature is cut, inspect the defining source before a negative answer
   about a member.
6. Stop at a confirmed candidate or after three distinct narrowing searches.
   Report the closest candidates and why they are insufficient. Say "not found,
   not proof of absence" and carry the metadata limits into the report.

If a search interface hides or omits long matching lines, repeat the bounded
search with shell `rg` or read the exact ranged record. Do not compensate by
repeating the same search through successively smaller directories.

Discovery answers whether behavior appears to exist, not whether any particular
module can import it. Load `access.md` only when the request also asks that
question.
