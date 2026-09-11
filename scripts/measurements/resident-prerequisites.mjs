import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** File presence is a necessary condition, not proof that an entry works.
 * Actual imports, handshake and service calls belong to the workload driver. */
export function residentPrerequisites(root) {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const client = manifest.exports?.['./client'];
  const requirements = [
    ['client-package-entry', typeof client?.import === 'string' && typeof client?.types === 'string'
      && existsSync(join(root, client.import)) && existsSync(join(root, client.types)),
    'package.json exports["./client"] with compiled import and type targets'],
    ...['src/daemon-entry.js', 'src/client.js', 'src/resident-assembly.js',
      'subs/daemon/src/connect-daemon.js', 'subs/daemon/src/host.js'].map(path =>
      [path, existsSync(join(root, 'dist', path)), `dist/${path}`]),
  ];
  return requirements.map(([id, present, requirement]) => ({ id, present: Boolean(present), requirement }));
}
