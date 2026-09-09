/**
 * PM2 processes for the Ramify devcontainer.
 *
 * `main` is the cucumber-viz Studio, installed globally in the image from the
 * private registry (see .devcontainer/Dockerfile). `site` serves the built
 * documentation site. Ports are chosen not to collide with a cucumber-viz
 * devcontainer on the same host.
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
  ],
};
