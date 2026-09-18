#!/usr/bin/env node
// Claude Code PreToolUse hook for the Plan 2B agent trials: a Bash call may
// run exactly one `rg` invocation. Claude Code 2.1.266 approves read-only
// commands such as `ls` or `rg ... | head` even when the allowlist names only
// `Bash(rg:*)`, so the trials deny every other command here.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  let command = '';
  try { command = String(JSON.parse(input).tool_input?.command ?? ''); } catch { command = ''; }
  const reason = refusal(command.trim());
  if (reason === null) process.exit(0);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `Only a single rg command is permitted (${reason}).`,
    },
  }));
  process.exit(0);
});

// The reason a command is not one plain `rg` invocation, or null.
function refusal(command) {
  if (!/^rg(\s|$)/.test(command)) return 'the command must start with rg';
  let quote = null;
  for (let i = 0; i < command.length; i += 1) {
    const c = command[i];
    if (quote === "'") { if (c === "'") quote = null; continue; }
    if (quote === '"') {
      if (c === '\\') { i += 1; continue; }
      if (c === '"') quote = null;
      else if (c === '`' || (c === '$' && command[i + 1] === '(')) return 'command substitution';
      continue;
    }
    if (c === '\\') { i += 1; continue; }
    if (c === "'" || c === '"') { quote = c; continue; }
    if ('|;&<>`\n'.includes(c)) return `unquoted ${JSON.stringify(c)}`;
    if (c === '$' && command[i + 1] === '(') return 'command substitution';
  }
  return quote === null ? null : 'unterminated quote';
}
