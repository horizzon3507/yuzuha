import type { FunctionDefinition } from '../../types.js';
import { arrayFunctions } from './arrays.js';
import { arrayCallbackFunctions } from './array-callbacks.js';
import { loopFunctions } from './loops.js';
import { numberDateFunctions } from './numbers.js';
import { objectFunctions } from './objects.js';
import { stateFunctions } from './state.js';
import { textFunctions } from './texts.js';

export const languageFunctions: FunctionDefinition[] = [
  ...objectFunctions,
  ...arrayFunctions,
  ...arrayCallbackFunctions,
  ...textFunctions,
  ...numberDateFunctions,
  ...loopFunctions,
  ...stateFunctions,
];
