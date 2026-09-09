# Descriptions

Descriptions parses the version 1 language with original source locations and links exact selections and child contracts against supplied inventory and export facts. It preserves declaration evidence and rejects invalid contracts without reading files or loading a compiler.

Iteration 4 implements `parseDescription(file, text)` in `src/parse.ts` and the
reviewed vocabulary in `src/interfaces/syntax.ts`. Its runtime uses only local
portable code. Linking arrives in iteration 7.

The parser receives decoded text. It keeps UTF-16 offsets into that original
text, with one-based lines and columns; BOM and CRLF code units remain in
the location calculation. Tokens omit whitespace and comments as the reviewed
syntax fixtures require. Statement spans exclude indentation, trailing
whitespace and comments. Names and paths retain exact decoded strings.

A valid result contains located headers, tokens and ordered statements. An
invalid result contains tokens and sorted diagnostics, with no partial document.
Tokenization collects lexical errors throughout the input. Parsing recovers at
physical line boundaries after a malformed clause; a lexically invalid line
is not interpreted from its incomplete tokens. Duplicate tag/destination items
each receive their own diagnostic. Returned data is deeply frozen and JSON-safe.

Unknown tag names await registry validation. Path normalization, containment,
exact file existence, symlinks, wildcard eligibility, export ownership and
exposure semantics await acquisition/linking. The parser never probes a path or
validates UTF-8 bytes that its string input cannot represent; acquisition owns
byte decoding. Tests read all fifteen reference and nine current toolkit
descriptions and assert their independently listed selections.
