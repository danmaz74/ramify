/**
 * PM2 processes for the Ramify devcontainer.
 *
 * `main` is the cucumber-viz Studio, installed globally in the image from the
 * private registry (see .devcontainer/Dockerfile). `site` serves the built
 * documentation site. `explorer` is the resident Ramify explorer server for
 * this checkout (run `npm run build` first, and `pm2 restart explorer` after
 * each rebuild). It must select the same daemon endpoint directory as the shell
 * that runs `ramify`: PM2 passes on the environment it was started with, so
 * `RAMIFY_ENDPOINT_DIR` or `XDG_RUNTIME_DIR` must match. The home page shows
 * the daemon PID, which makes a mismatch visible. Ports are chosen not to
 * collide with a cucumber-viz devcontainer on the same host.
 */
module.exports = {
  apps: [
    {
      name: 'main',
      script: '/usr/local/lib/node_modules/cucumber-viz/dist/cli.js',
      interpreter: 'node',
      args: 'serve --port 4080',
      cwd: '/ramify',
      watch: false,
      env: {
        NODE_ENV: 'development',
        PORT: '4080',
        NODE_OPTIONS: '--max-old-space-size=8192',
      },
    },
    {
      name: 'site',
      script: 'npm',
      args: '--prefix site run serve -- --port 4301',
      cwd: '/ramify',
      watch: false,
    },
    {
      name: 'explorer',
      script: 'dist/src/explorer-entry.js',
      interpreter: 'node',
      args: '--root /ramify --port 4302',
      cwd: '/ramify',
      watch: false,
      // The server may start the daemon as its child; signal only the server so
      // a stop or restart leaves the daemon and its warm contexts running.
      treekill: false,
    },
  ],
};
