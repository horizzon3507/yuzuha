import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { arch, cpus, platform } from 'node:os';
import { pathToFileURL } from 'node:url';

async function loadDistDeps() {
  const [{ FluxerTransport, MemberCache, MemoryStore, Yuzuha, defineCommand }, { MockTransport, mockMessage }, { Client }] = await Promise.all([
    import(new URL('../dist/index.js', import.meta.url).href),
    import(new URL('../dist/testing.js', import.meta.url).href),
    import(new URL('../dist/sdk.js', import.meta.url).href),
  ]);
  return { Client, FluxerTransport, MemberCache, MemoryStore, Yuzuha, defineCommand, MockTransport, mockMessage };
}

export async function measureRestCalls(options = {}, providedDeps) {
  const rounds = options.rounds ?? 10;
  if (!Number.isSafeInteger(rounds) || rounds < 1 || rounds > 1000) {
    throw new Error('--rounds deve ser um inteiro entre 1 e 1000.');
  }
  const deps = providedDeps ?? await loadDistDeps();
  const { Client, FluxerTransport, MemberCache, MemoryStore, Yuzuha, defineCommand, MockTransport, mockMessage } = deps;

  // 1. Multi-permission command
  const permTransport = new MockTransport();
  const permBot = new Yuzuha({ transport: permTransport, store: new MemoryStore(), scheduler: false, http: false });
  permBot.command(defineCommand({
    name: 'multi',
    permissions: ['ManageMessages', 'KickMembers', 'BanMembers'],
    botPermissions: ['ManageMessages', 'KickMembers', 'BanMembers'],
    async run(ctx) {
      await ctx.requirePermission('ManageMessages');
      await ctx.requirePermission('BanMembers', true);
      await ctx.reply('ok');
    },
  }));
  assert.equal(await permBot.handle(mockMessage('!multi')), 'success');
  const permissionsCommand = { ...permTransport.calls };
  await permBot.destroy();

  // 2. Moderation ban command
  const modTransport = new MockTransport();
  const modBot = new Yuzuha({ transport: modTransport, store: new MemoryStore(), scheduler: false, http: false });
  modBot.command(defineCommand({
    name: 'ban',
    permissions: ['BanMembers'],
    botPermissions: ['BanMembers'],
    async run(ctx) {
      await ctx.mod.ban('2', { reason: 'bench' });
      await ctx.reply('banned');
    },
  }));
  assert.equal(await modBot.handle(mockMessage('!ban')), 'success');
  const moderationBan = { ...modTransport.calls };
  await modBot.destroy();

  // 3. FluxerTransport + MemberCache warm path over N rounds
  const restCounts = { guild: 0, roles: 0, member: 0, send: 0 };
  const client = new Client();
  const guild = {
    ownerId: '1',
    roles: new Map([['100', { id: '100', position: 0 }]]),
    fetchRoles: async () => { restCounts.roles++; },
    members: {
      fetch: async id => {
        restCounts.member++;
        return {
          roles: { cache: new Map([[id === '1' ? '10' : '20', { id: id === '1' ? '10' : '20', position: id === '1' ? 10 : 5 }]]) },
          permissions: { bitfield: 8n },
        };
      },
    },
  };
  Reflect.set(client.guilds, 'fetch', async () => { restCounts.guild++; return guild; });
  Reflect.set(client.channels, 'send', async () => { restCounts.send++; return { id: String(restCounts.send) }; });
  Reflect.set(client, 'user', { id: '999' });

  const cache = new MemberCache({ ttlMs: 60_000 });
  const cachedTransport = new FluxerTransport(client, {}, cache);
  const cacheBot = new Yuzuha({ client, transport: cachedTransport, store: new MemoryStore(), scheduler: false, http: false });
  cacheBot.command(defineCommand({
    name: 'check',
    permissions: ['ManageMessages', 'KickMembers'],
    botPermissions: ['ManageMessages', 'KickMembers'],
    async run(ctx) {
      await ctx.reply('cached');
    },
  }));

  assert.equal(await cacheBot.handle(mockMessage('!check')), 'success');
  const coldRestMemberCalls = restCounts.guild + restCounts.roles + restCounts.member;
  const beforeWarm = { ...restCounts };
  for (let i = 1; i < rounds; i++) {
    assert.equal(await cacheBot.handle(mockMessage('!check')), 'success');
  }
  const warmRestMemberCalls = (restCounts.guild - beforeWarm.guild)
    + (restCounts.roles - beforeWarm.roles)
    + (restCounts.member - beforeWarm.member);
  const totalRestMemberCalls = restCounts.guild + restCounts.roles + restCounts.member;
  await cacheBot.destroy();

  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  return {
    suite: 'rest-calls',
    version: manifest.version,
    date: new Date().toISOString(),
    node: process.versions.node,
    platform: platform(),
    arch: arch(),
    cpu: cpus()[0]?.model,
    config: { rounds },
    scenarios: {
      permissionsCommand,
      moderationBan,
      memberCacheHits: {
        rounds,
        coldRestMemberCalls,
        warmRestMemberCalls,
        totalRestMemberCalls,
        sendCalls: restCounts.send,
        savedRestMemberCalls: (rounds - 1) * coldRestMemberCalls,
      },
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  let json = false;
  let rounds = 10;
  for (let index = 2; index < process.argv.length; index++) {
    const arg = process.argv[index];
    if (arg === '--json') { json = true; continue; }
    if (arg === '--rounds') {
      rounds = Number(process.argv[++index]);
      continue;
    }
    throw new Error(`Opção desconhecida: ${arg}`);
  }
  const report = await measureRestCalls({ rounds });
  if (json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const { permissionsCommand, moderationBan, memberCacheHits } = report.scenarios;
    console.log([
      `Yuzuha ${report.version} · Node ${report.node} · ${report.platform}/${report.arch}`,
      `command/multi-permissions: member=${permissionsCommand.member}, reply=${permissionsCommand.reply}`,
      `moderation/ban: member=${moderationBan.member}, moderate=${moderationBan.moderate}, reply=${moderationBan.reply}`,
      `member-cache/warm-hits (${memberCacheHits.rounds} execuções): cold=${memberCacheHits.coldRestMemberCalls}, warm=${memberCacheHits.warmRestMemberCalls}, saved=${memberCacheHits.savedRestMemberCalls}, sends=${memberCacheHits.sendCalls}`,
    ].join('\n'));
  }
}
