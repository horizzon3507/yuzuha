import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import * as language from '../src/tooling/language.js';
import { Runtime, registerBuiltins } from '../src/functions.js';

const runtime = registerBuiltins(new Runtime());
const functions = runtime.functions();
const plugin = { name: 'greet', aliases: ['hello'], minArgs: 1, maxArgs: 2,
  usage: '$greet[nome;saudação?]', description: 'Cumprimenta um membro.', category: 'plugin' };
const catalog = (definitions = [plugin]) => JSON.stringify({ version: 1, functions: definitions });

test('diagnósticos conferem sintaxe, nomes, aliases e aridade sem executar funções', () => {
  const metadata = language.mergeFunctionCatalogs(functions, language.parseFunctionCatalog(catalog()));
  for (const source of ['$reply[ok]', '$HELLO[pessoa]', String.raw`$reply[a\;b]`, '$jsonDecode[["$nao;[x]"]]', '$reply[x$authorID]']) {
    runtime.compile(source.replace('$HELLO[pessoa]', '$reply[pessoa]'));
    assert.deepEqual(language.diagnose(source, metadata), [], source);
  }
  assert.deepEqual(language.diagnose('$xyz[x] $math[1;+] $reply[x;y]', metadata).map(value => value.code), ['UNKNOWN_FUNCTION', 'ARITY', 'ARITY']);
  assert.equal(language.diagnose('$authorID[x]', metadata)[0]?.code, 'ARITY');
  assert.equal(language.diagnose('$reply', metadata)[0]?.code, 'ARITY');
  assert.deepEqual(language.diagnose(String.raw`\$xyz[x]`, metadata).map(value => value.code), ['SYNTAX']);
  assert.deepEqual(language.diagnose(String.raw`\$xyz\[x\]`, metadata), []);
});

test('diagnósticos toleram código incompleto, limitam trabalho e apontam UTF-16 em linha/coluna', () => {
  const source = '😀\n$math[1;+;';
  const result = language.diagnose(source, functions);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.code, 'SYNTAX');
  assert.deepEqual(result[0]?.range, { start: { offset: 3, line: 2, column: 1 }, end: { offset: 8, line: 2, column: 6 } });
  assert.equal(language.diagnose('$reply[$xyz[x', functions).some(value => value.code === 'ARITY'), false);
  assert.equal(language.diagnose('$reply[[a]', functions)[0]?.code, 'SYNTAX');
  assert.equal(language.diagnose('] [x]', functions).length, 2);
  assert.equal(language.diagnose('a'.repeat(100_001), functions)[0]?.code, 'SOURCE_LIMIT');
  assert.ok(language.diagnose('$reply['.repeat(70), functions).some(value => value.message.includes('64')));
  assert.equal(language.diagnose('$bad '.repeat(200), functions).length, 100);
});

test('documentos JS/TS decodificam escapes com offsets originais e preservam String.raw', () => {
  const source = String.raw`const emoji = "\u{1F600}"; const code = "$reply[a\\;b] $oops[x]";`;
  const errors = language.documentDiagnostics(source, 'typescript', functions);
  assert.equal(errors.length, 1);
  assert.equal(errors[0]?.code, 'UNKNOWN_FUNCTION');
  assert.equal(errors[0]?.start, source.indexOf('$oops'));
  assert.equal(errors[0]?.end, source.indexOf('$oops') + 5);
  const encoded = String.raw`const code = "\u0024oops[x]";`;
  const error = language.documentDiagnostics(encoded, 'javascript', functions)[0];
  assert.equal(error?.start, encoded.indexOf('\\u0024'));
  assert.equal(error?.end, encoded.indexOf('oops') + 4);
  const raw = 'const code = String.raw`$reply[a\\;b]`;';
  assert.deepEqual(language.documentDiagnostics(raw, 'typescript', functions), []);
  const escaped = String.raw`const code = "\\$oops\\[x\\]";`;
  assert.deepEqual(language.documentDiagnostics(escaped, 'typescript', functions), []);
  const region = language.scriptRegion(source, source.indexOf('$oops') + 3, 'typescript');
  assert.ok(region); assert.equal(region.source.slice(region.offset - 3, region.offset), '$oo');
  assert.equal(language.documentOffset(region, region.offset), source.indexOf('$oops') + 3);
});

