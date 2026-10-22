import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commandCatalog } from '../src/cli/command-catalog.js';
import { commandUsage, defineCommand, arg } from '../src/index.js';

const exec = promisify(execFile);
const cli = fileURLToPath(new URL('../src/cli.ts', import.meta.url));

test('command catalog shares usage metadata and omits executable command fields', () => {
  const command = defineCommand({
    name: 'hello', aliases: ['hi'], description: 'Cumprimenta alguém.',
    args: { nome: arg.text().required().min(1).max(20).describe('Nome do destinatário.')
      .validate(value => value !== 'forbidden', 'Escolha outro nome.') },
    flags: { idioma: arg.text().choices(['pt', 'en']).default('pt').alias('i').describe('Idioma da resposta.') },
    examples: ['?hello Yuzuha --idioma pt'],
    checks: [() => { throw new Error('Check não deve executar ao exportar metadados.'); }],
    run() { throw new Error('Handler não deve executar ao exportar metadados.'); },
  });
  const metadata = commandCatalog([command], '?')[0]!;
  assert.equal(metadata.usage, commandUsage(command, '?'));
  assert.equal(metadata.args[0]!.description, 'Nome do destinatário.');
  assert.equal(metadata.args[0]!.min, 1);
  assert.equal(metadata.args[0]!.max, 20);
  assert.deepEqual(metadata.flags[0]!.choices, ['pt', 'en']);
  assert.equal(metadata.flags[0]!.defaultValue, 'pt');
  assert.deepEqual(metadata.flags[0]!.aliases, ['i']);
  assert.deepEqual(metadata.examples, ['?hello Yuzuha --idioma pt']);
  assert.equal(Object.hasOwn(metadata, 'run'), false);
  assert.equal(Object.hasOwn(metadata, 'checks'), false);
  assert.equal(Object.hasOwn(metadata.args[0]!, 'validators'), false);
  assert.notStrictEqual(metadata.flags[0]!.choices, command.flags![0]!.choices);
  metadata.examples.push('changed');
  assert.deepEqual(command.flags![0]!.choices, ['pt', 'en']);
  assert.deepEqual(command.examples, ['?hello Yuzuha --idioma pt']);
});

test('CLI check exports nested command metadata with configured prefix without executing handlers', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'yuzuha-cli-command-catalog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const commands = join(directory, 'commands');
  await mkdir(commands);
  const marker = join(directory, 'executed');
  await writeFile(join(commands, 'config.mjs'), `
import { writeFileSync } from 'node:fs';
export default {
  name: 'config', aliases: ['cfg'], description: 'Configura o bot.', subcommands: [{
    name: 'prefixo', aliases: ['prefix'], description: 'Escolhe um prefixo.',
    args: [{ name: 'valor', type: 'string', required: true, choices: ['!', '?'], description: 'Novo prefixo.' }],
    flags: [{ name: 'global', type: 'boolean', aliases: ['g'], defaultValue: false, description: 'Aplica globalmente.' }],
    examples: ['?config prefixo ! --global'],
    run() { writeFileSync(${JSON.stringify(marker)}, 'unexpected'); },
  }],
};
`);
  const config = join(directory, 'yuzuha.config.mjs');
  const library = pathToFileURL(fileURLToPath(new URL('../src/index.ts', import.meta.url))).href;
  await writeFile(config, `import { MemoryStore } from ${JSON.stringify(library)};
export default { prefix: ['?', '!'], commands: './commands', store: new MemoryStore() };`);
  const { stdout } = await exec(process.execPath, ['--import', 'tsx', cli, 'check', config, '--json'], {
    env: { ...process.env, FLUXER_BOT_TOKEN: '' }, timeout: 10_000,
  });
  const report = JSON.parse(stdout);
  assert.equal(report.valid, true);
  assert.equal(report.commands.length, 1);
  const group = report.commands[0];
  assert.equal(group.usage, '?config <subcomando>');
  assert.deepEqual(group.aliases, ['cfg']);
  const child = group.subcommands[0];
  assert.equal(child.name, 'prefixo');
  assert.equal(child.usage, '?config prefixo <valor> [--global]');
  assert.deepEqual(child.args, [{ name: 'valor', type: 'string', required: true, choices: ['!', '?'], description: 'Novo prefixo.' }]);
  assert.deepEqual(child.flags, [{ name: 'global', type: 'boolean', defaultValue: false, aliases: ['g'], description: 'Aplica globalmente.' }]);
  assert.deepEqual(child.examples, ['?config prefixo ! --global']);
  assert.deepEqual(child.subcommands, []);
  assert.equal(Object.hasOwn(child, 'run'), false);
  await assert.rejects(readFile(marker), { code: 'ENOENT' });
});
