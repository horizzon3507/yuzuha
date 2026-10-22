import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { complete, hoverAt, scriptRegion, signatureAt } from '../src/tooling.js';
import { registerBuiltins, Runtime } from '../src/functions.js';
import { doctor } from '../src/cli/doctor.js';
import { parseArguments } from '../src/cli/arguments.js';

const functions = registerBuiltins(new Runtime()).functions();
test('autocomplete filtra prefixos sem distinguir caixa e produz snippets com assinatura e descrição', () => {
  const result = complete('$REP', 4, functions).find(value => value.name === 'reply');
  assert.ok(result); assert.equal(result.usage, '$reply[texto ou embed]');
  assert.match(result.snippet, /^\\\$reply\[\$\{1:/);
  assert.ok(result.description.length); assert.equal(result.start, 0); assert.equal(result.end, 4);
  assert.deepEqual(complete(String.raw`\$rep`, 5, functions), []);
  assert.deepEqual(complete('$jsonDecode[["$rep', 17, functions), []);
  assert.deepEqual(complete('texto sem função', 16, functions), []);
});

test('assinaturas acompanham chamadas aninhadas, delimitadores escapados e arrays JSON literais', () => {
  const source = '$reply[$math[1;+;';
  assert.equal(signatureAt(source, source.length, functions)?.usage, '$math[a;operador;b]');
  assert.equal(signatureAt(source, source.length, functions)?.activeParameter, 2);
  const outer = '$reply[$math[1;+;2]';
  assert.equal(signatureAt(outer, outer.length, functions)?.usage, '$reply[texto ou embed]');
  const escaped = String.raw`$join[\;;a;`;
  assert.equal(signatureAt(escaped, escaped.length, functions)?.activeParameter, 2);
  const json = '$jsonGet[["a;b"];';
  assert.equal(signatureAt(json, json.length, functions)?.activeParameter, 1);
  assert.equal(signatureAt('$reply[x]', 3, functions), undefined);
});

test('hover resolve aliases e ignora nomes desconhecidos, escapes e dados JSON', () => {
  assert.equal(hoverAt('$nickname[2;x;y]', 4, functions)?.usage, '$nickname[usuário;apelido;motivo]');
  assert.equal(hoverAt('$nada', 3, functions), undefined);
  assert.equal(hoverAt(String.raw`\$reply`, 4, functions), undefined);
  assert.equal(hoverAt('$jsonDecode[["$reply"]]', 16, functions), undefined);
  const aliased = functions.find(fn => fn.aliases?.length);
  if (aliased) assert.equal(hoverAt('$' + aliased.aliases![0], 2, functions)?.usage, aliased.usage);
});

test('editor atua em arquivos de script e strings JS/TS, preservando comentários e código nativo', () => {
  const source = 'const code = `$reply[$math[1;+;';
  const region = scriptRegion(source, source.length, 'typescript');
  assert.ok(region); assert.equal(region.source, '$reply[$math[1;+;');
  assert.equal(signatureAt(region.source, region.offset, functions)?.activeParameter, 2);
  assert.equal(scriptRegion('const $reply = 1;', 8, 'typescript'), undefined);
  assert.equal(scriptRegion('// "$reply', 10, 'typescript'), undefined);
  assert.equal(scriptRegion('/* "$reply */', 10, 'typescript'), undefined);
  assert.equal(scriptRegion('$reply[', 7, 'yuzuha')?.offset, 7);
});

test('CLI aceita doctor/editor e recusa opções extras', () => {
  assert.deepEqual(parseArguments(['doctor', './bot.js', '--json']), { action: 'doctor', input: './bot.js', json: true });
  assert.deepEqual(parseArguments(['editor']), { action: 'editor' });
  for (const args of [['editor', '--install'], ['doctor', '--json', '--json'], ['doctor', '--online']]) assert.throws(() => parseArguments(args));
});

test('doctor inspeciona config, SDK, token e permissões sem expor segredo ou carregar .env no processo', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-doctor-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, 'commands'));
  await writeFile(join(directory, 'commands/ping.js'), 'export default { name: "ping", run() {} };');
  const path = join(directory, 'yuzuha.config.mjs');
  await writeFile(path, 'export default { name: "doctor-test", commands: "./commands" };');
  await writeFile(join(directory, '.env'), 'FLUXER_BOT_TOKEN=segredo-que-nao-deve-aparecer\nDOCTOR_TEST_ONLY=ignorar\n');
  const before = process.env.FLUXER_BOT_TOKEN;
  const report = await doctor(path);
  assert.equal(report.ok, true); assert.equal(report.offline, true);
  assert.ok(report.checks.some(check => check.name === 'sdk' && check.status === 'pass'));
  assert.ok(report.checks.some(check => check.name === 'permissions' && check.status === 'pass'));
  assert.equal(JSON.stringify(report).includes('segredo-que-nao-deve-aparecer'), false);
  assert.equal(process.env.FLUXER_BOT_TOKEN, before); assert.equal(process.env.DOCTOR_TEST_ONLY, undefined);
  await writeFile(join(directory, 'commands/bad.js'), 'export default { name: "bad", permissions: ["NaoExiste"], run() {} };');
  const invalid = await doctor(path);
  assert.equal(invalid.ok, false); assert.ok(invalid.checks.some(check => check.status === 'fail'));
});

test('metadados da extensão têm a mesma cobertura do registro e não contêm código executável', async () => {
  const metadata = JSON.parse(await readFile(new URL('../editors/vscode/functions.json', import.meta.url), 'utf8')) as { name: string; execute?: unknown }[];
  assert.deepEqual(metadata.map(fn => fn.name).sort(), functions.map(fn => fn.name).sort());
  assert.ok(metadata.every(fn => !Object.hasOwn(fn, 'execute')));
});
