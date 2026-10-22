import type { Client } from '@fluxerjs/core';
import type { Resources } from '../../ports/resources.js';
import { createChannelsResources } from './resources/channels.js';
import { createCollectorsResources } from './resources/collectors.js';
import { createExpressionsResources } from './resources/expressions.js';
import { createInvitesResources } from './resources/invites.js';
import { createMessagesResources } from './resources/messages.js';
import { createRolesResources } from './resources/roles.js';
import { createThreadsResources } from './resources/threads.js';
import { createUsersResources } from './resources/users.js';
import { createWebhooksResources } from './resources/webhooks.js';

/** Implementação dos recursos nativos sobre o SDK do Fluxer.js. */
export class FluxerResources implements Resources {
  readonly users;
  readonly roles;
  readonly channels;
  readonly messages;
  readonly collectors;
  readonly webhooks;
  readonly expressions;
  readonly threads;
  readonly invites;

  constructor(client: Client) {
    this.users = createUsersResources(client);
    this.roles = createRolesResources(client);
    this.channels = createChannelsResources(client);
    this.messages = createMessagesResources(client);
    this.collectors = createCollectorsResources(client);
    this.webhooks = createWebhooksResources(client);
    this.expressions = createExpressionsResources(client);
    this.threads = createThreadsResources(client);
    this.invites = createInvitesResources(client);
  }
}
