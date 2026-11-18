import test from 'node:test';
import assert from 'node:assert/strict';
import { Events, PermissionFlags } from '@fluxerjs/core';
import {
  GuardError,
  MemoryStore,
  PartialModerationError,
  arg,
  createTranslator,
  defineCommand,
  isGuardReason,
  userError,
} from '../src/index.js';
import type { GuardReason, MessageOverrides, Store } from '../src/index.js';
import { functions, script } from '../src/functions.js';
import { AuthorizationService, requireActor, requireGuild } from '../src/services/authorization.js';
import { ModerationService } from '../src/services/moderation.js';
import { MockTransport, createTestBot } from '../src/testing.js';

const ENGLISH_GUARD_MESSAGES: MessageOverrides = {
  notInGuild: () => 'This command only works in servers.',
  noAuthor: () => 'This operation requires an identified author.',
  permissionMissingAuthor: perm => `You need the ${perm} permission.`,
  permissionMissingBot: perm => `I need the ${perm} permission.`,
  guildDepartureOwnerOnly: () => 'Only the server owner can remove the bot with this command.',
  guildDepartureBotIsOwner: () => 'The bot cannot leave a server it owns.',
  cooldown: remaining => `Wait ${remaining} before using this again.`,
  checkFailed: () => 'You cannot run this command.',
  unknownSubcommand: () => 'Unknown subcommand.',
  usageSubcommand: () => '<subcommand>',
  usageLine: usage => `Usage: ${usage}`,
  helpSubcommandsHeader: () => 'Subcommands:',
  eventChannelRequired: () => 'Configure an output channel for this event.',
  argUser: () => 'Mention a user or provide a valid ID.',
  moderationSelfTarget: () => 'You cannot moderate yourself.',
  moderationBotTarget: () => 'You cannot moderate this bot.',
  moderationOwnerTarget: () => 'Cannot moderate the server owner.',
  moderationHierarchy: () => 'Cannot moderate this member due to role hierarchy.',
  moderationAdminImmune: () => 'Cannot timeout an administrator.',
  moderationReasonRequired: () => 'Provide a moderation reason.',
  moderationReasonTooLong: () => 'Reason must be at most 512 characters.',
  moderationTimeoutDuration: () => 'Provide a timeout duration up to 28 days.',
  moderationDurationInvalid: () => 'Provide a valid positive integer duration in ms.',
  moderationDeleteDaysInvalid: () => 'Message history deletion must be 0 to 7 days.',
  moderationVoiceChannelInvalid: () => 'Provide a voice channel ID or null to disconnect.',
  moderationVoiceStateInvalid: () => 'Provide true or false for the voice state.',
  moderationPartial: (action, targetID) => `Action ${action} on ${targetID} succeeded, but saving the case failed. Do not repeat it.`,
  userErrorAfterCase: caseID => `Action completed and saved in case #${caseID}, but the command did not finish.`,
  userErrorGeneric: () => 'Could not complete the command.',
};

