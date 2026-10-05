import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Runs `analyzeProject` of one pinned engine tree from its own sources; the
// caller starts this worker under tsx with that tree as its working directory.
// The request keeps the harness's project, capabilities and limits, and takes
// its default tag registry from the same pinned build, so no part of the
// analysis comes from the current engine. Usage: <engine root> <input> <output>.
const [engine, input, output] = process.argv.slice(2);
const load = path => import(pathToFileURL(join(engine, path)).href);
const { analyzeProject } = await load('subs/analysis/src/index.ts');
const { createDefaultTagRegistry } = await load('subs/analysis/subs/model/src/index.ts');
const inputs = { ...JSON.parse(await readFile(input, 'utf8')), registry: createDefaultTagRegistry() };
const run = await analyzeProject(inputs);
if (run.status !== 'reported') throw new Error('Batch comparison was cancelled');
await writeFile(output, JSON.stringify({ inputs, report: run.report }));
