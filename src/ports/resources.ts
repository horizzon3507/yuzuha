import type { ChannelsResources } from './resources/channels.js';
import type { CollectorsResources } from './resources/collectors.js';
import type { ExpressionsResources } from './resources/expressions.js';
import type { InvitesResources } from './resources/invites.js';
import type { MessagesResources } from './resources/messages.js';
import type { RolesResources } from './resources/roles.js';
import type { ThreadsResources } from './resources/threads.js';
import type { UsersResources } from './resources/users.js';
import type { WebhooksResources } from './resources/webhooks.js';

/** Operações nativas usadas pelas funções de script, agrupadas por recurso. */
export interface Resources {
  readonly users: UsersResources;
  readonly roles: RolesResources;
  readonly channels: ChannelsResources;
  readonly messages: MessagesResources;
  readonly collectors: CollectorsResources;
  readonly webhooks: WebhooksResources;
  readonly expressions: ExpressionsResources;
  readonly threads: ThreadsResources;
  readonly invites: InvitesResources;
}
