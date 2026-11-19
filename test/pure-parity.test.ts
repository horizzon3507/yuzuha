import test from 'node:test';
import assert from 'node:assert/strict';
import { CDN_URL, STATIC_CDN_URL, Client, DEFAULT_INSTANCE_ENDPOINTS } from '@fluxerjs/core';
import { RateLimitError } from '@fluxerjs/rest';
import { APIErrorCode } from '@fluxerjs/types';
import { ErrorCodes, FluxerError, PermissionFlags, UserFlagsBits, SnowflakeUtil } from '@fluxerjs/util';
import { CommandContext } from '../src/commands/context.js';
import type { ContextOptions } from '../src/commands/context.js';
import { GuardError, PartialModerationError } from '../src/errors.js';
import { functions, registerBuiltins, Runtime } from '../src/functions.js';
import { defaultLimits } from '../src/functions/runtime/limits.js';
import { MemoryStore, Yuzuha } from '../src/index.js';
import { MockTransport, mockMessage, mockResources } from '../src/testing.js';

function harness(options: Partial<ContextOptions> = {}, runtime = new Runtime()) {
  const transport = new MockTransport();
  const ctx = new CommandContext({
    message: mockMessage('!pure', { guildID: undefined }), command: { name: 'pure', code: '' },
    messageAvailable: false, transport, store: new MemoryStore(), cooldown: () => 0, ...options,
  });
  registerBuiltins(runtime);
  return { ctx, run: (source: string) => runtime.execute(runtime.compile(source), ctx) };
}

test('CDN constrói URLs sem mensagem, servidor ou acesso à rede', async () => {
  const { run } = harness();
  const id = '18446744073709551615';
  assert.equal(await run('$cdnURL[media]'), CDN_URL);
  assert.equal(await run('$cdnURL[static]'), STATIC_CDN_URL);
  assert.equal(await run(`$cdnURL[defaultAvatar;${id}]`), `${STATIC_CDN_URL}/avatars/3.png`);
  assert.equal(await run(`$cdnURL[displayAvatar;${id}]`), `${STATIC_CDN_URL}/avatars/3.png`);
  assert.equal(await run('$cdnURL[avatar;1]'), null);
  assert.equal(await run('$cdnURL[avatar;1;a_hash;512;webp]'), `${CDN_URL}/avatars/1/a_hash.gif?size=512`);
  assert.equal(await run('$cdnURL[banner;1;hash;;webp]'), `${CDN_URL}/banners/1/hash.webp`);
  assert.equal(await run('$cdnURL[memberAvatar;10;1;hash]'), `${CDN_URL}/guilds/10/users/1/avatars/hash.png`);
  assert.equal(await run('$cdnURL[memberBanner;10;1;hash]'), `${CDN_URL}/guilds/10/users/1/banners/hash.png`);
  assert.equal(await run('$cdnURL[guildIcon;10;hash]'), `${CDN_URL}/icons/10/hash.png`);
  assert.equal(await run('$cdnURL[guildBanner;10;hash]'), `${CDN_URL}/banners/10/hash.png`);
  assert.equal(await run('$cdnURL[guildSplash;10;hash]'), `${CDN_URL}/splashes/10/hash.png`);
  assert.equal(await run('$cdnURL[guildSplash;10]'), null);
  assert.equal(await run('$cdnURL[emoji;1;;true]'), `${CDN_URL}/emojis/1.gif`);
  assert.equal(await run('$cdnURL[sticker;1]'), `${CDN_URL}/stickers/1.png`);
  assert.equal(await run('$inviteURL[C_1;https://invite.example/]'), 'https://invite.example/C_1');
  for (const source of ['$cdnURL[avatar;1;../hash]', '$cdnURL[emoji;1;0]', '$cdnURL[emoji;1;;yes]',
    '$cdnURL[avatar;$jsonDecode[18446744073709551615];hash]', '$inviteURL[a/b]', '$inviteURL[a;https://user@invite.example]'])
    await assert.rejects(run(`$try[${source};fallback]`), GuardError);
});

test('CDN usa media, static_cdn e invite descobertos e respeita override de media', async t => {
  const instance = { media: 'https://media.example/assets/', static_cdn: 'https://static.example/', invite: 'https://invite.example/' };
  t.mock.method(Client, 'fromDiscovery', async () => new Client({ instance }));
  const discoveredTransport = new MockTransport();
  const bot = await Yuzuha.fromDiscovery('https://instance.example', {
    engine: functions(), transport: discoveredTransport, store: new MemoryStore(),
  });
  bot.command({ name: 'cdn', code: '$reply[$cdnURL[emoji;1] $cdnURL[displayAvatar;1] $inviteURL[ABC]]' });
  assert.equal(await bot.handle(mockMessage('!cdn', { guildID: undefined })), 'success');
  assert.equal(discoveredTransport.messages[0]?.payload.content,
    'https://media.example/assets/emojis/1.png https://static.example/avatars/1.png https://invite.example/ABC');
  const transport = new MockTransport();
  const configured = new Yuzuha({ clientOptions: { instance }, engine: functions(), transport, store: new MemoryStore(),
    cdn: { mediaBase: 'https://override.example' } });
  t.after(async () => { await bot.destroy(); await configured.destroy(); });
  configured.command({ name: 'cdn', code: '$reply[$cdnURL[media] $cdnURL[static] $inviteURL[ABC]]' });
  assert.equal(await configured.handle(mockMessage('!cdn', { guildID: undefined })), 'success');
  assert.equal(transport.messages[0]?.payload.content, 'https://override.example https://static.example https://invite.example/ABC');
});

