import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

/** The reviewed F recipe. Outcomes are asserted separately by the handlers. */
export const projectFixtureFiles: Readonly<Record<string, string>> = {
  'module.ramify': 'ramify 1\nmodule fixture\nexpose-sub * from provider to descendants\n',
  'README.md': '# fixture\n\nPurpose of fixture.\n',
  'package.json': '{"private":true,"type":"module"}\n',
  'tsconfig.json': JSON.stringify({ compilerOptions: {
    target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', strict: true,
    noEmit: true, skipLibCheck: true, moduleDetection: 'force', verbatimModuleSyntax: false,
    isolatedModules: false, types: [], resolveJsonModule: true,
    paths: { '@provider/*': ['./subs/provider/src/*'] },
  }, include: ['src', 'subs/**/src'] }, null, 2) + '\n',
  'subs/provider/module.ramify': 'ramify 1\nmodule provider\nexpose-src value from "interfaces/api.ts" tagged [browser] to parent\nexpose-src Type, Runtime, Merged, default from "interfaces/api.ts" to parent\n',
  'subs/provider/README.md': '# provider\n\nPurpose of provider.\n',
  'subs/provider/src/interfaces/api.ts': 'export const value = 1;\nexport interface Type { readonly value: number }\nexport class Runtime {}\nexport function Merged(): number { return 1; }\nexport namespace Merged { export const member = 1; }\nexport const privateValue = 2;\nexport interface PrivateType { readonly hidden: true }\nexport default function defaultValue(): number { return 3; }\n',
  'subs/consumer/module.ramify': 'ramify 1\nmodule consumer\n',
  'subs/consumer/README.md': '# consumer\n\nPurpose of consumer.\n',
  'subs/consumer/src/probe.ts': "import { value } from '../../provider/src/interfaces/api.js'; void value;\n",
};
export async function put(root: string, path: string, content: string | Uint8Array): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}
export async function createProjectFixture(root: string): Promise<void> {
  await mkdir(join(root, 'src'), { recursive: true });
  for (const [path, content] of Object.entries(projectFixtureFiles)) await put(root, path, content);
}
