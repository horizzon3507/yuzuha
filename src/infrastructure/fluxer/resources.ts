import type { Client } from '@fluxerjs/core';
import type { Resources } from '../../ports/resources.js';
import { createCacheResources } from './resources/cache.js';
import { createChannelsResources } from './resources/channels.js';
import { createCollectorsResources } from './resources/collectors.js';
import { createExpressionsResources } from './resources/expressions.js';
import { createGatewayResources } from './resources/gateway.js';
import { createInstanceResources } from './resources/instance.js';
import { createInvitesResources } from './resources/invites.js';
import { createMessagesResources } from './resources/messages.js';
import { createRolesResources } from './resources/roles.js';
import { createSelfResources } from './resources/self.js';
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
  readonly gateway;
  readonly instance;
  readonly self;
  readonly cache;

  constructor(client: Client, private readonly reliability: import('../../services/retry.js').Reliability = {}) {
    this.users = createUsersResources(client);
    this.roles = createRolesResources(client);
    this.channels = createChannelsResources(client);
    this.messages = createMessagesResources(client, this.reliability);
    this.collectors = createCollectorsResources(client);
    this.webhooks = createWebhooksResources(client);
    this.expressions = createExpressionsResources(client);
    this.threads = createThreadsResources(client);
    this.invites = createInvitesResources(client);
    this.gateway = createGatewayResources(client);
    this.instance = createInstanceResources(client);
    this.self = createSelfResources(client);
    this.cache = createCacheResources(client);
  }
}