test('discovery manipula somente valores e preserva defaults e campos conhecidos', async () => {
  const { run } = harness();
  assert.equal(await run('$instanceValue[normalize; https://fluxer.example/api/v1/ ]'), 'https://fluxer.example/api');
  assert.equal(await run('$instanceValue[discoveryURL;https://fluxer.example/api/v1]'), 'https://fluxer.example/api/.well-known/fluxer');
  assert.deepEqual(await run('$instanceValue[resolve]'), { endpoints: DEFAULT_INSTANCE_ENDPOINTS, discovery: null });
  assert.equal(await run('$jsonGet[$instanceValue[resolve;$object[api;https://api.example/v2]];endpoints.api_public]'), 'https://api.example');
  assert.equal(await run('$jsonGet[$instanceValue[parse;$object[api_code_version;1;endpoints;$sdkConstant[DEFAULT_INSTANCE_ENDPOINTS]]];features.self_hosted]'), false);
  assert.equal(await run('$sdkError[isFluxer;$instanceValue[parse;$object[]]]'), true);
  await assert.rejects(run('$instanceValue[discoveryURL;file:///etc]'), GuardError);
  await assert.rejects(run('$instanceValue[resolve;$array[]]'), GuardError);
});

test('constantes usam allowlist e operações de flags preservam máscaras grandes', async () => {
  const { run, ctx } = harness();
  assert.equal(await run('$sdkConstant[ChannelType;GuildText]'), 0);
  assert.equal(await run('$sdkConstant[ChannelType;constructor]'), null);
  await assert.rejects(run('$sdkConstant[Routes]'), GuardError);
  const high = 1n << 100n;
  assert.equal(await run(`$flags[bits;add;${high};2]`), String(high | 2n));
  assert.equal(await run(`$flags[bits;remove;${high | 2n};2]`), String(high));
  assert.equal(await run('$flags[permissions;resolve;$array[ViewChannel;SendMessages]]'), String(PermissionFlags.ViewChannel | PermissionFlags.SendMessages));
  assert.equal(await run('$flags[permissions;any;Administrator;SendMessages]'), true);
  assert.equal(await run('$flags[permissions;has;ViewChannel;$array[SendMessages;ViewChannel]]'), false);
  assert.deepEqual(await run('$flags[permissions;missing;ViewChannel;$array[SendMessages;ViewChannel]]'), ['SendMessages']);
  assert.equal(await run('$flags[user;equals;PremiumEnabledOverride;$sdkConstant[UserFlagsBits;PremiumEnabledOverride]]'), true);
  assert.equal(await run('$sdkConstant[UserFlagsBits;PremiumEnabledOverride]'), String(UserFlagsBits.PremiumEnabledOverride));
  assert.equal(await run('$flags[message;has;SuppressEmbeds;SuppressEmbeds]'), true);
  assert.equal(await run('$flags[systemChannel;resolve;0]'), '0');
  assert.deepEqual(await run('$flags[threadMember;names;OnlyMentions]'), ['OnlyMentions']);
  assert.deepEqual(await run('$flags[memberProfile;serialize;AvatarUnset]'), { AvatarUnset: true, BannerUnset: false });
  ctx.vars.set('tooMany', Array(129).fill('0'));
  for (const mask of ['-1', String(1n << 128n), 'constructor', '$jsonDecode[9007199254740993]', '$get[tooMany]'])
    await assert.rejects(run(`$try[$flags[bits;resolve;${mask}];fallback]`), GuardError);
});

