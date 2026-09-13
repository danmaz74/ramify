#!/usr/bin/env bash
# SPIKE(bun-cli-startup): build the Bun client variants from the current dist.
set -euo pipefail
cd "$(dirname "$0")/../../.."
bun=${BUN:-bun}
entry=scripts/spikes/bun-cli-startup/entry.mjs
common=(--target=bun --external ./batch.js)
"$bun" build "$entry" "${common[@]}" --outfile dist/bun/ramify.js
"$bun" build "$entry" --target=node --external ./batch.js --outfile dist/bun/ramify-node.js
"$bun" build "$entry" "${common[@]}" --compile --outfile dist/bin/ramify
"$bun" build "$entry" "${common[@]}" --compile --bytecode --format=esm --outfile dist/bin/ramify-bytecode
"$bun" build "$entry" "${common[@]}" --minify --compile --bytecode --format=esm --outfile dist/bin/ramify-min

# Floors for bench.mjs: an empty module compiled the same ways.
mkdir -p .spike && echo 'export {}' > .spike/empty.mjs
"$bun" build .spike/empty.mjs --compile --outfile .spike/bun-empty
"$bun" build .spike/empty.mjs --compile --bytecode --format=esm --outfile .spike/bun-empty-bytecode
ls -la dist/bun dist/bin
