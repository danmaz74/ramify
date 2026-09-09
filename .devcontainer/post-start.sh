#!/bin/bash
# Runs on every container start.

set -o pipefail

cd /ramify

# Named volumes mounted over node_modules can come up owned by another uid.
for dir in node_modules site/node_modules examples/collection-review/node_modules; do
  if [ -d "$dir" ] && [ "$(stat -c %u "$dir" 2>/dev/null)" != "$(id -u)" ]; then
    echo "Aligning $dir ownership to $(id -un)..."
    sudo chown -R app:app "$dir" || true
  fi
done

if [ ! -f node_modules/.package-lock.json ]; then
  echo "Toolkit dependencies missing, running npm ci..."
  npm ci || true
fi

echo "Updating Claude Code..."
claude update || true
echo "Claude Code $(claude --version 2>/dev/null || echo 'unknown')"

bash /ramify/.devcontainer/claude-mcp-setup.sh || true
bash /ramify/.devcontainer/codex-mcp-setup.sh || true
