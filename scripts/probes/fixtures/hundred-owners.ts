import assert from 'node:assert/strict';

/** Deterministic workload bytes only; this does not implement a checker. */
export function hundredOwnerFiles(): ReadonlyMap<string, string> {
  const files = new Map<string, string>();
  const padded = (source: string, bytes: number) => {
    assert.ok(Buffer.byteLength(source) + 5 <= bytes);
    return `${source}/*${' '.repeat(bytes - Buffer.byteLength(source) - 5)}*/\n`;
  };
  files.set('package.json', '{"name":"ramify-hundred-owners","private":true,"type":"module"}\n');
  files.set('tsconfig.json', `${JSON.stringify({
    compilerOptions: {
      target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, noEmit: true, skipLibCheck: true, types: [],
    },
    include: ['src', 'subs/**/src'],
  }, null, 2)}\n`);
  for (let index = 0; index < 100; index++) {
    const name = index === 0 ? 'bench' : `m${String(index).padStart(3, '0')}`;
    const prefix = index === 0 ? '' : `subs/${name}/`;
    const tags = index === 0 ? 'dispatch' : index % 10 === 0 ? 'testing' : '';
    files.set(`${prefix}module.ramify`, `ramify 1\nmodule "${name}" tagged [${tags}]\n`);
    files.set(`${prefix}README.md`, `# ${name}\n\nSupplies deterministic workload bytes for the hundred-owner batch measurement.\n`);
    files.set(`${prefix}src/interfaces/api.ts`, padded(
      'export interface Input { readonly value: number }\nexport const value = 1;\n', 1024,
    ));
    for (let file = 0; file < 9; file++) {
      files.set(`${prefix}src/impl${file}.ts`, padded(
        `import { value, type Input } from './interfaces/api.js';\nexport function run${file}(input: Input): number { return input.value + value; }\n`, 1024,
      ));
    }
    files.set(`${prefix}src/tests/impl.test.ts`, padded(
      "import { run0 } from '../impl0.js';\nif (run0({ value: 1 }) !== 2) throw new Error('unexpected result');\n", 1024,
    ));
    files.set(`${prefix}src/style.css`, padded('.fixture { color: black; }\n', 256));
  }
  return files;
}
