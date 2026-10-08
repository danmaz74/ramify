import { mkdir, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { temporaryDirectory } from './fixture.js';
import { rootDescription } from './root-description.js';
import { architectIndex, moduleEntry } from './views.js';

/**
 * A project with two modules, one of which the assignment owns, a sibling it
 * does not, a contract file assigned beyond the base, a symlink out of the
 * project and a directory the bootstrap scope has not created yet.
 */
export async function writeGuardProject(cleanups: Array<() => Promise<void>>) {
  const directory = await temporaryDirectory();
  cleanups.push(directory.remove);
  const root = join(directory.path, 'project');
  const outside = join(directory.path, 'elsewhere');
  await mkdir(join(root, 'subs', 'orders', 'src', 'tests'), { recursive: true });
  await mkdir(join(root, 'subs', 'orders', 'subs', 'pricing', 'src'), { recursive: true });
  await mkdir(join(root, 'subs', 'billing', 'src'), { recursive: true });
  await mkdir(join(root, 'subs', 'contracts', 'src', 'interfaces'), { recursive: true });
  await mkdir(outside, { recursive: true });

  await writeFile(join(root, 'module.ramify'), rootDescription('shop'));
  await writeFile(join(root, 'package.json'), '{}\n');
  await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext' }, include: ['**/*.ts'] }));
  await writeFile(join(root, 'subs/contracts/module.ramify'), 'ramify 1\nmodule contracts\n');
  await writeFile(join(root, 'subs', 'orders', 'module.ramify'), 'ramify 1\nmodule orders\n');
  await writeFile(join(root, 'subs', 'orders', 'README.md'), '# orders\n');
  await writeFile(join(root, 'subs', 'orders', 'src', 'orders.ts'), 'export const orders = 1;\n');
  await writeFile(join(root, 'subs', 'orders', 'src', 'tests', 'orders.test.ts'), 'export const covered = true;\n');
  await writeFile(join(root, 'subs', 'orders', 'subs', 'pricing', 'module.ramify'), 'ramify 1\nmodule pricing\n');
  await writeFile(join(root, 'subs', 'orders', 'subs', 'pricing', 'src', 'price.ts'), 'export const price = 1;\n');
  await writeFile(join(root, 'subs', 'billing', 'module.ramify'), 'ramify 1\nmodule billing\n');
  await writeFile(join(root, 'subs', 'billing', 'src', 'billing.ts'), 'export const billing = 1;\n');
  await writeFile(join(root, 'subs', 'contracts', 'src', 'interfaces', 'notes.ts'), 'export type Note = string;\n');
  await writeFile(join(outside, 'secrets.txt'), 'nothing of the project\n');
  // A real symlink inside the scope that leads out of the project.
  await symlink(outside, join(root, 'subs', 'orders', 'src', 'escape'));
  // A file where a directory would have to be, which no path can lie beneath.
  await writeFile(join(root, 'subs', 'orders', 'src', 'note.ts'), 'export const note = 1;\n');

  const index = architectIndex([
    moduleEntry('shop', '', null),
    moduleEntry('shop/orders', 'subs/orders', 'shop'),
    moduleEntry('shop/orders/pricing', 'subs/orders/subs/pricing', 'shop/orders'),
    moduleEntry('shop/billing', 'subs/billing', 'shop'),
    moduleEntry('shop/contracts', 'subs/contracts', 'shop'),
  ]);
  return { root, outside, index };
}
