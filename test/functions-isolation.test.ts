import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { MemoryStore, Yuzuha } from '../src/index.js';
import type { ScriptEngine } from '../src/ports/script-engine.js';
import { functions } from '../src/functions.js';
import { MockTransport } from '../src/testing.js';

const source = fileURLToPath(new URL('../src/', import.meta.url));
const exec = promisify(execFile);

async function modules(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await modules(path));
    else if (/\.(?:ts|mjs)$/.test(entry.name)) result.push(path);
  }
  return result;
}

test('importar yuzuha nunca carrega src/functions/ nem @napi-rs/canvas', async () => {
  const files = await modules(source), known = new Set(files);
  const specifiers = (path: string, text: string) => [...text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g)]
    .map(match => match[1] ?? match[2]!)
    .map(specifier => specifier.startsWith('.') ? resolve(dirname(path), specifier.replace(/\.js$/, '.ts')) : specifier);
  const graph = new Map<string, string[]>();
  for (const path of files) graph.set(path, specifiers(path, await readFile(path, 'utf8')));

  const reach = (origin: string) => {
    const external = new Set<string>(), visited = new Set<string>();
    const follow = (path: string) => {
      if (visited.has(path)) return;
      visited.add(path);
      for (const target of graph.get(path) ?? []) {
        if (known.has(target)) follow(target);
        else if (!target.startsWith('.')) external.add(target);
      }
    };
    follow(origin);
    return { visited, external };
  };

  const root = reach(join(source, 'index.ts'));
  assert.equal([...root.visited].some(path => /functions[\\/]/.test(path)), false,
    'o grafo da raiz alcançou src/functions/');
  assert.equal(root.visited.has(join(source, 'functions.ts')), false, 'o grafo da raiz alcançou functions.ts');
  assert.equal(root.external.has('@napi-rs/canvas'), false, 'o grafo da raiz alcançou @napi-rs/canvas');
  assert.equal(root.visited.has(join(source, 'infrastructure/canvas/napi.ts')), false, 'o grafo da raiz alcançou o loader do peer');

  const card = reach(join(source, 'canvas/card.ts'));
  assert.equal(card.external.has('@napi-rs/canvas'), false, 'o grafo de canvas/card alcançou @napi-rs/canvas');
  assert.equal(card.visited.has(join(source, 'infrastructure/canvas/napi.ts')), false, 'canvas/card alcançou o loader do peer');
  assert.equal([...card.visited].some(path => /functions[\\/]/.test(path)), false, 'canvas/card alcançou src/functions/');

  await exec(process.execPath, ['--import', 'tsx', '--input-type=module', '-e',
    `await import(${JSON.stringify(pathToFileURL(join(source, 'index.ts')).href)});`]);
});

test('comando com code, subcomando com code e scriptEvent exigem engine', async () => {
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  try {
    assert.throws(() => bot.command({ name: 'ping', code: 'pong' }), { code: 'FUNCTIONS_REQUIRED' });
    assert.throws(() => bot.command({ name: 'grupo', subcommands: [{ name: 'filho', code: 'pong' }] }), { code: 'FUNCTIONS_REQUIRED' });
    assert.throws(() => bot.scriptEvent({ event: 'guildMemberAdd', code: 'pong' }), { code: 'FUNCTIONS_REQUIRED' });
    assert.throws(() => bot.plugin({ name: 'funcs', functions: [{ name: 'x', category: 'test', minArgs: 0, maxArgs: 0,
      usage: '$x', description: '', execute: () => '' }] }), { code: 'FUNCTIONS_REQUIRED' });
    assert.equal(bot.listCommands().length, 0);

    bot.useEngine(functions());
    assert.throws(() => bot.useEngine(functions()), { code: 'ENGINE_INSTALLED' });
    bot.command({ name: 'ping', code: 'pong' });
    bot.scriptEvent({ event: 'guildMemberAdd', code: 'pong', channelID: '300' });
  } finally { await bot.destroy(); }
});

test('instalação de plugin que falha validação preserva as funções do engine', async () => {
  const engine = functions();
  const before = engine.functions().map(fn => fn.name).sort();
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), engine });
  try {
    assert.throws(() => bot.plugin({
      name: 'broken',
      functions: [{ name: 'nova', category: 'test', minArgs: 0, maxArgs: 0, usage: '$nova', description: '', execute: () => '' }],
      commands: [{ name: 'cmd', code: '$reply[$reply]' }],
    }));
    assert.deepEqual(engine.functions().map(fn => fn.name).sort(), before);
  } finally { await bot.destroy(); }
});

test('programas executam na engine que os compilou', async () => {
  const real = functions();
  const tag = Symbol('tag');
  const tagged = (engine: ReturnType<typeof functions>): ScriptEngine => ({
    compile: (code: string, file: string) => ({ [tag]: true, program: engine.compile(code, file) }),
    execute: (program: unknown, ctx: unknown) => {
      const wrapped = program as { program: unknown } & Record<symbol, unknown>;
      if (!wrapped[tag]) return Promise.reject(new Error('programa externo'));
      return engine.execute(wrapped.program, ctx);
    },
    text: value => engine.text(value),
    functions: () => engine.functions(),
    registerAll: fns => engine.registerAll(fns),
    limits: engine.limits,
    fork: () => tagged(engine.fork()),
  });
  const bot = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore(), engine: tagged(real) });
  bot.plugin({ name: 'tagged', commands: [{ name: 'oi', code: 'reply("oi")' }] });
  assert.ok(bot.listCommands().some(command => command.name === 'oi'));
  const wrong = new Yuzuha({ transport: new MockTransport(), store: new MemoryStore() });
  assert.throws(() => wrong.plugin({ name: 'x', commands: [{ name: 'y', code: 'reply("y")' }] }),
    { code: 'FUNCTIONS_REQUIRED' });
});
