import { renderA } from '../subs/a/src/caller.js';
import { readFact } from '../subs/b/src/fact.js';
export const render = () => renderA(readFact());
