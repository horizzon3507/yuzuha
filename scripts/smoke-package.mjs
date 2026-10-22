import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const temporary = await mkdtemp(join(tmpdir(), 'yuzuha-consumer-'));
const newFunctions = ['arrayUnion', 'arrayIntersection', 'arrayDifference', 'formatBytes', 'percent', 'toBase', 'fromBase',
  'scheduleCron', 'preloadMessages', 'createEmojisBulk', 'httpMultipart', 'eventName', 'eventUserID', 'eventGuildID',
  'eventChannelID', 'eventMessageID', 'eventContent', 'eventOldContent', 'eventEmoji'];
const options = cwd => ({ cwd, env: { ...process.env, FLUXER_BOT_TOKEN: '' }, timeout: 120_000, maxBuffer: 4_000_000 });
async function run(binary, args, cwd) {
  try { return (await exec(binary, args, options(cwd))).stdout; }
  catch (error) { throw new Error(`${binary} ${args.join(' ')} falhou:\n${error.stdout ?? ''}\n${error.stderr ?? ''}`, { cause: error }); }
}
try {
  await run('npm', ['run', 'build'], root);
  const result = JSON.parse(await run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary], root));
  const info = Array.isArray(result) ? result[0] : result.yuzuha;
  assert.equal(info.version, manifest.version);
  const tarball = join(temporary, info.filename);
  assert.ok(info.files.some(file => file.path === 'dist/index.d.ts'));
  assert.ok(info.files.some(file => file.path === 'dist/functions.d.ts'));
  assert.ok(info.files.some(file => file.path === 'dist/tooling.d.ts'));
  assert.ok(info.files.some(file => file.path === 'editors/vscode/functions.json'));
  assert.ok(info.files.some(file => file.path === 'editors/vscode/extension.cjs'));
  assert.ok(info.files.some(file => file.path === 'benchmarks/compare.mjs'));
  assert.ok(!info.files.some(file => file.path.includes('node_modules') || file.path === '.env'));
  const consumer = join(temporary, 'consumer');
  await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies: { yuzuha: `file:${tarball}` } }));
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
  await run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import * as upstream from '@fluxerjs/core';
    import * as sdk from 'yuzuha/sdk';
    import * as native from 'yuzuha';
    import { script } from 'yuzuha/functions';
    import { Yuzuha, MemoryStore, arg } from 'yuzuha';
    import { MockTransport, mockMessage, mockResources, createTestBot } from 'yuzuha/testing';
    import { Runtime, registerBuiltins } from 'yuzuha/functions';
    import { CommandContext, HttpService } from 'yuzuha';
    import { complete, signatureAt, diagnose, parseFunctionCatalog } from 'yuzuha/tooling';
    assert.deepEqual(Object.keys(sdk).sort(), Object.keys(upstream).sort());
    assert.equal('Runtime' in native, false);
    assert.equal(script({ name: 'x', code: '$reply[x]' }).name, 'x');
    const runtime = registerBuiltins(new Runtime());
    const context = new CommandContext({ message: mockMessage('!extras'), command: { name: 'extras', code: '' },
      transport: new MockTransport(), store: new MemoryStore(), cooldown: () => 0,
      resources: mockResources({ messages: { async reactionUsers() { return ['2']; } } }) });
    assert.equal(await runtime.execute(runtime.compile('$arrayReduce[$range[1;4];0;$math[$loopAccumulator;+;$loopValue]]'), context), 10);
    assert.deepEqual(await runtime.execute(runtime.compile('$reactionUsers[1;👍]'), context), ['2']);
    assert.deepEqual(await runtime.execute(runtime.compile('$arrayUnion[$range[1;3];$range[3;4]]'), context), [1, 2, 3, 4]);
    assert.deepEqual(await runtime.execute(runtime.compile('$arrayIntersection[$range[1;3];$range[3;4]]'), context), [3]);
    assert.deepEqual(await runtime.execute(runtime.compile('$arrayDifference[$range[1;3];$range[3;4]]'), context), [1, 2]);
    assert.equal(await runtime.execute(runtime.compile('$formatBytes[1536]'), context), '1.5 KiB');
    assert.equal(await runtime.execute(runtime.compile('$percent[1;4;1]'), context), '25.0%');
    assert.equal(await runtime.execute(runtime.compile('$toBase[9007199254740993;16]'), context), '20000000000001');
    assert.equal(await runtime.execute(runtime.compile('$fromBase[20000000000001;16]'), context), '9007199254740993');
    assert.ok(complete('$nick', 5, runtime.functions()).some(fn => fn.name === 'nickname'));
    assert.equal(signatureAt('$nickname[2;', 12, runtime.functions()).activeParameter, 1);
    assert.equal(diagnose('$noSuchFunction', runtime.functions())[0].code, 'UNKNOWN_FUNCTION');
    assert.deepEqual(parseFunctionCatalog('{"version":1,"functions":[]}'), []);
    await context.data.transaction(tx => { tx.guild.set('one', 1); tx.user.set('two', 2); });
    assert.equal(await context.data.guild.get('one'), 1);
    assert.equal(await context.data.user.get('two'), 2);
    await context.data.userFor('2').set('ephemeral', 3, { ttlMs: 60_000 });
    assert.ok(await context.data.userFor('2').ttl('ephemeral') > 0);
    await context.data.userFor('2').expire('ephemeral', 0);
    assert.equal(await context.data.userFor('2').ttl('ephemeral'), -2);
    assert.deepEqual(await runtime.execute(runtime.compile('$dataTransaction[$array[$object[op;increment;scope;guild;name;count]]]'), context), [1]);
    const voice = await context.mod.mute('2', { reason: 'ruído', enabled: false });
    assert.equal(voice.enabled, false);
    const dataStore = new MemoryStore();
    await dataStore.update(state => {
      state.variables = { expired: 1, kept: 2 };
      state.variableExpirations = { expired: 0 };
    });
    const maintenance = new native.StateMaintenance(dataStore, () => 1000);
    assert.equal((await maintenance.stats()).expiredVariables, 1);
    const backup = await maintenance.backup();
    assert.equal(backup.format, 'yuzuha-state');
    assert.equal(backup.version, 1);
    assert.equal((await maintenance.cleanupExpired({ limit: 1 })).removed, 1);
    const preview = await maintenance.restore(backup, { policy: 'replace' });
    assert.equal(preview.dryRun, true);
    assert.equal(preview.after.variables, 2);
    assert.equal((await maintenance.stats()).variables, 1);
    await maintenance.restore(backup, { policy: 'replace', dryRun: false });
    assert.equal((await maintenance.stats()).variables, 2);
    const scheduler = new native.Scheduler(new MemoryStore(), async () => {});
    const id = await scheduler.add({ guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due: 0, maxAttempts: 2 });
    await scheduler.pause(id);
    await scheduler.tick(0);
    assert.equal((await scheduler.list())[0].paused, true);
    await scheduler.resume(id, 0);
    await scheduler.tick(0);
    assert.deepEqual(await scheduler.list(), []);
    assert.equal((await scheduler.history())[0].status, 'success');
    const cronID = await scheduler.addCron({ expression: '* * * * *', timezone: 'America/Bahia', after: 0,
      guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', missedRun: 'skip', retryJitter: 0.5 });
    const cronTask = (await scheduler.list()).find(task => task.id === cronID);
    assert.equal(cronTask.due, 60_000);
    assert.equal(cronTask.timezone, 'America/Bahia');
    assert.equal(cronTask.retryJitter, 0.5);
    assert.equal(native.nextCron('* * * * *', 'UTC', 0), 60_000);
    assert.equal(await scheduler.cancel(cronID), true);
    let fail = true;
    const failing = new native.Scheduler(new MemoryStore(), async () => { if (fail) throw new Error('offline'); });
    await failing.add({ guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', due: 0, maxAttempts: 1 });
    await failing.tick(0);
    const failure = (await failing.failed())[0];
    assert.ok(await failing.retry(failure.id, 1)); fail = false; await failing.tick(1);
    assert.equal((await failing.history()).at(-1).status, 'success');
    const http = new HttpService({ fetch: async () => new Response(new Uint8Array([0, 255])) });
    assert.deepEqual((await http.requestBytes({ method: 'GET', url: 'https://93.184.216.34/image' })).body, new Uint8Array([0, 255]));
    const streamed = await http.withPolicy({ allowedHosts: ['93.184.216.34'], maxBytes: 2 }).stream({ method: 'GET', url: 'https://93.184.216.34/image' });
    assert.ok(streamed.body instanceof ReadableStream);
    assert.deepEqual(new Uint8Array(await new Response(streamed.body).arrayBuffer()), new Uint8Array([0, 255]));
    let upload;
    const uploader = new HttpService({ fetch: async (_url, input) => { upload = input.body; return new Response('uploaded'); } });
    const uploaded = await uploader.multipart({ method: 'POST', url: 'https://93.184.216.34/upload',
      parts: [{ name: 'caption', value: 'offline' }, { name: 'file', value: new Uint8Array([0, 255]), filename: 'image.bin' }] });
    assert.equal(uploaded.body, 'uploaded');
    assert.ok(upload instanceof FormData);
    assert.equal(upload.get('caption'), 'offline');
    assert.deepEqual(new Uint8Array(await upload.get('file').arrayBuffer()), new Uint8Array([0, 255]));
    const transport = new MockTransport();
    const bot = new Yuzuha({ transport, store: new MemoryStore() });
    bot.command(script({ name: 'ping', code: '$reply[Pong!]' }));
    assert.equal(await bot.handle(mockMessage('!ping')), 'success');
    assert.equal(transport.messages[0].payload.content, 'Pong!');
    bot.command({ name: 'native', args: { amount: arg.integer().default(2) }, async run(ctx) {
      assert.equal(ctx.client, bot.client);
      const count = await ctx.data.guild.update('counter', value => Number(value) + ctx.args.get('amount'), 0);
      await ctx.reply(String(count));
    } });
    assert.equal(await bot.handle(mockMessage('!native')), 'success');
    assert.equal(transport.messages.at(-1).payload.content, '2');
    let events = 0;
    bot.on(sdk.Events.Ready, async () => { events++; });
    bot.scriptEvent({ event: 'guildMemberAdd', channelID: '200', code: 'Olá $eventUserID' });
    bot.client.emit(sdk.Events.Ready);
    const guild = new sdk.Guild(bot.client, { id: '100', name: 'Teste', ownerId: '1' });
    bot.client.emit('guildMemberAdd', new sdk.GuildMember(bot.client, {
      user: { id: '2', username: 'Ana', discriminator: '0000', global_name: null, avatar: null, avatar_color: null, flags: 0, bot: false },
      roles: [], joined_at: '2026-10-22T00:00:00.000Z', mute: false, deaf: false,
    }, guild));
    await new Promise(resolve => setImmediate(resolve));
    await bot.destroy();
    assert.equal(events, 1);
    assert.equal(transport.messages.at(-1).payload.content, 'Olá 2');

    const fixture = createTestBot({ now: 1000, commands: [native.defineCommand({
      name: 'config', aliases: ['cfg'], guildOnly: true, permissions: ['ManageGuild'],
      subcommands: [native.defineCommand({ name: 'prefixo', aliases: ['p'],
        args: { valor: arg.text().required() },
        flags: { repetir: arg.integer().alias('r').min(1).default(1) },
        examples: ['!config prefixo ? --repetir 2'],
        async run(ctx) {
          await ctx.data.guild.set('prefix', ctx.args.get('valor'), { ttlMs: 1000 });
          await ctx.reply(ctx.args.get('valor').repeat(ctx.flags.get('repetir')));
        } })],
    })] });
    try {
      assert.equal(await fixture.send('!cfg p ? -r 2'), 'success');
      assert.equal(fixture.messages.at(-1).payload.content, '??');
      assert.match(fixture.bot.help('config prefixo', '!'), /--repetir/);
      assert.equal(await fixture.send('!config prefixo'), 'guarded');
      assert.match(fixture.messages.at(-1).payload.content, /Uso: !config prefixo/);
      fixture.bot.command({ name: 'read', async run(ctx) { await ctx.reply(String(await ctx.data.guild.get('prefix', 'expired'))); } });
      await fixture.tick(1000);
      await fixture.send('!read');
      assert.equal(fixture.messages.at(-1).payload.content, 'expired');
      assert.deepEqual(fixture.errors, []);
    } finally { await fixture.destroy(); }
  `], consumer);
  const cli = join(consumer, 'node_modules/yuzuha/dist/cli.js');
  const installedManifest = JSON.parse(await readFile(join(consumer, 'node_modules/yuzuha/package.json'), 'utf8'));
  assert.equal(installedManifest.bin.yuzuha, 'dist/cli.js');
  assert.equal((await run('npm', ['exec', '--offline', '--', 'yuzuha', '--version'], consumer)).trim(), manifest.version);
  const editor = (await run(process.execPath, [cli, 'editor'], consumer)).trim();
  const metadata = JSON.parse(await readFile(join(editor, 'functions.json'), 'utf8'));
  assert.ok(metadata.some(fn => fn.name === 'searchMessages'));
  assert.equal(metadata.length, 288);
  for (const name of newFunctions) assert.ok(metadata.some(fn => fn.name === name), name);
  assert.ok(metadata.some(fn => fn.name === 'modMuteMember'));
  const catalog = JSON.parse(await run(process.execPath, [cli, 'functions', '--catalog'], consumer));
  assert.equal(catalog.version, 1);
  assert.equal(catalog.functions.length, metadata.length);
  assert.deepEqual(catalog.functions.map(fn => fn.name).sort(), metadata.map(fn => fn.name).sort());
  const lintFile = join(consumer, 'smoke.yz');
  await writeFile(lintFile, '$reply[$formatBytes[1024]]');
  const lint = JSON.parse(await run(process.execPath, [cli, 'lint', lintFile, '--json'], consumer));
  assert.equal(lint.valid, true);
  assert.equal(lint.offline, true);
  const pluginConfig = join(consumer, 'catalog.config.mjs');
  await writeFile(pluginConfig, `import { MemoryStore } from 'yuzuha';
    export default { store: new MemoryStore(), commands: './missing-commands', setup(bot) {
      bot.plugin({ name: 'package-smoke', functions: [{ name: 'packageFn', category: 'package', usage: '$packageFn[text]',
        description: 'Função de teste offline.', minArgs: 1, maxArgs: 1, execute: async c => c.text(0) }] });
    } };`);
  const pluginCatalog = JSON.parse(await run(process.execPath, [cli, 'functions', '--catalog', '--config', pluginConfig, '--plugins-only'], consumer));
  assert.deepEqual(pluginCatalog.functions.map(fn => fn.name), ['packageFn']);
  const catalogFile = join(consumer, 'plugin-catalog.json');
  await writeFile(catalogFile, JSON.stringify(pluginCatalog));
  await writeFile(lintFile, '$packageFn[ok]');
  assert.equal(JSON.parse(await run(process.execPath, [cli, 'lint', lintFile, '--catalog', catalogFile, '--json'], consumer)).valid, true);
  const scenarioFile = join(consumer, 'scenarios.json');
  await writeFile(scenarioFile, JSON.stringify({ version: 1, scenarios: [{ name: 'package offline',
    commands: [{ name: 'ping', code: '$reply[Pong]' }],
    messages: [{ content: '!ping', expect: { outcome: 'success', responses: ['Pong'], actions: [], errorCodes: [] } }],
  }] }));
  const scenarios = JSON.parse(await run(process.execPath, [cli, 'test', scenarioFile, '--json'], consumer));
  assert.equal(scenarios.valid, true);
  assert.equal(scenarios.offline, true);
  const stateFile = join(consumer, 'state.json'), backupFile = join(consumer, 'backup.json');
  await writeFile(stateFile, JSON.stringify({ schema: 2, variables: { expired: 1, kept: 2 },
    variableExpirations: { expired: 0 }, cases: {}, schedules: [] }));
  assert.equal(JSON.parse(await run(process.execPath, [cli, 'data', 'stats', stateFile, '--json'], consumer)).expiredVariables, 1);
  const backupResult = JSON.parse(await run(process.execPath, [cli, 'data', 'backup', stateFile, '--file', backupFile, '--json'], consumer));
  assert.equal(backupResult.version, 1);
  assert.equal(JSON.parse(await run(process.execPath, [cli, 'data', 'cleanup', stateFile, '--limit', '1', '--json'], consumer)).removed, 1);
  const stateBefore = await readFile(stateFile, 'utf8');
  const restore = JSON.parse(await run(process.execPath, [cli, 'data', 'restore', stateFile, '--file', backupFile, '--json'], consumer));
  assert.equal(restore.dryRun, true);
  assert.equal(restore.after.variables, 2);
  assert.equal(await readFile(stateFile, 'utf8'), stateBefore);
  console.log('PASS: catálogo, lint, plugins, cenários e manutenção offline no pacote instalado.');
  const portable = join(temporary, 'portable-bot');
  await run(process.execPath, [cli, 'init', portable, '--js'], consumer);
  const portableManifest = JSON.parse(await readFile(join(portable, 'package.json'), 'utf8'));
  assert.equal(portableManifest.dependencies.yuzuha, `^${manifest.version}`);
  assert.ok(!JSON.stringify(portableManifest).includes(temporary));
  for (const language of ['js', 'ts']) {
    const directory = join(temporary, `bot-${language}`);
    await run(process.execPath, [cli, 'init', directory, `--${language}`, '--local'], consumer);
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
    await run('npm', ['test'], directory);
    const check = await run('npm', ['run', 'check'], directory);
    assert.match(check, /3 comandos válidos/);
    const diagnostic = JSON.parse(await run(process.execPath, [cli, 'doctor', '--json'], directory));
    assert.equal(diagnostic.ok, true);
    assert.equal(diagnostic.offline, true);
    assert.ok(diagnostic.checks.some(item => item.name === 'sdk' && item.status === 'pass'));
    if (language === 'ts') {
      const compiler = join(directory, 'node_modules/typescript/bin/tsc');
      await run(process.execPath, [compiler, '--noEmit'], directory);
      await writeFile(join(directory, 'extra-types.ts'), `
        import { arg, defineCommand, EventContext, HttpService, StateMaintenance } from 'yuzuha';
        import { createTestBot, TestClock } from 'yuzuha/testing';
        import type { DataTransaction, MessageSearchPage, MemberSearchPage, ThreadSearchPage, NativeMoveOptions, CaseRecord, UserProfileInfo, ThreadListPage, ScheduleExecutionRecord,
          ScriptEventDefinition, CronScheduleInput, HttpPolicy, HttpMultipartPart, StateBackup, EmojiCreateInput, EmojiBulkResult } from 'yuzuha';
        import { complete, signatureAt, diagnose, documentDiagnostics, parseFunctionCatalog } from 'yuzuha/tooling';
        const typed = defineCommand({ name: 'typed-flags', args: { member: arg.user().required() },
          flags: { count: arg.integer().alias('c').default(1), mode: arg.text().choices(['fast', 'slow']).required() },
          async run(ctx) {
            const member: string = ctx.args.get('member');
            const count: number = ctx.flags.get('count');
            const mode: 'fast' | 'slow' = ctx.flags.get('mode');
            // @ts-expect-error Unknown flags are rejected by the schema.
            ctx.flags.get('missing');
            // @ts-expect-error Numbers remain numbers.
            const wrong: string = ctx.flags.get('count');
            void [member, count, mode, wrong];
          } });
        const fixture = createTestBot({ now: 1000, commands: [typed] });
        const clock: TestClock = fixture.clock;
        void [clock, fixture.destroy()];
        export default defineCommand({ name: 'extra-types', async run(ctx) {
          const count: number = await ctx.data.transaction((tx: DataTransaction) => {
            const result = tx.guild.update('a', value => Number(value) + 1, 0);
            tx.user.set('b', result); return result;
          });
          const members: MemberSearchPage = await ctx.members.search('Ana');
          const search: MessageSearchPage = await ctx.resources.messages.search({ content: 'teste', guildID: ctx.guildID });
          const threads: ThreadSearchPage = await ctx.resources.threads.search('200', { limit: 10 });
          await ctx.resources.messages.sendBytes('200', [{ name: 'a.bin', data: new Uint8Array([0, 255]) }]);
          complete('$rep', 4, []); signatureAt('$reply[', 7, []);
          diagnose('$reply', []); documentDiagnostics('const x = "$reply"', 'typescript', []);
          parseFunctionCatalog('{"version":1,"functions":[]}');
          await ctx.data.userFor('2').set('ttl', 1, { ttlMs: 1000 });
          const options = { channelID: null, reason: 'desconectar' } satisfies NativeMoveOptions;
          const moved: CaseRecord = await ctx.mod.move('2', options);
          const profile: UserProfileInfo = await ctx.resources.users.profile('2');
          const archived: ThreadListPage = await ctx.resources.threads.archived('200');
          const history: ScheduleExecutionRecord[] = await ctx.scheduler.history();
          const event: ScriptEventDefinition = { event: 'guildMemberAdd', code: '$eventUserID', channelID: '200' };
          const cron: CronScheduleInput = { expression: '0 9 * * 1-5', timezone: 'America/Bahia', guildID: '100', channelID: '200', authorID: '1', command: 'ping', input: '', retryJitter: 0.2 };
          const policy: HttpPolicy = { allowedHosts: ['example.com'], maxRequestBytes: 1000 };
          const part: HttpMultipartPart = { name: 'file', value: new Uint8Array([0, 255]), filename: 'file.bin' };
          const http = new HttpService().withPolicy(policy);
          const response = await http.stream({ method: 'GET', url: 'https://example.com' });
          await response.body.cancel();
          await http.multipart({ method: 'POST', url: 'https://example.com', parts: [part] });
          const maintenance = new StateMaintenance(ctx.store);
          const backup: StateBackup = await maintenance.backup();
          const emoji: EmojiCreateInput = { name: 'teste', image: 'AA==' };
          const bulk: EmojiBulkResult = await ctx.resources.expressions.createEmojisBulk(ctx.guildID, [emoji]);
          const preloaded = await ctx.resources.messages.preload(['200']);
          void [count, members, search, threads, moved, profile, archived, history, event, cron, backup, bulk, preloaded, EventContext];
        } });
      `);
      await run(process.execPath, [compiler, '--noEmit', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2023', '--skipLibCheck', 'extra-types.ts'], directory);
    }
    await run(process.execPath, ['--input-type=module', '-e', `
      import assert from 'node:assert/strict';
      import { Yuzuha, MemoryStore } from 'yuzuha';
      import { MockTransport, mockMessage } from 'yuzuha/testing';
      const transport = new MockTransport();
      const bot = new Yuzuha({ transport, store: new MemoryStore() });
      await bot.load('./commands');
      assert.equal(await bot.handle(mockMessage('!ban <@2> spam')), 'success');
      assert.equal(transport.messages[0].payload.content, 'Membro banido. Caso #1.');
      assert.equal(await bot.handle(mockMessage('!hello')), 'success');
      assert.equal(transport.messages.at(-1).payload.content, 'Olá, mundo!');
      await bot.destroy();
    `], directory);
    console.log(`PASS: scaffold ${language.toUpperCase()}, instalação, check e execução offline.`);
  }
  const functionsDirectory = join(temporary, 'bot-functions');
  await run(process.execPath, [cli, 'init', functionsDirectory, '--ts', '--functions', '--local'], consumer);
  await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], functionsDirectory);
  await run('npm', ['test'], functionsDirectory);
  const functionsCheck = await run('npm', ['run', 'check'], functionsDirectory);
  assert.match(functionsCheck, /4 comandos válidos/);
  await run(process.execPath, [join(functionsDirectory, 'node_modules/typescript/bin/tsc'), '--noEmit'], functionsDirectory);
  await run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { Yuzuha, MemoryStore } from 'yuzuha';
    import { MockTransport, mockMessage } from 'yuzuha/testing';
    const transport = new MockTransport();
    const bot = new Yuzuha({ transport, store: new MemoryStore() });
    await bot.load('./commands');
    assert.equal(await bot.handle(mockMessage('!eco oi')), 'success');
    assert.equal(transport.messages.at(-1).payload.content, 'oi');
    await bot.destroy();
  `], functionsDirectory);
  console.log('PASS: scaffold --functions, typecheck e execução em function mode.');
  console.log(`PASS: tarball instalável e paridade integral dos exports da raiz de @fluxerjs/core.`);
} finally { await rm(temporary, { recursive: true, force: true }); }