test('todos os motivos de GuardError respeitam PT-BR byte a byte por padrão e traduzem pelo catálogo configurado', async () => {
  const en = createTranslator(ENGLISH_GUARD_MESSAGES);

  // NOT_IN_GUILD & NO_AUTHOR diretos
  assert.throws(
    () => requireGuild(''),
    err => isGuardReason(err, 'NOT_IN_GUILD') && err.message === 'Este comando só funciona em servidores.',
  );
  assert.throws(
    () => requireGuild('', en),
    err => isGuardReason(err, 'NOT_IN_GUILD') && err.message === 'This command only works in servers.',
  );
  assert.throws(
    () => requireActor(''),
    err => isGuardReason(err, 'NO_AUTHOR') && err.message === 'Esta operação exige um autor identificado.',
  );
  assert.throws(
    () => requireActor('', en),
    err => isGuardReason(err, 'NO_AUTHOR') && err.message === 'This operation requires an identified author.',
  );

  // Guild departure (owner-only & bot-is-owner)
  const depTransport = new MockTransport();
  depTransport.setMember('100', { id: '2', owner: false, permissions: PermissionFlags.Administrator, rank: 80 });
  const nonOwnerAuth = new AuthorizationService(depTransport, { guildID: '100', authorID: '2' }, undefined, en);
  await assert.rejects(
    nonOwnerAuth.requireGuildDeparture(),
    err => isGuardReason(err, 'PERMISSION_MISSING_AUTHOR')
      && err.message === 'Only the server owner can remove the bot with this command.',
  );

  depTransport.setMember('100', { id: depTransport.botID, owner: true, permissions: PermissionFlags.Administrator, rank: 100 });
  const botOwnerAuth = new AuthorizationService(depTransport, { guildID: '100', authorID: '1' }, undefined, en);
  await assert.rejects(
    botOwnerAuth.requireGuildDeparture(),
    err => isGuardReason(err, 'PERMISSION_MISSING_BOT')
      && err.message === 'The bot cannot leave a server it owns.',
  );

  // Fluxo completo no bot (PT-BR vs EN) para todos os GuardReasons
  const buildCommands = () => [
    defineCommand({
      name: 'guildonly',
      guildOnly: true,
      async run(ctx) { await ctx.reply('ok'); },
    }),
    defineCommand({
      name: 'noauthor',
      async run(ctx) { await ctx.data.user.get('k'); },
    }),
    defineCommand({
      name: 'needauthor',
      permissions: ['ManageGuild'],
      async run(ctx) { await ctx.reply('ok'); },
    }),
    defineCommand({
      name: 'needbot',
      botPermissions: ['ManageChannels'],
      async run(ctx) { await ctx.reply('ok'); },
    }),
    defineCommand({
      name: 'cool',
      cooldown: '5s',
      async run(ctx) { await ctx.reply('ok'); },
    }),
    defineCommand({
      name: 'manualcool',
      async run(ctx) {
        await ctx.cooldown('4s');
        await ctx.reply('ok');
      },
    }),
    defineCommand({
      name: 'customcool',
      async run(ctx) {
        await ctx.cooldown('3s', 'Custom {remaining}!');
        await ctx.reply('ok');
      },
    }),
    defineCommand({
      name: 'blocked',
      checks: [() => false],
      async run(ctx) { await ctx.reply('ok'); },
    }),
    defineCommand({
      name: 'group',
      subcommands: [defineCommand({ name: 'sub', async run(ctx) { await ctx.reply('ok'); } })],
    }),
  ];

  const ptBot = createTestBot({ commands: buildCommands() });
  const enBot = createTestBot({
    locale: 'en',
    messages: ENGLISH_GUARD_MESSAGES,
    commands: buildCommands(),
  });

  // Usuário 2 sem permissões
  ptBot.transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 10 });
  enBot.transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 10 });

  try {
    const observedReasons: GuardReason[] = [];
    const enDeniedBot = createTestBot({
      locale: 'en',
      messages: ENGLISH_GUARD_MESSAGES,
      hooks: {
        onDenied(err) {
          observedReasons.push(err.reason);
          return undefined;
        },
        onCooldown(_ms, _ctx, err) {
          observedReasons.push(err.reason);
          return undefined;
        },
      },
      commands: buildCommands(),
    });
    enDeniedBot.transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 10 });

    // NOT_IN_GUILD
    await ptBot.send('!guildonly', { guildID: undefined });
    assert.equal(ptBot.messages.at(-1)?.payload.content, 'Este comando só funciona em servidores.');
    await enDeniedBot.send('!guildonly', { guildID: undefined });
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'This command only works in servers.');

    // NO_AUTHOR
    await ptBot.send('!noauthor', { authorID: '' });
    assert.equal(ptBot.messages.at(-1)?.payload.content, 'Esta operação exige um autor identificado.');
    await enDeniedBot.send('!noauthor', { authorID: '' });
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'This operation requires an identified author.');

    // PERMISSION_MISSING_AUTHOR
    await ptBot.send('!needauthor', { authorID: '2' });
    assert.equal(ptBot.messages.at(-1)?.payload.content, 'Você precisa da permissão ManageGuild.');
    await enDeniedBot.send('!needauthor', { authorID: '2' });
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'You need the ManageGuild permission.');

    // PERMISSION_MISSING_BOT
    ptBot.transport.setMember('100', { id: ptBot.transport.botID, owner: false, permissions: 0n, rank: 90 });
    enDeniedBot.transport.setMember('100', { id: enDeniedBot.transport.botID, owner: false, permissions: 0n, rank: 90 });
    await ptBot.send('!needbot');
    assert.equal(ptBot.messages.at(-1)?.payload.content, 'Preciso da permissão ManageChannels.');
    await enDeniedBot.send('!needbot');
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'I need the ManageChannels permission.');

    // COOLDOWN declarativo e imperativo
    await ptBot.send('!cool');
    await ptBot.send('!cool');
    assert.equal(ptBot.messages.at(-1)?.payload.content, 'Aguarde 5s antes de usar novamente.');

    await enDeniedBot.send('!cool');
    await enDeniedBot.send('!cool');
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'Wait 5s before using this again.');

    await enDeniedBot.send('!manualcool');
    await enDeniedBot.send('!manualcool');
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'Wait 4s before using this again.');

    await enDeniedBot.send('!customcool');
    await enDeniedBot.send('!customcool');
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'Custom 3s!');

    // CHECK_FAILED
    await ptBot.send('!blocked');
    assert.equal(ptBot.messages.at(-1)?.payload.content, 'Você não pode executar este comando.');
    await enDeniedBot.send('!blocked');
    assert.equal(enDeniedBot.messages.at(-1)?.payload.content, 'You cannot run this command.');

    // Subcomando desconhecido
    await ptBot.send('!group invalido');
    assert.match(ptBot.messages.at(-1)!.payload.content!, /^Subcomando desconhecido\.\nUso: !group <subcomando>/);
    await enDeniedBot.send('!group invalido');
    assert.match(enDeniedBot.messages.at(-1)!.payload.content!, /^Unknown subcommand\.\nUsage: !group <subcommand>/);

    assert.deepEqual(observedReasons, [
      'NOT_IN_GUILD',
      'NO_AUTHOR',
      'PERMISSION_MISSING_AUTHOR',
      'PERMISSION_MISSING_BOT',
      'COOLDOWN',
      'COOLDOWN',
      'COOLDOWN',
      'CHECK_FAILED',
      'INVALID_ARGUMENT',
    ]);

    await enDeniedBot.destroy();
  } finally {
    await ptBot.destroy();
    await enBot.destroy();
  }
});

