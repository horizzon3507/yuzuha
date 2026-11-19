import { DEFAULT_API, DEFAULT_LOCALE, DEFAULT_USER_AGENT, DEFAULT_VERSION, RateLimitManager } from '@fluxerjs/rest';
import { DEFAULT_GUILDS_PER_SHARD, DEFAULT_RESUME_TTL_MS, GatewayCloseCodes, MAX_GUILDS_PER_SHARD, MAX_SHARD_COUNT,
  guildMatchesShard, isSessionInfoFresh, narrowGatewayPayload, recommendedShardCount, shardIdForGuild, shouldReconnectOnClose } from '@fluxerjs/ws';
import { GuardError } from '../../errors.js';
import { defineFunctions } from './definition.js';
import { integer, invalid, operator, snowflake } from './resource-operations.js';

export const resourceDiagnostics = defineFunctions(fn => {
  fn('botReadiness', 'instance', 0, 0, '', 'Retorna ready, readyAt e uptimeMs; datas em milissegundos, ausentes antes de conectar.', c =>
    c.ctx.runtimeInfo?.readiness() ?? { ready: false, readyAt: null, uptimeMs: null });
  fn('requireBotReady', 'guards', 0, 0, '', 'Encerra a execução se o bot ainda não estiver pronto.', c => {
    if (!c.ctx.runtimeInfo?.readiness().ready) throw new GuardError('O bot ainda não está pronto.', 'GENERIC');
    return '';
  });
  fn('shardInfo', 'gateway', 0, 0, '', 'Retorna id, ids locais, count e isLeader; vazio sem contexto de shard.', c => {
    const shard = c.ctx.shard;
    return shard ? { id: shard.id, ids: [...shard.ids], count: shard.count, isLeader: shard.isLeader } : null;
  });
  fn('shardIdForGuild', 'gateway', 0, 2, '[servidor?;shards?]', 'Calcula o shard de um servidor; usa o servidor atual e o total do contexto se omitidos.', async c => {
    const guildID = snowflake(c.count ? await c.text(0) : c.ctx.requireGuild());
    if (c.count > 1) return shardIdForGuild(guildID, integer(await c.arg(1), 1, MAX_SHARD_COUNT));
    if (!c.ctx.shard) invalid('Informe o total de shards quando não há contexto de shard.');
    return c.ctx.shard.shardIdForGuild(guildID);
  });
  fn('guildMatchesShard', 'gateway', 3, 3, '[servidor;shard;total]', 'Verifica se o servidor pertence ao shard informado, sem acessar o gateway.', async c => {
    const guildID = snowflake(await c.text(0));
    const count = integer(await c.arg(2), 1, MAX_SHARD_COUNT);
    return guildMatchesShard(guildID, { shardId: integer(await c.arg(1), 0, count - 1), numShards: count });
  });
  fn('recommendedShardCount', 'gateway', 1, 2, '[servidores;servidoresPorShard?]', 'Calcula o total recomendado de shards a partir do número de servidores.', async c =>
    recommendedShardCount(integer(await c.arg(0), 0, Number.MAX_SAFE_INTEGER),
      c.count > 1 ? integer(await c.arg(1), 1, MAX_GUILDS_PER_SHARD) : undefined));
  fn('gatewayConstants', 'gateway', 0, 0, '', 'Retorna constantes públicas de sharding, janela de resume e códigos de fechamento.', () => ({
    defaultGuildsPerShard: DEFAULT_GUILDS_PER_SHARD, maxGuildsPerShard: MAX_GUILDS_PER_SHARD, maxShardCount: MAX_SHARD_COUNT,
    defaultResumeTtlMs: DEFAULT_RESUME_TTL_MS, closeCodes: { ...GatewayCloseCodes },
  }));
  fn('gatewayShouldReconnect', 'gateway', 1, 1, '[código]', 'Classifica um código de fechamento; nunca reconecta o bot.', async c =>
    shouldReconnectOnClose(integer(await c.arg(0), 1000, 4999)));
  fn('gatewaySessionFresh', 'gateway', 1, 3, '[atualizadoMs;ttlMs?;agoraMs?]', 'Compara apenas timestamps com a janela de resume; não acessa credenciais ou sessão ativa.', async c => {
    const updatedAt = integer(await c.arg(0), 0, Number.MAX_SAFE_INTEGER);
    const ttl = c.count > 1 ? integer(await c.arg(1), 0, Number.MAX_SAFE_INTEGER) : undefined;
    const now = c.count > 2 ? integer(await c.arg(2), 0, Number.MAX_SAFE_INTEGER) : c.ctx.now();
    return isSessionInfoFresh({ sessionId: '', sequence: 0, updatedAt }, ttl, now);
  });
  fn('normalizeGatewayPayload', 'gateway', 1, 1, '[objeto]', 'Normaliza o envelope JSON fornecido pelo próprio script; não lê nem envia payloads do gateway.', async c => {
    const value = await c.arg(0);
    c.checkOutput(value);
    return narrowGatewayPayload(value);
  });
  fn('gatewayStatus', 'gateway', 0, 0, '', 'Retorna URL, quantidade, status e latência dos shards; somente donos do bot. Vazio se desconectado.', c => {
    operator(c);
    return c.ctx.runtimeInfo?.gateway() ?? null;
  });
  fn('clusterInfo', 'gateway', 0, 1, '[id?]', 'Retorna total e até 100 runtimes com ID e status, ou filtra por ID; somente donos do bot.', async c => {
    operator(c);
    const id = c.count ? await c.text(0) : undefined;
    if (id !== undefined && (!id || id.length > 128)) invalid('Informe um ID de runtime de 1 a 128 caracteres.');
    return c.ctx.runtimeInfo?.cluster(id) ?? null;
  });
  fn('restDefaults', 'gateway', 0, 0, '', 'Retorna API, versão, locale e user agent padrão do SDK; não envia requisições.', () => ({
    api: DEFAULT_API, version: DEFAULT_VERSION, locale: DEFAULT_LOCALE, userAgent: DEFAULT_USER_AGENT,
  }));
  fn('restRateLimits', 'gateway', 1, 1, '[operações]', 'Simula até 20 operações setBucket/getBucket/setGlobalReset/getGlobalReset/getWaitTime/updateFromHeaders/prune/size; não acessa os limites do bot.', async c => {
    const operations = await c.arg(0);
    if (!Array.isArray(operations) || !operations.length || operations.length > 20) invalid('Informe de 1 a 20 operações.');
    c.checkOutput(operations);
    const manager = new RateLimitManager();
    return operations.map(raw => {
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) invalid('Cada operação deve ser um objeto.');
      const { op, route, limit, remaining, resetAt, headers } = raw as Record<string, unknown>;
      const routeKey = () => {
        if (typeof route !== 'string' || !route.length || route.length > 256) invalid('Informe uma rota de 1 a 256 caracteres.');
        return route;
      };
      const time = () => integer(resetAt, 0, Number.MAX_SAFE_INTEGER);
      switch (op) {
        case 'setBucket':
          manager.setBucket(routeKey(), integer(limit, 0, 1_000_000), integer(remaining, 0, 1_000_000), time());
          return null;
        case 'getBucket': return manager.getBucket(routeKey()) ?? null;
        case 'setGlobalReset': manager.setGlobalReset(time()); return null;
        case 'getGlobalReset': return manager.getGlobalReset();
        case 'getWaitTime': return manager.getWaitTime(routeKey());
        case 'updateFromHeaders': {
          if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) invalid('Informe os headers de rate limit.');
          const parsed = new Headers();
          for (const [key, value] of Object.entries(headers)) {
            if (!/^x-ratelimit-(?:bucket|limit|remaining|reset|reset-after)$/i.test(key)
              || typeof value !== 'string' || !/^[\x20-\x7e]{1,128}$/.test(value)) invalid('Header de rate limit inválido.');
            parsed.set(key, value);
          }
          manager.updateFromHeaders(routeKey(), parsed);
          return null;
        }
        case 'prune': manager.prune(); return null;
        case 'size': return manager.size;
        default: return invalid('Operação de rate limit desconhecida.');
      }
    });
  });
});
