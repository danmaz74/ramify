import { acquireProductionSelection } from './production-selection.js';

try {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--root' || !args[1] || args[1].startsWith('--')) {
    throw new Error('Usage: npm run production:files -- --root <directory>');
  }
  const { document } = await acquireProductionSelection(args[1]);
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
