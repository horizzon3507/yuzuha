import type { Runtime } from '../runtime.js';
import type { FunctionDefinition } from '../types.js';
import { channelFunctions } from './native-channels.js';
import { collectorFunctions } from './native-collectors.js';
import { expressionFunctions } from './native-expressions.js';
import { inviteFunctions } from './native-invites.js';
import { resourceMessageFunctions } from './native-messages.js';
import { roleFunctions } from './native-roles.js';
import { threadFunctions } from './native-threads.js';
import { userFunctions } from './native-users.js';
import { webhookFunctions } from './native-webhooks.js';
import { contextFunctions } from './context.js';
import { embedFunctions } from './embeds.js';
import { flowFunctions } from './flow.js';
import { guardFunctions } from './guards.js';
import { httpFunctions } from './http.js';
import { languageFunctions } from './language/index.js';
import { messageFunctions } from './messages.js';
import { moderationFunctions } from './moderation.js';
import { scheduleFunctions } from './schedule.js';
import { storageFunctions } from './storage.js';
import { valueFunctions } from './values.js';
import { resourceExtras } from './resource-extras.js';
import { eventFunctions } from './events.js';

export const builtinFunctions: FunctionDefinition[] = [
  ...contextFunctions, ...flowFunctions, ...guardFunctions, ...valueFunctions,
  ...messageFunctions, ...embedFunctions, ...moderationFunctions, ...storageFunctions,
  ...userFunctions, ...roleFunctions, ...channelFunctions, ...resourceMessageFunctions,
  ...collectorFunctions, ...webhookFunctions, ...expressionFunctions, ...threadFunctions,
  ...inviteFunctions, ...languageFunctions, ...scheduleFunctions, ...httpFunctions,
  ...resourceExtras,
  ...eventFunctions,
];

export function registerBuiltins(runtime: Runtime): Runtime {
  return runtime.registerAll(builtinFunctions);
}
