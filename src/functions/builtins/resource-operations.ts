import { ChannelType } from '@fluxerjs/types';
import { GuardError, YuzuhaError } from '../../errors.js';
import type { MessageInfo } from '../../ports/resources/messages.js';
import type { ApplicationInfo } from '../../ports/resources/instance.js';
import type { FunctionCall } from '../runtime/types.js';
import { defineFunctions } from './definition.js';

export function invalid(message: string): never {
  throw new GuardError(message, 'INVALID_ARGUMENT');
}

export function operator(c: FunctionCall): void {
  if (!c.ctx.isOwner()) throw new GuardError(c.ctx.t('ownerOnly'), 'OWNER_ONLY');
}

export function snowflake(raw: unknown): string {
  if (typeof raw !== 'string' || !/^\d{1,20}$/.test(raw) || BigInt(raw) > 18_446_744_073_709_551_615n) invalid('Informe um ID numérico de 64 bits.');
  return raw;
}

export function integer(raw: unknown, min: number, max: number): number {
  const n = typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : raw;
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < min || n > max) invalid(`Informe um inteiro entre ${min} e ${max}.`);
  return n;
}

function boundedText(raw: unknown, max: number): string {
  if (typeof raw !== 'string' || raw.length > max) invalid(`Informe texto de até ${max} caracteres.`);
  return raw;
}

function bool(raw: unknown): boolean {
  if (raw === true || raw === 'true') return true;
  if (raw === false || raw === 'false') return false;
  return invalid('Use true ou false.');
}

function options(raw: unknown, keys: string[]): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)
    || Object.keys(raw).some(key => !keys.includes(key))) invalid('Opções inválidas.');
  return raw as Record<string, unknown>;
}

function batch<T>(raw: unknown, max: number, parse: (item: unknown) => T): T[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > max) invalid(`Informe de 1 a ${max} itens.`);
  return raw.map(parse);
}

async function both(c: FunctionCall, flag: string, channelID?: string): Promise<void> {
  await c.ctx.requirePermission(flag, false, undefined, channelID);
  await c.ctx.requirePermission(flag, true, undefined, channelID);
}

async function guildChannel(c: FunctionCall, id: string, flag = 'ViewChannel') {
  const guildID = c.ctx.requireGuild();
  const channel = await c.ctx.resources.channels.get(id);
  if (channel.guildID !== guildID) throw new GuardError('O canal deve pertencer ao servidor atual.', 'GENERIC');
  await both(c, flag, id);
  return channel;
}

async function collectorChannel(c: FunctionCall): Promise<string> {
  const id = snowflake(c.ctx.message.channelID);
  if (c.ctx.guildID) {
    await guildChannel(c, id);
    await both(c, 'ReadMessageHistory', id);
  } else if (!c.ctx.authorID) {
    throw new GuardError('A coleta exige um autor no contexto.', 'GENERIC');
  }
  return id;
}

function redactApplication(info: ApplicationInfo): Omit<ApplicationInfo, 'clientSecret'> {
  const { id, name, icon, description, botPublic, botRequireCodeGrant, verifyKey, flags, ownerID, botID, redirectURIs } = info;
  return { id, name, icon, description, botPublic, botRequireCodeGrant, verifyKey, flags, ownerID, botID, redirectURIs: [...redirectURIs] };
}

async function webhookMessage(c: FunctionCall, threadIndex: number) {
  c.ctx.requireGuild();
  const id = snowflake(await c.text(0));
  const messageID = snowflake(await c.text(1));
  const threadID = c.count > threadIndex ? snowflake(await c.text(threadIndex)) : undefined;
  const webhook = await c.ctx.resources.webhooks.fetch(id);
  if (!webhook.token) invalid('O webhook não possui um token disponível.');
  if (threadID) {
    const thread = await guildChannel(c, threadID, 'ManageWebhooks');
    if (thread.parentID !== webhook.channelID) invalid('A thread deve pertencer ao canal do webhook.');
  }
  return { id, messageID, token: webhook.token, threadID };
}

