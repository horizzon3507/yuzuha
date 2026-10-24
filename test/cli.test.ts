import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseArguments } from '../src/cli/arguments.js';
import { packageRoot, VERSION } from '../src/cli/version.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));
const root = fileURLToPath(new URL('../', import.meta.url));
const invoke = (args: string[]) => exec(process.execPath, ['--import', 'tsx', cli, ...args], { cwd: root, env: { ...process.env, FLUXER_BOT_TOKEN: '' }, timeout: 10_000 });

test('CLI rejects extra arguments and contradictory flags', () => {
  for (const args of [['init', 'bot', '--js', '--ts'], ['init', 'bot', '--local', '--local'], ['init', 'bot', '--functions', '--functions'],
    ['init', 'bot', '--local=elsewhere'], ['run', '--json'], ['check', 'one', 'two'], ['functions', '--unknown'], ['--version', 'extra']]) {
    assert.throws(() => parseArguments(args), /USAGE|Argumentos|Use init/);
  }
  assert.deepEqual(parseArguments(['check', '--json', 'commands']), { action: 'check', input: 'commands', json: true });
  assert.deepEqual(parseArguments(['init', 'bot']), { action: 'init', directory: 'bot', language: 'ts', functions: false, local: false });
  assert.deepEqual(parseArguments(['init', 'bot', '--js', '--local', '--functions']),
    { action: 'init', directory: 'bot', language: 'js', functions: true, local: true });
});

test('CLI reports package version and filters function metadata', async () => {
  assert.equal((await invoke(['--version'])).stdout.trim(), VERSION);
  const output = JSON.parse((await invoke(['functions', '--json', '--category', 'moderation'])).stdout) as { category: string }[];
  assert.ok(output.length > 0); assert.ok(output.every(fn => fn.category === 'moderation'));
});

test('CLI search arguments normalize terms and reject missing, empty or repeated values', () => {
  assert.deepEqual(parseArguments(['functions', '--search', '  $RePlY  ', '--category', 'messages', '--json']),
    { action: 'functions', json: true, category: 'messages', search: 'RePlY' });
  assert.deepEqual(parseArguments(['functions']), { action: 'functions', json: false, category: undefined });
  for (const args of [['--search'], ['--search', ''], ['--search', '   '], ['--search', '$'], ['--search', ' $  '],
    ['--search', '--json'], ['--search', 'reply', '--search', 'ban'], ['--search=reply']]) {
    assert.throws(() => parseArguments(['functions', ...args]), { code: 'USAGE' });
  }
  assert.throws(() => parseArguments(['functions', '--search', 'reply', '--config', 'bot.mjs']), { code: 'USAGE' });
  assert.throws(() => parseArguments(['functions', '--search', 'reply', '--plugins-only']), { code: 'USAGE' });
});

test('CLI searches names, aliases and descriptions while preserving order and metadata', async () => {
  const all = JSON.parse((await invoke(['functions', '--json'])).stdout) as { name: string; category: string; usage: string; description: string }[];
  assert.equal(all.length, 306);
  const named = JSON.parse((await invoke(['functions', '--search', '  $NiCkNaMe ', '--json'])).stdout);
  assert.deepEqual(named, all.filter(fn => fn.name === 'nickname'));
  assert.equal(named.length, 1);
  const alias = JSON.parse((await invoke(['functions', '--search', '$ONLYGUILD', '--json'])).stdout);
  assert.deepEqual(alias, all.filter(fn => fn.name === 'requireGuild'));
  assert.equal(alias.length, 1);
  const described = JSON.parse((await invoke(['functions', '--search', 'ALTERA APELIDO', '--json'])).stdout);
  assert.deepEqual(described, named);
  const messages = JSON.parse((await invoke(['functions', '--category', 'messages', '--search', 'MENSAGEM', '--json'])).stdout);
  assert.ok(messages.length > 0);
  assert.deepEqual(messages, all.filter(fn => fn.category === 'messages' && fn.description.toLowerCase().includes('mensagem')));
  const text = (await invoke(['functions', '--search', 'nickname'])).stdout.trimEnd();
  const nickname = named[0]; assert.ok(nickname);
  assert.equal(text, `${nickname.usage.padEnd(52)} ${nickname.description}`);
  const catalog = JSON.parse((await invoke(['functions', '--catalog', '--search', 'nickname'])).stdout);
  assert.deepEqual(catalog, { version: 1, functions: named });
});

