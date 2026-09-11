import { readFile, writeFile } from 'node:fs/promises';
import { analyzeProject } from '../../dist/subs/analysis/src/index.js';
const [input, output] = process.argv.slice(2);
const run = await analyzeProject(JSON.parse(await readFile(input, 'utf8')));
if (run.status !== 'reported') throw new Error('Batch comparison was cancelled');
await writeFile(output, JSON.stringify(run.report));