test('moderação cobre autor, bot, hierarquia, alvos protegidos, validações de entrada e falha parcial sem repetir ação', async () => {
  const en = createTranslator(ENGLISH_GUARD_MESSAGES);

  const setupTransport = () => {
    const transport = new MockTransport();
    // 1: owner (rank 100), 2: mod (rank 50), 3: peer/higher (rank 60), 4: low target (rank 10), 5: admin non-owner (rank 20), 999: bot (rank 80)
    transport.setMember('100', { id: '1', owner: true, permissions: PermissionFlags.Administrator, rank: 100 });
    transport.setMember('100', { id: '2', owner: false, permissions: PermissionFlags.BanMembers | PermissionFlags.ModerateMembers | PermissionFlags.MoveMembers | PermissionFlags.MuteMembers | PermissionFlags.DeafenMembers, rank: 50 });
    transport.setMember('100', { id: '3', owner: false, permissions: 0n, rank: 60 });
    transport.setMember('100', { id: '4', owner: false, permissions: 0n, rank: 10 });
    transport.setMember('100', { id: '5', owner: false, permissions: PermissionFlags.Administrator, rank: 20 });
    transport.setMember('100', { id: transport.botID, owner: false, permissions: PermissionFlags.Administrator, rank: 80 });
    return transport;
  };

  // 1. Autor sem permissão (PERMISSION_MISSING_AUTHOR)
  {
    const transport = setupTransport();
    transport.setMember('100', { id: '2', owner: false, permissions: 0n, rank: 50 });
    const ptMod = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' });
    const enMod = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' }, undefined, en);
    await assert.rejects(
      ptMod.execute('ban', '4', 'spam'),
      err => isGuardReason(err, 'PERMISSION_MISSING_AUTHOR') && err.message === 'Você precisa da permissão BanMembers.',
    );
    await assert.rejects(
      enMod.execute('ban', '4', 'spam'),
      err => isGuardReason(err, 'PERMISSION_MISSING_AUTHOR') && err.message === 'You need the BanMembers permission.',
    );
    assert.equal(transport.calls.moderate, 0);
  }

  // 2. Bot sem permissão (PERMISSION_MISSING_BOT)
  {
    const transport = setupTransport();
    transport.setMember('100', { id: transport.botID, owner: false, permissions: 0n, rank: 80 });
    const ptMod = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' });
    const enMod = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' }, undefined, en);
    await assert.rejects(
      ptMod.execute('ban', '4', 'spam'),
      err => isGuardReason(err, 'PERMISSION_MISSING_BOT') && err.message === 'Preciso da permissão BanMembers.',
    );
    await assert.rejects(
      enMod.execute('ban', '4', 'spam'),
      err => isGuardReason(err, 'PERMISSION_MISSING_BOT') && err.message === 'I need the BanMembers permission.',
    );
    assert.equal(transport.calls.moderate, 0);
  }

  // 3. SELF_TARGET, BOT_TARGET, OWNER_TARGET, HIERARCHY (autor e bot), ADMIN_IMMUNE
  {
    const transport = setupTransport();
    const ptMod = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' });
    const enMod = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' }, undefined, en);

    // SELF_TARGET
    await assert.rejects(
      enMod.execute('ban', '2', 'motivo'),
      err => isGuardReason(err, 'SELF_TARGET') && err.message === 'You cannot moderate yourself.',
    );
    // BOT_TARGET
    await assert.rejects(
      enMod.execute('ban', transport.botID, 'motivo'),
      err => isGuardReason(err, 'BOT_TARGET') && err.message === 'You cannot moderate this bot.',
    );
    // OWNER_TARGET (PT-BR compartilha texto padrão; EN usa chave própria moderationOwnerTarget)
    await assert.rejects(
      ptMod.execute('ban', '1', 'motivo'),
      err => isGuardReason(err, 'OWNER_TARGET')
        && err.message === 'Não é possível moderar esse membro. Confira a hierarquia de cargos.',
    );
    await assert.rejects(
      enMod.execute('ban', '1', 'motivo'),
      err => isGuardReason(err, 'OWNER_TARGET') && err.message === 'Cannot moderate the server owner.',
    );
    // HIERARCHY por autor (alvo rank 60 >= autor rank 50)
    await assert.rejects(
      ptMod.execute('ban', '3', 'motivo'),
      err => isGuardReason(err, 'HIERARCHY')
        && err.message === 'Não é possível moderar esse membro. Confira a hierarquia de cargos.',
    );
    await assert.rejects(
      enMod.execute('ban', '3', 'motivo'),
      err => isGuardReason(err, 'HIERARCHY') && err.message === 'Cannot moderate this member due to role hierarchy.',
    );
    // HIERARCHY por bot (autor é owner rank 100, mas bot rank 5 <= alvo rank 10)
    transport.setMember('100', { id: transport.botID, owner: false, permissions: PermissionFlags.Administrator, rank: 5 });
    const ownerModEn = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '1' }, undefined, en);
    await assert.rejects(
      ownerModEn.execute('ban', '4', 'motivo'),
      err => isGuardReason(err, 'HIERARCHY') && err.message === 'Cannot moderate this member due to role hierarchy.',
    );
    transport.setMember('100', { id: transport.botID, owner: false, permissions: PermissionFlags.Administrator, rank: 80 });

    // ADMIN_IMMUNE em timeout
    await assert.rejects(
      ptMod.execute('timeout', '5', 'motivo', { duration: 60_000 }),
      err => isGuardReason(err, 'ADMIN_IMMUNE') && err.message === 'Não é possível silenciar um administrador.',
    );
    await assert.rejects(
      enMod.execute('timeout', '5', 'motivo', { duration: 60_000 }),
      err => isGuardReason(err, 'ADMIN_IMMUNE') && err.message === 'Cannot timeout an administrator.',
    );
  }

  // 4. Validações de entrada de moderação em inglês
  {
    const transport = setupTransport();
    const enMod = new ModerationService(transport, new MemoryStore(), { guildID: '100', authorID: '2' }, undefined, en);

    await assert.rejects(enMod.execute('ban', 'nao-id', 'ok'), { message: 'Mention a user or provide a valid ID.' });
    await assert.rejects(enMod.execute('ban', '4', '   '), { message: 'Provide a moderation reason.' });
    await assert.rejects(enMod.execute('ban', '4', 'x'.repeat(513)), { message: 'Reason must be at most 512 characters.' });
    await assert.rejects(enMod.execute('timeout', '4', 'ok', { duration: 0 }), {
      message: 'Provide a timeout duration up to 28 days.',
    });
    await assert.rejects(enMod.execute('ban', '4', 'ok', { duration: -5 }), {
      message: 'Provide a valid positive integer duration in ms.',
    });
    await assert.rejects(enMod.execute('ban', '4', 'ok', { deleteMessageDays: 9 }), {
      message: 'Message history deletion must be 0 to 7 days.',
    });
    await assert.rejects(enMod.execute('move', '4', 'ok', { channelID: 'abc' }), {
      message: 'Provide a voice channel ID or null to disconnect.',
    });
    await assert.rejects(enMod.execute('mute', '4', 'ok', { enabled: 'sim' as never }), {
      message: 'Provide true or false for the voice state.',
    });
    assert.equal(transport.calls.moderate, 0);
  }

  // 5. Falha parcial (PartialModerationError): não repete moderação, não é engolida por $try e traduz mensagem
  {
    const baseStore = new MemoryStore();
    const failingStore: Store = {
      read: reader => baseStore.read(reader),
      async update() {
        throw new Error('falha de disco ao salvar caso');
      },
    };
    const fixture = createTestBot({
      store: failingStore,
      engine: functions(),
      locale: 'en',
      messages: ENGLISH_GUARD_MESSAGES,
      commands: [
        defineCommand({
          name: 'ban',
          args: { target: arg.user().required() },
          async run(ctx) {
            await ctx.mod.ban(ctx.args.get('target'), { reason: 'spam' });
          },
        }),
        script({
          name: 'tryban',
          code: '$try[$modBan[$mentioned[1];spam];engolido]',
        }),
      ],
    });

    try {
      assert.equal(await fixture.send('!ban <@2>'), 'error');
      assert.equal(fixture.transport.calls.moderate, 1);
      assert.equal(
        fixture.messages.at(-1)?.payload.content,
        'Action ban on 2 succeeded, but saving the case failed. Do not repeat it.',
      );
      assert.equal(fixture.errors.length, 1);
      assert.ok(fixture.errors[0] instanceof PartialModerationError);
      assert.equal(
        (fixture.errors[0] as PartialModerationError).message,
        'Action ban on 2 succeeded, but saving the case failed. Do not repeat it.',
      );

      // Em function mode, $try NÃO pode engolir PartialModerationError
      fixture.errors.length = 0;
      assert.equal(await fixture.send('!tryban <@2>'), 'error');
      assert.equal(fixture.transport.calls.moderate, 2);
      assert.equal(
        fixture.messages.at(-1)?.payload.content,
        'Action ban on 2 succeeded, but saving the case failed. Do not repeat it.',
      );
      assert.equal(fixture.errors.length, 1);
      assert.ok(fixture.errors[0] instanceof PartialModerationError);
    } finally {
      await fixture.destroy();
    }
  }
});