test('CLI search returns successful empty outputs and still rejects unknown categories', async () => {
  const search = ['functions', '--search', 'yuzuha-no-such-function-017'];
  assert.equal((await invoke(search)).stdout.trim(), 'Nenhuma função encontrada.');
  assert.deepEqual(JSON.parse((await invoke([...search, '--json'])).stdout), []);
  assert.deepEqual(JSON.parse((await invoke([...search, '--catalog'])).stdout), { version: 1, functions: [] });
  assert.deepEqual(JSON.parse((await invoke(['functions', '--category', 'moderation', '--search', 'nickname', '--json'])).stdout), []);
  await assert.rejects(invoke([...search, '--category', 'unknown-category', '--json']), (error: unknown) => {
    assert.equal(JSON.parse((error as { stderr: string }).stderr).code, 'CATEGORY'); return true;
  });
});

test('CLI check JSON reports valid commands and located errors without login', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-cli-check-'));
  try {
    const path = join(directory, 'command.mjs');
    await writeFile(path, 'export default { name: "ping", code: "$reply[Pong]" };');
    const valid = JSON.parse((await invoke(['check', directory, '--json'])).stdout) as { valid: boolean; commands: { name: string }[] };
    assert.equal(valid.valid, true); assert.equal(valid.commands[0]?.name, 'ping');
    await writeFile(path, 'export default { name: "ping", code: "$unknown" };');
    await assert.rejects(invoke(['check', directory, '--json']), (error: unknown) => {
      const result = JSON.parse((error as { stderr: string }).stderr) as { valid: boolean; code: string; message: string };
      assert.equal(result.valid, false); assert.equal(result.code, 'UNKNOWN_FUNCTION');
      assert.match(result.message, /command.mjs:1:1/); return true;
    });
  } finally { await rm(directory, { recursive: true }); }
});

test('init refuses existing directories and preserves their contents', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-cli-existing-'));
  try {
    await writeFile(join(directory, 'keep.txt'), 'keep');
    await assert.rejects(invoke(['init', directory, '--js']), /EEXIST/);
    assert.equal(await readFile(join(directory, 'keep.txt'), 'utf8'), 'keep');
  } finally { await rm(directory, { recursive: true }); }
});

for (const language of ['js', 'ts'] as const) {
  test(`init ${language} creates a portable npm dependency and an offline test`, async () => {
    const parent = await mkdtemp(join(tmpdir(), 'yuzuha-cli-init-'));
    const directory = join(parent, 'bot');
    try {
      await invoke(['init', directory, `--${language}`]);
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      assert.equal(manifest.dependencies.yuzuha, `^${VERSION}`);
      assert.equal(manifest.scripts.test, language === 'ts' ? 'tsx --test test/*.test.ts' : 'node --test test/*.test.js');
      if (language === 'ts') assert.equal(manifest.devDependencies.tsx, '^4.20.0');
      const sample = await readFile(join(directory, `test/hello.test.${language}`), 'utf8');
      assert.match(sample, /createTestBot/);
      assert.match(sample, /commands: \[hello\]/);
      assert.match(sample, /fixture\.destroy\(\)/);
      assert.doesNotMatch(sample, /login|FLUXER_BOT_TOKEN/);
      const readme = await readFile(join(directory, 'README.md'), 'utf8');
      assert.match(readme, /npm test/);
      assert.doesNotMatch(readme, /A dependência local/);
    } finally { await rm(parent, { recursive: true }); }
  });
}

test('init --local explicitly links the generating installation and preserves function mode', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'yuzuha-cli-local-'));
  const directory = join(parent, 'bot');
  try {
    await invoke(['init', directory, '--js', '--local', '--functions']);
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    assert.equal(manifest.dependencies.yuzuha, `file:${packageRoot}`);
    assert.match(await readFile(join(directory, 'README.md'), 'utf8'), /A dependência local/);
    assert.match(await readFile(join(directory, 'commands/eco.js'), 'utf8'), /yuzuha\/functions/);
  } finally { await rm(parent, { recursive: true }); }
});
