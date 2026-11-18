import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';
import type { Yuzuha } from '../bot.js';
import { YuzuhaError } from '../errors.js';
import type { Store } from '../ports/store.js';
import { permission } from '../domain/permissions.js';
import { configuredBot, findConfig } from './config.js';
import { VERSION } from './version.js';

export interface DoctorCheck { name: string; status: 'pass' | 'warn' | 'fail'; message: string }
export interface DoctorReport { version: string; ok: boolean; offline: true; checks: DoctorCheck[] }

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname === '::1';
}

function inspectClientOptions(bot: Yuzuha): DoctorCheck {
  const { discovery, clientOptions, cacheSweepers } = bot.options;
  let status: DoctorCheck['status'] = 'pass';
  const parts: string[] = [];

  if (discovery !== undefined) {
    const rawOrigin = (typeof discovery === 'string' ? discovery : discovery.api).trim();
    const parsed = new URL(rawOrigin);
    const safeOrigin = `${parsed.origin}${parsed.pathname === '/' ? '' : parsed.pathname}`;
    const versionSuffix = typeof discovery === 'object' && discovery.version?.trim()
      ? ` (v${discovery.version.trim()})`
      : '';
    if (parsed.protocol === 'http:' && !isLoopbackHost(parsed.hostname)) {
      status = 'warn';
      parts.push(`discovery HTTP sem TLS (${safeOrigin}${versionSuffix})`);
    } else {
      parts.push(`discovery configurada (${safeOrigin}${versionSuffix})`);
    }
    if (clientOptions?.rest?.api !== undefined) {
      status = 'warn';
      parts.push('clientOptions.rest.api será ignorado pela discovery');
    }
  } else if (clientOptions?.instance) {
    parts.push('instância customizada em clientOptions');
  } else {
    parts.push('endpoints padrão do SDK');
  }

  if (clientOptions !== undefined) {
    const shards = clientOptions.shardCount ?? clientOptions.totalShards;
    if (shards !== undefined && shards !== 'auto' && (!Number.isSafeInteger(shards) || shards < 1)) {
      return { name: 'client', status: 'fail', message: 'clientOptions.shardCount deve ser "auto" ou inteiro >= 1.' };
    }
    const shardIds = clientOptions.shardIds ?? clientOptions.shardList;
    if (shardIds !== undefined) {
      if (!Array.isArray(shardIds) || shardIds.length === 0 || shardIds.some(id => !Number.isSafeInteger(id) || id < 0)) {
        return { name: 'client', status: 'fail', message: 'clientOptions.shardIds deve ser uma lista não vazia de inteiros >= 0.' };
      }
      if (typeof shards === 'number' && shardIds.some(id => id >= shards)) {
        return { name: 'client', status: 'fail', message: 'clientOptions.shardIds contém índice fora de shardCount.' };
      }
    }
    const details: string[] = [];
    if (shards !== undefined) details.push(`shards=${String(shards)}`);
    if (clientOptions.cache !== undefined) details.push('cache customizado');
    if (clientOptions.ignoredEvents?.length) details.push(`ignoredEvents=${clientOptions.ignoredEvents.length}`);
    parts.push(details.length ? `clientOptions (${details.join(', ')})` : 'clientOptions presente');
  }

  if (cacheSweepers && typeof cacheSweepers === 'object') {
    const active = (['messages', 'members', 'users'] as const).filter(bucket => Boolean(cacheSweepers[bucket]));
    parts.push(active.length ? `sweepers ativos: ${active.join(', ')}` : 'sweepers de cache inativos');
    if (clientOptions?.cache?.messages === false && cacheSweepers.messages) {
      status = 'warn';
      parts.push('cache de mensagens desabilitado para cacheSweepers.messages');
    }
  } else {
    parts.push('sweepers de cache inativos');
  }

  return { name: 'client', status, message: `${parts.join('; ')}.` };
}

async function storage(store: Store): Promise<DoctorCheck> {
  const path = 'path' in store && typeof store.path === 'string' ? store.path : undefined;
  if (!path || path === ':memory:') return { name: 'storage', status: 'pass', message: 'Store em memória ou implementação própria; nenhuma escrita realizada.' };
  let current = resolve(path);
  for (;;) {
    try {
      const info = await stat(current);
      await access(current, constants.R_OK | constants.W_OK | (info.isDirectory() ? constants.X_OK : 0));
      return { name: 'storage', status: 'pass', message: 'Arquivo ou diretório ancestral acessível para leitura e escrita.' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return { name: 'storage', status: 'fail', message: 'Caminho do store inacessível para leitura/escrita.' };
      const parent = dirname(current);
      if (parent === current) return { name: 'storage', status: 'fail', message: 'Diretório do store inacessível.' };
      current = parent;
    }
  }
}

export async function doctor(input?: string): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number);
  checks.push({ name: 'node', status: major > 22 || (major === 22 && minor >= 13) ? 'pass' : 'fail', message: `Node ${process.versions.node}; requer >=22.13.0.` });
  const entry = createRequire(import.meta.url).resolve('@fluxerjs/core');
  const sdk = JSON.parse(await readFile(join(dirname(entry), '..', 'package.json'), 'utf8')) as { version: string };
  checks.push({ name: 'sdk', status: sdk.version === '3.3.0' ? 'pass' : 'fail', message: `@fluxerjs/core ${sdk.version}; referência fixada em 3.3.0.` });
  let path: string;
  try { path = await findConfig(input); }
  catch {
    checks.push({ name: 'config', status: 'fail', message: 'Configuração não encontrada.' });
    return { version: VERSION, ok: false, offline: true, checks };
  }
  let token = process.env.FLUXER_BOT_TOKEN?.trim();
  if (!token) {
    try { token = parseEnv(await readFile(join(dirname(path), '.env'), 'utf8'))['FLUXER_BOT_TOKEN']?.trim(); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') checks.push({ name: 'environment', status: 'warn', message: 'Não foi possível ler .env.' }); }
  }
  checks.push({ name: 'token', status: token ? 'pass' : 'warn', message: token ? 'Token presente; valor oculto e autenticação não testada.' : 'Token ausente; necessário apenas para executar o bot.' });
  let configFailure: unknown;
  const loaded = await configuredBot(path, false).catch(error => { configFailure = error; return undefined; });
  if (!loaded) {
    const code = configFailure instanceof YuzuhaError ? ` (${configFailure.code})` : '';
    checks.push({ name: 'config', status: 'fail', message: `Configuração ou comandos inválidos${code}; use check para obter diagnósticos.` });
    if (configFailure instanceof YuzuhaError && configFailure.code === 'SHARDING_OPTIONS') {
      checks.push({ name: 'client', status: 'fail', message: configFailure.message });
    }
  } else {
    const { bot } = loaded;
    try {
      checks.push({ name: 'config', status: 'pass', message: `${bot.listCommands().length} comandos carregados e validados sem login.` });
      checks.push(inspectClientOptions(bot));
      let valid = true;
      for (const command of bot.listCommands()) {
        for (const flag of [...command.permissions ?? [], ...command.botPermissions ?? []]) {
          try { permission(flag); } catch { valid = false; }
        }
      }
      checks.push({ name: 'permissions', status: valid ? 'pass' : 'fail', message: valid
        ? 'Nomes de permissões declaradas reconhecidos; concessões remotas exigem conexão.' : 'Há nomes de permissões desconhecidos.' });
      checks.push(await storage(bot.store));
    } finally { await bot.destroy(); await bot.options.store?.close?.(); }
  }
  return { version: VERSION, ok: checks.every(check => check.status !== 'fail'), offline: true, checks };
}