test('parsers, formatação e snowflakes preservam dados, não código', async () => {
  const { run, ctx } = harness();
  const id = '18446744073709551615';
  assert.equal(await run(`$sdkParse[userMention;<@!${id}>]`), null);
  assert.equal(await run('$sdkParse[userMention;<@!1844674407370955161>]'), '1844674407370955161');
  assert.equal(await run('$sdkParse[roleMention;<@&1844674407370955161>]'), '1844674407370955161');
  assert.equal(await run('$sdkParse[prefix;!;!]'), null);
  ctx.vars.set('input', '!PING $throw[entrada]');
  assert.deepEqual(await run('$sdkParse[prefix;$get[input];!]'), { command: 'ping', args: ['$throw[entrada]'] });
  assert.equal(await run('$sdkParse[guildInvite;$object[type;0]]'), true);
  assert.equal(await run('$sdkParse[groupDmInvite;$object[type;1]]'), true);
  assert.equal(await run('$sdkParse[uploadedAttachment;$object[upload_filename;abc]]'), true);
  assert.equal(await run('$sdkParse[uploadedAttachment;$array[]]'), false);
  assert.equal(await run('$sdkParse[shortcode;smile]'), '😄');
  assert.equal(await run('$sdkParse[shortcode;__proto__]'), null);
  assert.equal(await run('$sdkFormat[color;16711680]'), '#ff0000');
  assert.equal(await run('$sdkFormat[resolveColor;$array[255;0;0]]'), 16711680);
  assert.equal(await run('$sdkFormat[emoji;$sdkParse[emoji;<a:smile:123>]]'), 'a:smile:123');
  assert.equal(await run('$sdkFormat[timestamp;1000;R]'), '<t:1:R>');
  assert.equal(await run('$sdkFormat[truncate;abcdef;4]'), 'a...');
  assert.equal(await run(`$snowflake[parse;${id}]`), id);
  assert.equal(await run(`$snowflake[timestamp;${id}]`), SnowflakeUtil.timestampFromSnowflake(id));
  assert.equal(await run('$snowflake[valid;01]'), false);
  assert.equal(await run('$sdkCacheLimit[normalize;;50]'), 50);
  assert.equal(await run('$jsonGet[$sdkCacheLimit[resolve;$object[messages;false]];limits.messages]'), false);
  assert.equal(await run('$jsonGet[$sdkCacheLimit[resolve;$object[messages;0]];limits.messages]'), null);
});

test('coleções são cópias limitadas e expõem expulsão FIFO sem callbacks JS', async () => {
  const { run, ctx } = harness();
  const pairs = [['a', 1], ['b', 2]];
  ctx.vars.set('pairs', pairs);
  const input = '$get[pairs]';
  assert.equal(await run(`$sdkCollection[first;${input}]`), 1);
  assert.deepEqual(await run(`$sdkCollection[last;${input};1]`), [2]);
  assert.deepEqual(await run('$sdkCollection[random;$array[];2]'), []);
  assert.equal(await run('$sdkCollection[first;$array[]]'), null);
  assert.deepEqual(await run(`$sdkCollection[concat;${input};$array[$array[b;3];$array[c;4]]]`), [['a', 1], ['b', 3], ['c', 4]]);
  assert.deepEqual(await run(`$sdkCollection[set;${input};c;$jsonDecode[3];2]`), { entries: [['b', 2], ['c', 3]], evicted: ['a', 1] });
  assert.deepEqual(await run(`$sdkCollection[set;${input};a;$jsonDecode[7];2]`), { entries: [['a', 7], ['b', 2]], evicted: null });
  assert.deepEqual(await run(`$sdkCollection[sweep;${input};$arrayGet[$loopValue;0]==b]`), { entries: [['a', 1]], removed: 1 });
  assert.deepEqual(await run(`$sdkCollection[partition;${input};$arrayGet[$loopValue;0]==b]`), [[['b', 2]], [['a', 1]]]);
  assert.equal(await run('$loopValue'), '');
  assert.deepEqual(pairs, [['a', 1], ['b', 2]]);
  await assert.rejects(run('$sdkCollection[clone;$array[$array[a;1];$array[a;2]]]'), GuardError);
  ctx.vars.set('tooLarge', Array.from({ length: 1001 }, (_, i) => [i, null]));
  await assert.rejects(run('$sdkCollection[clone;$get[tooLarge]]'), GuardError);
});

test('sdkError redige erros do SDK sem engolir guards, limites ou falhas parciais', async () => {
  let failure: unknown = new RateLimitError({ code: APIErrorCode.RateLimited, message: 'secret', retry_after: 2, global: true },
    429, { method: 'GET', path: '/channels/?secret=value' });
  let calls = 0;
  const { run } = harness({ messageAvailable: true, resources: mockResources({
    channels: { async get(id) { return { id, name: 'dm', type: 1, guildID: null, parentID: null,
      position: 0, topic: null, slowmode: 0, nsfw: false }; } },
    messages: { async fetch() { calls++; throw failure; } },
  }) });
  const read = '$fetchMessage[200;1]';
  assert.deepEqual(await run(`$sdkError[info;${read}]`), {
    name: 'RateLimitError', code: APIErrorCode.RateLimited, statusCode: 429, isRetryable: true, method: 'GET', retryAfter: 2, global: true,
  });
  assert.equal(calls, 1);
  failure = new FluxerError('secret', { code: ErrorCodes.InvalidInvite, cause: new Error('secret') });
  assert.equal(await run(`$sdkError[text;${read}]`), 'FluxerError [INVALID_INVITE]');
  assert.equal(await run('$sdkError[isFluxer;ok]'), false);
  assert.equal(await run('$sdkError[info;ok]'), null);
  failure = new GuardError('Sem permissão', 'PERMISSION_MISSING_AUTHOR');
  await assert.rejects(run(`$sdkError[info;${read}]`), error => error === failure);
  failure = new PartialModerationError('ban', '2', new Error('disk'));
  await assert.rejects(run(`$sdkError[info;${read}]`), error => error === failure);
  const limited = harness({}, new Runtime({ ...defaultLimits, calls: 2 }));
  await assert.rejects(limited.run('$sdkError[info;$arrayLength[$array[a]]]'), /Limite de execução/);
});