test('análise embutida ignora comentários, regex e interpolações JS, sem perder strings posteriores', () => {
  const source = '// "$oops[x]"\nconst re = /"$oops[x]"/; /* "$oops[x]" */\nconst code = `$reply[${foo("$oops[x]")}]`; const other = "$oops[x]";';
  const results = language.documentDiagnostics(source, 'typescript', functions);
  assert.equal(results.length, 1); assert.equal(results[0]?.start, source.lastIndexOf('$oops'));
  const atNativeExpression = source.indexOf('$oops', source.indexOf('${'));
  assert.equal(language.scriptRegion(source, atNativeExpression, 'typescript'), undefined);
  assert.deepEqual(language.documentDiagnostics('const x = "$reply[', 'typescript', functions).map(value => value.code), ['SYNTAX']);
  assert.deepEqual(language.documentDiagnostics('const $oops = 1;', 'typescript', functions), []);
  assert.deepEqual(language.documentDiagnostics('$oops[x]', 'plaintext', functions), []);
});

test('catálogos JSON validam todos os metadados e rejeitam colisões sem interpretar dados como código', () => {
  const parsed = language.parseFunctionCatalog(catalog());
  assert.equal(language.hoverAt('$hello[x]', 3, parsed)?.description, plugin.description);
  assert.equal(language.signatureAt('$greet[x;', 9, parsed)?.activeParameter, 1);
  assert.equal(language.complete('$he', 3, parsed)[0]?.name, 'hello');
  assert.throws(() => language.parseFunctionCatalog('globalThis.executed = true'));
  for (const value of [
    { version: 2, functions: [] }, { version: 1, functions: [], execute: 'anything' },
    { version: 1, functions: [{ ...plugin, execute: 'throw new Error()' }] },
    { version: 1, functions: [{ ...plugin, maxArgs: 0 }] },
    { version: 1, functions: [{ ...plugin, minArgs: 1.5 }] },
    { version: 1, functions: [{ ...plugin, name: '$greet' }] },
    { version: 1, functions: [{ ...plugin, aliases: ['GREET'] }] },
    { version: 1, functions: [{ ...plugin, description: 2 }] },
    { version: 1, functions: [{ ...plugin, aliases: [null] }] },
  ]) assert.throws(() => language.parseFunctionCatalog(JSON.stringify(value)));
  assert.throws(() => language.mergeFunctionCatalogs(functions, [{ ...plugin, aliases: ['REPLY'] }]));
  const merged = language.mergeFunctionCatalogs(parsed);
  merged[0]!.aliases!.push('changed');
  assert.deepEqual(parsed[0]?.aliases, ['hello']);
  const inert = language.parseFunctionCatalog(catalog([{ ...plugin, description: '${globalThis.executed = true}' }]));
  assert.equal(inert[0]?.description, '${globalThis.executed = true}');
});

const { activateEditor } = createRequire(import.meta.url)('../editors/vscode/extension.cjs') as {
  activateEditor(context: unknown, vscode: unknown, language: unknown): Promise<void>;
};

