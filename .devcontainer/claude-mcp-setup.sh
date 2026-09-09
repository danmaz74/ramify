#!/bin/bash
# Setup Playwright MCP for headless browser testing in devcontainer.
#
# Replaces the previous chrome-devtools-mcp config — that server eagerly loads
# puppeteer-core + lighthouse at startup (~127 MB idle) and has an open
# upstream bug (chrome-devtools-mcp#1192) where it doesn't terminate when its
# stdio parent dies, leaking memory across stale Claude Code sessions.
# Playwright MCP lazy-spawns the browser only on first navigate (~60-80 MB
# idle Node) and exits cleanly on stdio close.

CLAUDE_CONFIG="$HOME/.claude.json"

# 1. Remove any project-level chrome-devtools or playwright config that would
#    override the user-level config we're about to set.
if [ -f "$CLAUDE_CONFIG" ]; then
    node -e '
      const fs = require("fs");
      const configPath = process.env.HOME + "/.claude.json";
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        let changed = false;
        const projectMcp = config.projects && config.projects["/ramify"] && config.projects["/app"].mcpServers;
        if (projectMcp) {
          for (const key of ["chrome-devtools", "playwright"]) {
            if (projectMcp[key]) { delete projectMcp[key]; changed = true; }
          }
        }
        if (changed) {
          fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
          console.log("Removed conflicting project-level browser MCP config");
        }
      } catch (e) {}
    ' 2>/dev/null || true
fi

# 2. Remove the old user-level chrome-devtools config (one-time migration on
#    devcontainers that previously ran the chrome-devtools version of this
#    script). Safe to re-run: noop if it's already gone.
if [ -f "$CLAUDE_CONFIG" ]; then
    if node -e '
      const fs = require("fs");
      const configPath = process.env.HOME + "/.claude.json";
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        process.exit(config.mcpServers && config.mcpServers["chrome-devtools"] ? 0 : 1);
      } catch (e) { process.exit(1); }
    ' 2>/dev/null; then
        echo "Removing legacy chrome-devtools MCP from user config..."
        claude mcp remove chrome-devtools --scope user 2>/dev/null || true
    fi
fi

# 3. Skip if playwright is already correctly configured (idempotent).
if [ -f "$CLAUDE_CONFIG" ]; then
    if node -e '
      const fs = require("fs");
      const configPath = process.env.HOME + "/.claude.json";
      try {
        const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
        const mcp = config.mcpServers && config.mcpServers["playwright"];
        process.exit(mcp && mcp.args && mcp.args.includes("--headless") ? 0 : 1);
      } catch (e) {
        process.exit(1);
      }
    ' 2>/dev/null; then
        echo "Playwright MCP already correctly configured for headless mode"
        exit 0
    fi
fi

# 4. Add Playwright MCP via the claude CLI.
echo "Adding Playwright MCP server..."
claude mcp add playwright --scope user -- \
    npx -y @playwright/mcp@latest \
    --headless \
    --browser chromium \
    --executable-path /usr/bin/chromium \
    --isolated \
    --no-sandbox \
    --caps devtools

if [ $? -eq 0 ]; then
    echo "Playwright MCP configured for headless mode"
    echo "Restart Claude Code for changes to take effect"
else
    echo "Failed to add Playwright MCP. Make sure 'claude' CLI is available."
    exit 1
fi
