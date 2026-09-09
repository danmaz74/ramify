#!/bin/bash
# Register the cucumber-viz MCP bridge with Codex. Runs on every container start
# because ~/.codex/auth.json is host-mounted and config.toml may be recreated.
#
# The bridge is the one shipped by the globally installed cucumber-viz package;
# bump CUCUMBER_VIZ_VERSION in the Dockerfile to upgrade it.

set -euo pipefail

CODEX_CONFIG="${CODEX_CONFIG:-$HOME/.codex/config.toml}"
PROJECT_ROOT="${RAMIFY_PROJECT_ROOT:-/ramify}"
STUDIO_PORT="${RAMIFY_STUDIO_PORT:-4080}"
BRIDGE_PATH="$(npm root -g)/cucumber-viz/dist/core/shared/services/mcp/mcp-stdio-bridge.js"

if [ ! -f "$BRIDGE_PATH" ]; then
  echo "cucumber-viz MCP bridge not found at $BRIDGE_PATH; is cucumber-viz installed globally?" >&2
  exit 1
fi

mkdir -p "$(dirname "$CODEX_CONFIG")"
touch "$CODEX_CONFIG"

export CODEX_CONFIG PROJECT_ROOT BRIDGE_PATH STUDIO_PORT

node <<'NODE'
const fs = require('fs');

const configPath = process.env.CODEX_CONFIG;
const projectRoot = process.env.PROJECT_ROOT;
const bridgePath = process.env.BRIDGE_PATH;
const studioPort = process.env.STUDIO_PORT;

function tomlString(value) {
  return JSON.stringify(value);
}

function replaceTomlTable(text, header, blockLines) {
  const lines = text.split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === header);

  if (start === -1) {
    const prefix = text.trimEnd();
    return `${prefix}${prefix ? '\n\n' : ''}${blockLines.join('\n')}\n`;
  }

  let end = start + 1;
  while (end < lines.length) {
    const trimmed = lines[end].trim();
    const isTable = /^\[[^\]]+\]$/.test(trimmed);
    const isManagedNestedTable = trimmed.startsWith('[mcp_servers.cucumber-viz.');
    if (isTable && !isManagedNestedTable) {
      break;
    }
    end++;
  }

  const before = lines.slice(0, start);
  const after = lines.slice(end);
  return [...before, ...blockLines, ...after].join('\n').replace(/\n*$/, '\n');
}

const header = '[mcp_servers.cucumber-viz]';
const blockLines = [
  header,
  `command = ${tomlString('node')}`,
  `args = [${[bridgePath, '--port', studioPort, '--studio'].map(tomlString).join(', ')}]`,
  `cwd = ${tomlString(projectRoot)}`,
  'startup_timeout_sec = 20',
  'tool_timeout_sec = 900',
  'required = true',
  '',
];

const current = fs.readFileSync(configPath, 'utf8');
const next = replaceTomlTable(current, header, blockLines);

if (next === current) {
  console.log('Codex cucumber-viz MCP config already up to date');
} else {
  fs.writeFileSync(configPath, next, 'utf8');
  console.log(`Updated Codex cucumber-viz MCP config at ${configPath}`);
}
NODE

if command -v codex >/dev/null 2>&1; then
  codex mcp get cucumber-viz >/dev/null 2>&1 || true
fi