type Handler = (...args: any[]) => unknown;
function editorHost(initial: string) {
  const handlers: Record<string, Handler> = {};
  const collections = new Map<string, Map<string, any[]>>();
  const providers: Record<string, any> = {};
  const disposable = () => ({ dispose() {} });
  const event = (name: string) => (handler: Handler) => { handlers[name] = handler; return disposable(); };
  const uri = (path: string) => ({ toString: () => path });
  const folder = { uri: uri('/workspace') };
  let source = initial, files: string[] = [], enabled = true, catalogText = catalog();
  let read: () => Promise<Uint8Array> = async () => new TextEncoder().encode(catalogText);
  const document = { uri: uri('/workspace/command.yz'), languageId: 'yuzuha', isClosed: false,
    getText: () => source, positionAt: (offset: number) => ({ line: 0, character: offset }),
    offsetAt: (value: { character: number }) => value.character };
  const context = { subscriptions: [] as { dispose(): void }[] };
  const api = {
    DiagnosticSeverity: { Error: 0 },
    Range: class { constructor(...publicArgs: unknown[]) { Object.assign(this, { args: publicArgs }); } },
    Diagnostic: class { source?: string; code?: string; constructor(public range: unknown, public message: string, public severity: number) {} },
    RelativePattern: class { constructor(public folder: unknown, public path: string) {} },
    Uri: { joinPath: (base: { toString(): string }, path: string) => uri(base.toString() + '/' + path) },
    workspace: {
      textDocuments: [document], workspaceFolders: [folder], getWorkspaceFolder: () => folder,
      getConfiguration: () => ({ get: (key: string) => key === 'functionCatalogs' ? files : enabled }),
      fs: { stat: async () => ({ size: 100 }), readFile: () => read() },
      createFileSystemWatcher: () => ({ dispose() {}, onDidChange: event('file'), onDidCreate: event('create'), onDidDelete: event('delete') }),
      onDidOpenTextDocument: event('open'), onDidChangeTextDocument: event('change'),
      onDidCloseTextDocument: event('close'), onDidChangeConfiguration: event('config'), onDidChangeWorkspaceFolders: event('folders'),
    },
    languages: {
      createDiagnosticCollection: (name: string) => {
        const values = new Map<string, any[]>(); collections.set(name, values);
        return { set: (key: { toString(): string }, value: any[]) => values.set(key.toString(), value),
          delete: (key: { toString(): string }) => values.delete(key.toString()), clear: () => values.clear(), dispose: () => values.clear() };
      },
      registerCompletionItemProvider: (_: unknown, provider: unknown) => { providers.completion = provider; return disposable(); },
      registerHoverProvider: (_: unknown, provider: unknown) => { providers.hover = provider; return disposable(); },
      registerSignatureHelpProvider: (_: unknown, provider: unknown) => { providers.signature = provider; return disposable(); },
    },
  };
  return { api, context, document, handlers, collections, providers,
    configure: async (value: string[]) => { files = value; await handlers.config!({ affectsConfiguration: () => true }); },
    edit: (value: string) => { source = value; handlers.change!({ document }); },
    disable: () => { enabled = false; return handlers.config!({ affectsConfiguration: () => true }); },
    setCatalog: (value: string) => { catalogText = value; },
    setRead: (value: typeof read) => { read = value; },
    diagnostics: () => collections.get('yuzuha')!.get(document.uri.toString()),
  };
}

test('extensão atualiza diagnósticos no abrir/editar/fechar e remove resultados antigos após correção', async () => {
  const host = editorHost('$oops[x]');
  await activateEditor(host.context, host.api, language);
  assert.equal(host.diagnostics()?.[0].code, 'UNKNOWN_FUNCTION');
  host.edit('$reply[ok]'); assert.deepEqual(host.diagnostics(), []);
  host.edit('$math[1]'); assert.equal(host.diagnostics()?.[0].code, 'ARITY');
  host.handlers.close!(host.document); assert.equal(host.diagnostics(), undefined);
  host.handlers.open!(host.document); assert.equal(host.diagnostics()?.[0].code, 'ARITY');
  await host.disable(); assert.equal(host.diagnostics(), undefined);
  for (const subscription of host.context.subscriptions) subscription.dispose();
});

test('extensão recarrega catálogos atomicamente, informa JSON inválido e descarta leitura atrasada', async () => {
  const host = editorHost('$greet[pessoa]');
  await activateEditor(host.context, host.api, language);
  assert.equal(host.diagnostics()?.[0].code, 'UNKNOWN_FUNCTION');
  await host.configure(['plugin.json']); assert.deepEqual(host.diagnostics(), []);
  host.setCatalog('{'); await host.handlers.file!();
  assert.deepEqual(host.diagnostics(), []);
  assert.equal(host.collections.get('yuzuha-catalogs')!.size, 1);
  host.setCatalog(catalog()); await host.handlers.file!();
  assert.equal(host.collections.get('yuzuha-catalogs')!.size, 0);
  let release!: (value: Uint8Array) => void;
  host.setRead(() => new Promise(resolve => { release = resolve; }));
  const pending = host.configure(['plugin.json']);
  await new Promise(resolve => setImmediate(resolve));
  await host.configure([]);
  release(new TextEncoder().encode(catalog())); await pending;
  assert.equal(host.diagnostics()?.[0].code, 'UNKNOWN_FUNCTION');
  assert.equal(host.providers.hover.provideHover(host.document, { character: 3 }), undefined);
  host.document.isClosed = true; host.handlers.close!(host.document);
  await host.configure([]); assert.equal(host.diagnostics(), undefined);
  for (const subscription of host.context.subscriptions) subscription.dispose();
});
