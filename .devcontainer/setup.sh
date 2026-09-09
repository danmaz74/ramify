#!/bin/bash
# Post-create setup: runs once, after the container is created.

set -e

cd /ramify

echo "=== Ramify devcontainer setup ==="
echo ""

echo "Installing the toolkit, the site and the reference example..."
npm ci
npm --prefix site ci
npm --prefix examples/collection-review ci

echo ""
echo "Building and checking the toolkit..."
npm run build
npm run type-check
if npm test; then
  echo "Tests passed"
else
  echo "Some tests failed; check the output above"
fi

echo ""
echo "cucumber-viz $(cucumber-viz --version 2>/dev/null || echo 'unknown') is installed globally from npm.braimax.com."
echo ""
echo "Next steps:"
echo "  1. Authenticate if needed: claude login / codex"
echo "  2. Start the Studio: pm2 start ecosystem.config.cjs --only main   (port 4080)"
echo "  3. Serve the site:   npm run site:build && pm2 start ecosystem.config.cjs --only site   (port 4301)"
