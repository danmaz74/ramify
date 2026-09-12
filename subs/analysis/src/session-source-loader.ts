import { registerHooks } from 'node:module';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Source workers need the same .js-to-.ts resolution as the source runner.
// Built workers use emitted ESM directly, without this loader or dev packages.
const root = pathToFileURL(resolve(dirname(fileURLToPath(import.meta.url)), '../../..') + sep).href;
registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ERR_MODULE_NOT_FOUND'
      || !context.parentURL?.startsWith(root) || !specifier.startsWith('.') || !specifier.endsWith('.js')) throw error;
    return next(specifier.slice(0, -3) + '.ts', context);
  }
} });
