import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { lint } from '../src/cli/lint.js';
import { parseScenarios, runScenarios } from '../src/cli/scenarios.js';
import { parseArguments } from '../src/cli/arguments.js';
import { JsonStore } from '../src/infrastructure/storage/json.js';
import { SQLiteStore } from '../src/infrastructure/storage/sqlite.js';
import { dataCommand } from '../src/cli/data.js';
import type { Store } from '../src/ports/store.js';

const exec = promisify(execFile), cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const invoke = (args: string[]) => exec(process.execPath, ['--import', 'tsx', cli, ...args], { timeout: 20_000, maxBuffer: 4_000_000 });
async function fixture(t: { after(callback: () => Promise<unknown>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-cli-tooling-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('lint analisa scripts/strings JS/TS sem importar alvos e usa catálogo de plugins', async t => {
  const directory = await fixture(t);
  const marker = join(directory, 'executed');
  await writeFile(join(directory, 'commands.ts'), `import { writeFileSync } from 'node:fs'; writeFileSync(${JSON.stringify(marker)}, 'BAD'); export default {code: '$pluginFn[x]'};`);
  await writeFile(join(directory, 'plain.yz'), '$reply[ok]');
  const catalog = join(directory, 'catalog.json');
  await writeFile(catalog, JSON.stringify({ version: 1, functions: [{ name: 'pluginFn', category: 'plugin', usage: '$pluginFn[x]', description: 'Fixture', minArgs: 1, maxArgs: 1 }] }));
  const unknown = await lint(directory);
  assert.equal(unknown.valid, false);
  assert.equal(unknown.files, 2);
  assert.equal(unknown.diagnostics[0]!.code, 'UNKNOWN_FUNCTION');
  const valid = await lint(directory, [catalog]);
  assert.equal(valid.valid, true);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
  await writeFile(join(directory, 'bad.yuzuha'), '$reply[');
  const invalid = await lint(directory, [catalog]);
  assert.ok(invalid.diagnostics.some(value => value.code === 'SYNTAX' && value.range.start.line === 1));
  await assert.rejects(invoke(['lint', directory, '--catalog', catalog, '--json']), (error: unknown) => {
    const report = JSON.parse((error as { stdout: string }).stdout);
    assert.equal(report.valid, false); assert.equal(report.offline, true); return true;
  });
  await mkdir(join(directory, 'node_modules'));
  await writeFile(join(directory, 'node_modules', 'bad.yz'), '$unknown');
  assert.equal((await lint(directory, [catalog])).files, 3);
});

test('catálogo exportado inclui plugins de config explícita sem carregar diretório de comandos', async t => {
  const directory = await fixture(t), config = join(directory, 'config.mjs');
  const library = pathToFileURL(fileURLToPath(new URL('../src/index.ts', import.meta.url))).href;
  await writeFile(config, `import { MemoryStore } from ${JSON.stringify(library)}; export default {store:new MemoryStore(),commands:'missing',setup(bot){bot.plugin({name:'plugin',functions:[{name:'pluginFn',category:'plugin',usage:'$pluginFn[x]',description:'Fixture',minArgs:1,maxArgs:1,execute:()=>''}]});}};`);
  const report = JSON.parse((await invoke(['functions', '--catalog', '--config', config])).stdout);
  assert.equal(report.version, 1);
  assert.ok(report.functions.some((fn: { name: string }) => fn.name === 'reply'));
  assert.ok(report.functions.some((fn: { name: string }) => fn.name === 'pluginFn'));
  assert.ok(report.functions.every((fn: Record<string, unknown>) => !Object.hasOwn(fn, 'execute')));
  const plugins = JSON.parse((await invoke(['functions', '--catalog', '--config', config, '--plugins-only'])).stdout);
  assert.deepEqual(plugins.functions.map((fn: { name: string }) => fn.name), ['pluginFn']);
  const searched = JSON.parse((await invoke(['functions', '--catalog', '--config', config, '--plugins-only', '--category', 'plugin', '--search', 'FIXTURE'])).stdout);
  assert.deepEqual(searched, plugins);
  const excluded = JSON.parse((await invoke(['functions', '--catalog', '--config', config, '--plugins-only', '--search', 'reply'])).stdout);
  assert.deepEqual(excluded, { version: 1, functions: [] });
  const pluginCatalog = join(directory, 'plugin-catalog.json');
  await writeFile(pluginCatalog, JSON.stringify(plugins));
  const script = join(directory, 'check.yz');
  await writeFile(script, '$pluginFn[ok]');
  assert.equal((await lint(script, [pluginCatalog])).valid, true);
});

test('runner offline compara respostas, permissões, erros e ações sem permitir rede', async t => {
  const directory = await fixture(t), path = join(directory, 'scenarios.json');
  const suite = { version: 1, scenarios: [
    { name: 'answers', commands: [{ name: 'ping', code: '$reply[Pong]' }, { name: 'count', code: '$incrementVar[n]' }],
      messages: [{ content: '!ping', expect: { outcome: 'success', responses: ['Pong'], actions: [], errorCodes: [] } },
        { content: '!count', expect: { outcome: 'success', responses: ['1'] } }, { content: '!count', expect: { outcome: 'success', responses: ['2'] } },
        { content: 'nothing', expect: { outcome: 'ignored', responses: [] } }] },
    { name: 'denied', members: [{ guildID: '100', id: '1', owner: false, permissions: [], rank: 10 }],
      commands: [{ name: 'ban', code: '$ban[2;test]' }], messages: [{ content: '!ban', expect: { outcome: 'guarded', actions: [], errorCodes: [] } }] },
    { name: 'moderation', commands: [{ name: 'ban', code: '$ban[2;test]' }],
      messages: [{ content: '!ban', expect: { outcome: 'success', responses: [], actions: [{ action: 'ban', targetID: '2' }] } }] },
    { name: 'network denied', commands: [{ name: 'http', code: '$http[GET;https://example.com]' }],
      messages: [{ content: '!http', expect: { outcome: 'error', errorCodes: ['FUNCTION_ERROR'], actions: [] } }] },
  ] };
  await writeFile(path, JSON.stringify(suite));
  const report = await runScenarios(path);
  assert.equal(report.valid, true, JSON.stringify(report, null, 2));
  assert.equal(report.offline, true);
  assert.equal(JSON.parse((await invoke(['test', path, '--json'])).stdout).valid, true);
  suite.scenarios[0]!.messages[0]!.expect.outcome = 'error';
  await writeFile(path, JSON.stringify(suite));
  await assert.rejects(invoke(['test', path, '--json']), (error: unknown) => {
    const actual = JSON.parse((error as { stdout: string }).stdout);
    assert.equal(actual.valid, false); assert.deepEqual(actual.scenarios[0].messages[0].mismatches, ['outcome']); return true;
  });
});

test('runner rejeita código JS e schemas/limites desconhecidos antes da execução', () => {
  const command = { name: 'ok', code: '$reply[ok]' };
  for (const value of [{ version: 2, scenarios: [] }, { version: 1, scenarios: [] },
    { version: 1, scenarios: [{ name: 'x', commands: [{ ...command, run: 'process.exit()' }], messages: [] }] },
    { version: 1, scenarios: [{ name: 'x', commands: [command], messages: [{ content: '!ok', expect: { outcome: 'maybe' } }] }] },
    { version: 1, scenarios: [{ name: 'x', commands: [command], messages: [{ content: '!ok', expect: { outcome: 'success' } }], members: [{ id: '1', guildID: '100', rank: 1, permissions: ['FAKE'] }] }] }]) {
    assert.throws(() => parseScenarios(JSON.stringify(value)));
  }
  assert.throws(() => parseScenarios('x'.repeat(5_000_001)), /5000000/);
});

for (const kind of ['json', 'sqlite'] as const) {
  test(`CLI data ${kind}: stats, limpeza, backup e restore com simulação padrão`, async t => {
    const directory = await fixture(t), path = join(directory, `state.${kind}`), backup = join(directory, 'backup.json');
    const store: Store = kind === 'json' ? new JsonStore(path) : new SQLiteStore(path);
    await store.update(state => { state.variables['x'] = 1; state.variableExpirations = { x: 0 }; });
    await store.close?.();
    const options = (operation: 'stats' | 'cleanup' | 'backup' | 'restore', extra = {}) => ({ action: 'data' as const, input: path, json: true, apply: false, operation, ...extra });
    const stats = await dataCommand(options('stats')) as { expiredVariables: number };
    assert.equal(stats.expiredVariables, 1);
    await dataCommand(options('backup', { file: backup }));
    await assert.rejects(dataCommand(options('backup', { file: backup })), { code: 'EEXIST' });
    await dataCommand(options('cleanup'));
    const report = await dataCommand(options('restore', { file: backup })) as { dryRun: boolean; after: { variables: number } };
    assert.equal(report.dryRun, true); assert.equal(report.after.variables, 1);
    assert.equal((await dataCommand(options('stats')) as { variables: number }).variables, 0);
    await dataCommand(options('restore', { file: backup, apply: true }));
    assert.equal((await dataCommand(options('stats')) as { variables: number }).variables, 1);
  });
}

test('CLI parsing recusa opções contraditórias/extras e aceita novos comandos', () => {
  assert.deepEqual(parseArguments(['lint', 'commands', '--catalog', 'one.json', '--catalog', 'two.json', '--json']),
    { action: 'lint', input: 'commands', json: true, catalogs: ['one.json', 'two.json'] });
  assert.equal(parseArguments(['data', 'restore', 'bot.json', '--file', 'backup.json', '--apply']).action, 'data');
  for (const args of [['lint'], ['test', 'x.json', '--catalog', 'x'], ['functions', '--config', 'x'],
    ['data', 'restore', 'bot.json'], ['data', 'stats', 'bot.json', '--apply'], ['data', 'cleanup', 'bot.json', '--limit', '0']]) {
    assert.throws(() => parseArguments(args));
  }
});


test('manutenção SQLite em leitura recusa banco vazio sem inicializar tabela ou alterar bytes', async t => {
  const directory = await fixture(t), path = join(directory, 'empty.sqlite');
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(path); db.close();
  const before = await readFile(path);
  await assert.rejects(dataCommand({ action: 'data', input: path, operation: 'stats', json: true, apply: false }));
  assert.deepEqual(await readFile(path), before);
});
