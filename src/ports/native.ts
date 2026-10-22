import type { Client, Message } from '@fluxerjs/core';

export interface NativeAccess {
  client: Client;
  message?: Message;
}