async function membersRequest(c: FunctionCall, wait: boolean) {
  const guildID = c.ctx.requireGuild();
  await both(c, 'ManageGuild');
  const input = c.count ? options(await c.arg(0), ['query', 'limit', 'userIDs', 'presences', ...(wait ? ['timeoutMs'] : [])]) : {};
  const presences = input.presences === undefined ? undefined : bool(input.presences);
  if (input.userIDs !== undefined && (input.query !== undefined || input.limit !== undefined)) invalid('Use userIDs ou query/limit.');
  const selection = input.userIDs !== undefined
    ? { userIDs: [...new Set(batch(input.userIDs, 100, snowflake))] }
    : { query: input.query === undefined ? '' : boundedText(input.query, 100), limit: integer(input.limit ?? 25, 1, 100) };
  const request = { guildID, presences, ...selection };
  if (!wait) {
    c.ctx.resources.gateway.requestMembers(request);
    return '';
  }
  const timeoutMs = integer(input.timeoutMs ?? 5000, 1, 30_000);
  const result = await c.wait(c.ctx.resources.gateway.fetchMembers({ ...request, timeoutMs, signal: c.ctx.signal }));
  c.checkOutput(result);
  return result;
}

export const resourceOperations = defineFunctions(fn => {
  fn('instanceInfo', 'instance', 0, 0, '', 'Retorna a descoberta da instância configurada; somente donos do bot.', c => {
    operator(c);
    return c.ctx.resources.instance.describe();
  });
  fn('gatewayInfo', 'instance', 0, 0, '', 'Retorna URL, shards e limites de sessão do gateway; somente donos do bot.', c => {
    operator(c);
    return c.ctx.resources.instance.gatewayInfo();
  });
  fn('applicationInfo', 'instance', 0, 0, '', 'Retorna a aplicação autenticada sem clientSecret; somente donos do bot.', async c => {
    operator(c);
    return redactApplication(await c.ctx.resources.instance.application());
  });
  fn('oauthApplications', 'instance', 0, 0, '', 'Lista aplicações OAuth sem clientSecret; somente donos do bot.', async c => {
    operator(c);
    return (await c.ctx.resources.instance.oauthApplications()).map(redactApplication);
  });
  fn('emojiMetadata', 'instance', 1, 1, '[emoji]', 'Retorna metadados do emoji pelo ID.', async c =>
    c.ctx.resources.instance.emojiMetadata(snowflake(await c.text(0))));
  fn('stickerMetadata', 'instance', 1, 1, '[sticker]', 'Retorna metadados do sticker pelo ID.', async c =>
    c.ctx.resources.instance.stickerMetadata(snowflake(await c.text(0))));
  fn('resolveEmoji', 'instance', 1, 1, '[emoji]', 'Resolve emoji por texto, ID ou menção no servidor atual (quando disponível).', async c => {
    const emoji = boundedText(await c.text(0), 128).trim();
    if (!emoji) invalid('Informe um emoji.');
    return c.ctx.resources.instance.resolveEmoji(emoji, c.ctx.guildID || undefined);
  });
  fn('cacheStats', 'cache', 0, 0, '', 'Retorna estatísticas, limites e configuração de cascata do cache local; somente donos do bot.', c => {
    operator(c);
    return c.ctx.resources.cache.stats();
  });
  fn('sweepCache', 'cache', 1, 3, '[messages|members|users|channels|guilds;escopo?;idadeMs?]', 'Limpa cache local e retorna quantidade removida; somente donos do bot. Escopo opcional: canal para messages ou servidor para members. Idade só para messages.', async c => {
    operator(c);
    const kind = await c.text(0);
    const scope = c.count > 1 ? (await c.text(1)).trim() : '';
    const age = c.count > 2 ? integer(await c.text(2), 0, Number.MAX_SAFE_INTEGER) : undefined;
    if ((scope && kind !== 'messages' && kind !== 'members') || (age !== undefined && kind !== 'messages')) invalid('Escopo ou idade incompatível com o cache.');
    const id = scope ? snowflake(scope) : undefined;
    switch (kind) {
      case 'messages': return c.ctx.resources.cache.sweepMessages({ channelID: id, maxAgeMs: age });
      case 'members': return c.ctx.resources.cache.sweepMembers({ guildID: id });
      case 'users': return c.ctx.resources.cache.sweepUsers();
      case 'channels': return c.ctx.resources.cache.sweepChannels();
      case 'guilds': return c.ctx.resources.cache.sweepGuilds();
      default: return invalid('Tipo de cache desconhecido.');
    }
  });
  fn('cascadeCache', 'cache', 2, 2, '[channel|guild;id]', 'Limpa dependências do ID no cache local sem apagar entidades no Fluxer; somente donos do bot.', async c => {
    operator(c);
    const kind = await c.text(0);
    const id = snowflake(await c.text(1));
    if (kind === 'channel') await c.ctx.resources.cache.cascadeChannel(id);
    else if (kind === 'guild') await c.ctx.resources.cache.cascadeGuild(id);
    else invalid('Use channel ou guild.');
    return '';
  });
  fn('evictCachedChannel', 'cache', 1, 1, '[canal]', 'Remove apenas o canal indicado do cache local e retorna se existia; somente donos do bot.', async c => {
    operator(c);
    const id = snowflake(await c.text(0));
    return (await c.ctx.resources.cache.sweepChannels({ keep: (_channel, channelID) => channelID !== id })) > 0;
  });
  fn('selfUser', 'users', 0, 0, '', 'Busca dados normalizados do usuário autenticado; somente donos do bot.', c => {
    operator(c);
    return c.ctx.resources.self.fetch();
  });
  fn('selfGuilds', 'users', 0, 1, '[contagens?]', 'Lista servidores do bot, opcionalmente com contagens; somente donos do bot.', async c => {
    operator(c);
    return c.ctx.resources.self.guilds({ withCounts: c.count ? bool(await c.arg(0)) : false });
  });
  fn('selfLeaveGuild', 'users', 0, 0, '', 'Remove o bot do servidor atual sem credenciais sudo; exige dono do bot e do servidor.', async c => {
    operator(c);
    await c.ctx.leaveGuildAsSelf();
    return '';
  });
  fn('deleteMyMessages', 'users', 0, 0, '', 'Pede a exclusão de todas as mensagens do bot no servidor atual, sem credenciais sudo; exige dono do bot e ManageMessages de autor e bot.', async c => {
    operator(c);
    const guildID = c.ctx.requireGuild();
    await both(c, 'ManageMessages');
    await c.ctx.resources.self.deleteMyMessages(guildID);
    return '';
  });
  fn('fetchGatewayMembers', 'gateway', 0, 1, '[opções?]', 'Busca membros do servidor atual com ManageGuild de autor e bot; até 100 por query/limit ou userIDs, presences e timeoutMs de até 30000.', c => membersRequest(c, true));
  fn('requestGatewayMembers', 'gateway', 0, 1, '[opções?]', 'Solicita membros no servidor atual com ManageGuild de autor e bot; até 100 por query/limit ou userIDs, com presences opcional.', c => membersRequest(c, false));
  fn('requestGuildCounts', 'gateway', 0, 0, '', 'Solicita contagens no servidor atual sem aguardar o evento; exige ManageGuild de autor e bot.', async c => {
    const guildID = c.ctx.requireGuild();
    await both(c, 'ManageGuild');
    c.ctx.resources.gateway.requestGuildCounts([guildID]);
    return '';
  });
  fn('requestChannelCounts', 'gateway', 1, 1, '[canais]', 'Solicita contagens de até 20 canais visíveis do servidor atual, sem aguardar os eventos.', async c => {
    const guildID = c.ctx.requireGuild();
    const channelIDs = [...new Set(batch(await c.arg(0), 20, snowflake))];
    for (const id of channelIDs) await guildChannel(c, id);
    c.ctx.resources.gateway.requestChannelCounts({ guildID, channelIDs });
    return '';
  });
  fn('requestForumUnreads', 'gateway', 2, 2, '[canal;threads]', 'Solicita não lidos de até 20 posts visíveis do fórum atual; objetos com threadID e ackMessageID opcional.', async c => {
    const guildID = c.ctx.requireGuild();
    const channelID = snowflake(await c.text(0));
    const threads = batch(await c.arg(1), 20, raw => {
      const input = options(raw, ['threadID', 'ackMessageID']);
      return { threadID: snowflake(input.threadID), ackMessageID: input.ackMessageID === undefined ? undefined : snowflake(input.ackMessageID) };
    });
    const channel = await guildChannel(c, channelID);
    if (channel.type !== ChannelType.GuildForum && channel.type !== ChannelType.GuildMedia) invalid('Informe um canal de fórum ou mídia.');
    await both(c, 'ReadMessageHistory', channelID);
    for (const { threadID } of threads) {
      const thread = await guildChannel(c, threadID);
      if (thread.parentID !== channelID) invalid('O post deve pertencer ao canal informado.');
      await both(c, 'ReadMessageHistory', threadID);
    }
    c.ctx.resources.gateway.requestForumUnreads({ guildID, channelID, threads });
    return '';
  });
  fn('subscribeThreads', 'gateway', 1, 2, '[habilitar;threads?]', 'Ativa ou desativa a assinatura de threads do servidor atual; somente donos do bot com ManageGuild de autor e bot, até 20 IDs.', async c => {
    operator(c);
    const guildID = c.ctx.requireGuild();
    const threads = bool(await c.arg(0));
    const threadIDs = c.count > 1 ? [...new Set(batch(await c.arg(1), 20, snowflake))] : undefined;
    await both(c, 'ManageGuild');
    for (const id of threadIDs ?? []) {
      const thread = await guildChannel(c, id);
      if (thread.type !== ChannelType.AnnouncementThread && thread.type !== ChannelType.PublicThread && thread.type !== ChannelType.PrivateThread) {
        invalid('Informe somente IDs de threads.');
      }
    }
    c.ctx.resources.gateway.subscribeThreads({ guildID, threads, threadIDs });
    return '';
  });
  fn('collectMessages', 'collectors', 1, 4, '[tempoMs;máximo?;usuário?;contém?]', 'Coleta até 20 mensagens no canal atual em até 30000 ms; somente dados normalizados e filtros declarativos.', async c => {
    const timeMs = integer(await c.arg(0), 1, 30_000);
    const max = c.count > 1 ? integer(await c.arg(1), 1, 20) : 5;
    const user = c.count > 2 ? await c.text(2) : '';
    const userID = user ? snowflake(user) : undefined;
    const contains = c.count > 3 ? boundedText(await c.text(3), 200) : undefined;
    const channelID = await collectorChannel(c);
    return c.wait((async () => {
      const result = [];
      for await (const message of c.ctx.resources.collectors.collectMessages(channelID, { timeMs, max, maxBuffer: max, userID, contains })) {
        const { id, content, authorID, authorName, authorBot, guildID, mentions } = message;
        result.push({ id, content, authorID, authorName, authorBot, guildID, channelID, mentions: [...mentions] });
        c.checkOutput(result);
        if (result.length >= max) break;
      }
      return result;
    })());
  });
  fn('collectReactions', 'collectors', 2, 5, '[mensagem;tempoMs;máximo?;usuário?;emojis?]', 'Coleta até 20 reações no canal atual em até 30000 ms; emojis opcional é um array de até 10 textos.', async c => {
    const messageID = snowflake(await c.text(0));
    const timeMs = integer(await c.arg(1), 1, 30_000);
    const max = c.count > 2 ? integer(await c.arg(2), 1, 20) : 5;
    const user = c.count > 3 ? await c.text(3) : '';
    const userID = user ? snowflake(user) : undefined;
    const emojis = c.count > 4 ? batch(await c.arg(4), 10, raw => boundedText(raw, 128).trim() || invalid('Emoji obrigatório.')) : undefined;
    const channelID = await collectorChannel(c);
    return c.wait((async () => {
      const result = [];
      for await (const { userID: actorID, emoji, messageID: reactedID } of c.ctx.resources.collectors.collectReactions(channelID, { messageID, timeMs, max, maxBuffer: max, userID, emojis })) {
        result.push({ userID: actorID, emoji, messageID: reactedID ?? messageID });
        c.checkOutput(result);
        if (result.length >= max) break;
      }
      return result;
    })());
  });
  fn('fetchWebhookMessage', 'webhooks', 2, 3, '[webhook;mensagem;thread?]', 'Busca uma mensagem do webhook com ManageWebhooks de autor e bot; o script não recebe o token.', async c => {
    const { id, messageID, token, threadID } = await webhookMessage(c, 2);
    return c.ctx.resources.webhooks.fetchMessage(id, token, messageID, threadID ? { threadID } : undefined);
  });
  fn('editWebhookMessage', 'webhooks', 3, 4, '[webhook;mensagem;texto;thread?]', 'Edita até 2000 caracteres de uma mensagem do webhook, sem menções automáticas; exige ManageWebhooks de autor e bot.', async c => {
    const content = boundedText(await c.text(2), 2000);
    const { id, messageID, token, threadID } = await webhookMessage(c, 3);
    return c.ctx.resources.webhooks.editMessage(id, token, messageID, {
      content, ...(threadID ? { threadID } : {}), allowedMentions: { parse: [], repliedUser: false },
    });
  });
  fn('deleteWebhookMessage', 'webhooks', 2, 3, '[webhook;mensagem;thread?]', 'Apaga uma mensagem do webhook com ManageWebhooks de autor e bot, sem passar o token no script.', async c => {
    const { id, messageID, token, threadID } = await webhookMessage(c, 2);
    await c.ctx.resources.webhooks.deleteMessage(id, token, messageID, threadID ? { threadID } : undefined);
    return '';
  });
  fn('bulkFetchMessages', 'messages', 1, 1, '[janelas]', 'Busca mensagens normalizadas em até 10 canais visíveis (até 100 mensagens no total); cada janela tem channelID, limit e um cursor opcional.', async c => {
    c.ctx.requireGuild();
    const requests = batch(await c.arg(0), 10, raw => {
      const item = options(raw, ['channelID', 'limit', 'after', 'before', 'around']);
      const cursor = (['after', 'before', 'around'] as const).filter(key => item[key] !== undefined);
      if (cursor.length > 1) invalid('Use somente um cursor por canal.');
      return { channelID: snowflake(item.channelID), limit: integer(item.limit, 1, 100),
        ...(cursor[0] ? { [cursor[0]]: snowflake(item[cursor[0]]) } : {}) };
    });
    if (requests.reduce((total, request) => total + request.limit, 0) > 100) invalid('O limite total é de 100 mensagens.');
    for (const id of new Set(requests.map(request => request.channelID))) {
      await guildChannel(c, id);
      await both(c, 'ReadMessageHistory', id);
    }
    const result: MessageInfo[] = [];
    for (const { channelID, limit, ...cursor } of requests) {
      result.push(...await c.ctx.resources.messages.list(channelID, limit, cursor));
      c.checkOutput(result);
    }
    return result;
  });
  fn('cachedMessage', 'messages', 1, 1, '[mensagem]', 'Consulta uma mensagem no cache do canal atual, sem busca de mensagem no Fluxer; retorna null se ausente.', async c => {
    const messageID = snowflake(await c.text(0));
    const channelID = await collectorChannel(c);
    const messages = c.ctx.resources.messages;
    if (!messages.cached) throw new YuzuhaError('NATIVE_UNAVAILABLE', 'O recurso de mensagens não implementa o cache de mensagens.');
    return messages.cached(channelID, messageID);
  });
  fn('channelSlowmode', 'channels', 1, 1, '[canal]', 'Consulta o modo lento de um canal visível no servidor atual.', async c => {
    const id = snowflake(await c.text(0));
    await guildChannel(c, id);
    return c.ctx.resources.channels.slowmode(id);
  });
  fn('channelRtcRegions', 'channels', 1, 1, '[canal]', 'Consulta as regiões RTC de um canal visível no servidor atual.', async c => {
    const id = snowflake(await c.text(0));
    await guildChannel(c, id);
    return c.ctx.resources.channels.rtcRegions(id);
  });
  fn('sendTyping', 'channels', 0, 1, '[canal?]', 'Envia indicação de digitação no servidor atual; exige SendMessages de autor e bot.', async c => {
    c.ctx.requireGuild();
    await c.ctx.resources.channels.sendTyping(snowflake(c.count ? await c.text(0) : c.ctx.message.channelID));
    return '';
  });
});
