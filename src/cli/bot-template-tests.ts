import { botTemplates } from './bot-template-catalog.js';
import type { BotTemplate } from './bot-template-catalog.js';
import { featureTests } from './bot-template-feature-tests.js';

export function botTemplateTest(template: BotTemplate, language: 'js' | 'ts'): string {
  const paths: readonly string[] = botTemplates[template].paths;
  const imports = paths.map((path, index) => {
    const name = template === 'simple' ? path.slice(path.indexOf('/') + 1) : path;
    return `import command${index} from '../commands/${name}.js';`;
  }).join('\n');
  return `import test from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore, PartialModerationError } from 'yuzuha';
import { PermissionFlags } from 'yuzuha/sdk';
import { createTestBot } from 'yuzuha/testing';
${imports}

function fixture(options${language === 'ts' ? ': Parameters<typeof createTestBot>[0]' : ''} = {}) {
  return createTestBot({
    now: 1700000000000,
    commands: [${paths.map((_, index) => `command${index}`).join(', ')}],
    resources: { users: {
      async user(id) {
        return { id, username: 'Haku', displayName: 'Haku', bot: id === '999',
          avatarURL: id === '3' ? null : 'https://example.com/avatar.png',
          bannerURL: null, createdTimestamp: 1600000000000 };
      },
      async guild(id) {
        return { id, name: 'Servidor de teste', ownerID: '1', iconURL: null,
          bannerURL: null, memberCount: null, createdTimestamp: 1500000000000 };
      },
    } },
    ...options,
  });
}

test('ajuda, informações e avatar respondem sem conectar ao Fluxer', async t => {
  const f = fixture();
  t.after(() => f.destroy());
  assert.equal(await f.send('!ping'), 'success');
  assert.equal(f.messages.at(-1)?.payload.content, 'Pong! 12 ms');
  assert.equal(await f.send('!help'), 'success');
  assert.match(f.messages.at(-1)?.payload.embeds?.[0]?.description ?? '', /avatar/);
  assert.equal(await f.send('!sobre'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.title, 'Sobre o bot');
  assert.equal(await f.send('!avatar'), 'success');
  assert.equal(await f.send('!avatar <@2>'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.image?.url, 'https://example.com/avatar.png');
  assert.equal(await f.send('!avatar <@3>'), 'success');
  assert.equal(f.messages.at(-1)?.payload.content, 'Esse usuário ainda não tem um avatar.');
  assert.deepEqual(f.errors, []);
});
${paths.includes('utilities/profile') ? `
test('perfil e servidor usam embeds e recusam servidor em DM', async t => {
  const f = fixture();
  t.after(() => f.destroy());
  assert.equal(await f.send('!userinfo <@2>'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.fields?.find(field => field.name === 'ID')?.value, '2');
  assert.equal(await f.send('!perfil <@3>'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.thumbnail, undefined);
  assert.equal(await f.send('!serverinfo'), 'success');
  assert.equal(f.messages.at(-1)?.payload.embeds?.[0]?.fields?.find(field => field.name === 'Membros')?.value, 'Indisponível');
  assert.equal(await f.send('!servidor', { guildID: undefined }), 'guarded');
  assert.deepEqual(f.errors, []);
});
` : ''}${featureTests(paths)}
`;
}
