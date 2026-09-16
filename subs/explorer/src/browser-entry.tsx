import { createProjectExplorerBrowserApp } from './browser-app.js';

const match = window.location.pathname.match(/^\/explore\/([^/]+)\/([^/]+)$/);
const container = document.getElementById('root');
if (!match || !container) throw new Error('Invalid project explorer URL');
createProjectExplorerBrowserApp(container, {
  context: decodeURIComponent(match[1]!),
  generation: decodeURIComponent(match[2]!),
});