test('userError e saída de scriptEvent sem canal usam o catálogo e locale ativos', async () => {
  const fixture = createTestBot({
    engine: functions(),
    messages: {
      defaultLocale: 'en',
      locales: {
        en: ENGLISH_GUARD_MESSAGES,
      },
    },
    commands: [
      defineCommand({
        name: 'boom',
        run() {
          throw new Error('unexpected internal failure');
        },
      }),
      defineCommand({
        name: 'banboom',
        async run(ctx) {
          await ctx.mod.ban('2', { reason: 'spam' });
          throw new Error('post-case crash');
        },
      }),
      defineCommand({
        name: 'rawpartial',
        run(ctx) {
          // Instância direta sem 4º argumento ainda é traduzida por userError(err, ctx)
          const direct = new PartialModerationError('kick', '2', new Error('io'));
          assert.equal(
            userError(direct, ctx),
            'Action kick on 2 succeeded, but saving the case failed. Do not repeat it.',
          );
          // 4º argumento explícito é preservado
          const explicit = new PartialModerationError('kick', '2', new Error('io'), 'Explicit partial text.');
          assert.equal(userError(explicit, ctx), 'Explicit partial text.');
          throw direct;
        },
      }),
    ],
  });

  fixture.bot.scriptEvent({
    event: 'guildMemberAdd',
    code: 'Welcome!',
  });

  try {
    // userErrorGeneric padrão PT-BR sem contexto vs traduzido no bot
    assert.equal(userError(new Error('x')), 'Não foi possível concluir o comando.');

    assert.equal(await fixture.send('!boom'), 'error');
    assert.equal(fixture.messages.at(-1)?.payload.content, 'Could not complete the command.');

    // userErrorAfterCase após caso registrado
    assert.equal(await fixture.send('!banboom'), 'error');
    assert.equal(
      fixture.messages.at(-1)?.payload.content,
      'Action completed and saved in case #1, but the command did not finish.',
    );

    // PartialModerationError direto traduzido em userError / resposta do bot
    assert.equal(await fixture.send('!rawpartial'), 'error');
    assert.equal(
      fixture.messages.at(-1)?.payload.content,
      'Action kick on 2 succeeded, but saving the case failed. Do not repeat it.',
    );

    // scriptEvent com saída mas sem canal configurado lança GuardError traduzido
    fixture.errors.length = 0;
    fixture.bot.client.emit(Events.GuildMemberAdd, {
      id: '2',
      guild: { id: '100' },
      user: { id: '2', username: 'Ana', bot: false },
    } as never);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(fixture.errors.length, 1);
    assert.ok(fixture.errors[0] instanceof GuardError);
    assert.equal((fixture.errors[0] as GuardError).message, 'Configure an output channel for this event.');
  } finally {
    await fixture.destroy();
  }
});
