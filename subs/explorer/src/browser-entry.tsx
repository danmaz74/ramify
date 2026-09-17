import { createProjectExplorerBrowserApp, selectBrowserPage, selectInitialModule } from './browser-app.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing project explorer root element');
createProjectExplorerBrowserApp(container, selectBrowserPage(window.location.pathname), undefined,
  selectInitialModule(window.location.search));
