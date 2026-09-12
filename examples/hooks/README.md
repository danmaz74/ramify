# Post-write hook

`claude-code-post-write.mjs` adapts Claude Code's `PostToolUse` event for tools
that provide `tool_input.file_path`. Put the installed `ramify` executable on
`PATH` and configure the hook command as `node /absolute/path/to/claude-code-post-write.mjs`.

The adapter runs `ramify check --changed <absolute-file> --format json` from the
file's directory, so the CLI discovers its project. It prints newly introduced
findings on standard error and exits 2 to return them to the agent. A checked
revision without new findings exits 0 silently. A check that could not finish
prints a one-line notice naming the reason and exits 0 so editing can continue.
Input and subprocess waits are each bounded to five seconds; normal daemon
checks retain the CLI's two-second deadline.
