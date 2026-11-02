// Gera docs/PARITY-MATRIX.md a partir dos .d.ts instalados de @fluxerjs/*.
// Uso: node scripts/parity-matrix.mjs [--check]
// Heurística: cobertura por nome. "coberto-script" = o nome é alcançado pelo caminho
// builtins -> ports de recursos/transporte -> adaptador do SDK. "coberto-nativo" = o
// código do Yuzuha usa o nome do SDK. As áreas e as exceções intencionais vêm de
// scripts/parity-areas.json; export novo sem classificação faz o teste falhar.
import ts from 'typescript';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, relative } from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
const SDK_PACKAGES = [
  { name: '@fluxerjs/core', entry: 'node_modules/@fluxerjs/core/dist/index.d.ts' },
  { name: '@fluxerjs/builders', entry: 'node_modules/@fluxerjs/builders/dist/index.d.ts' },
  { name: '@fluxerjs/types', entry: 'node_modules/@fluxerjs/types/dist/index.d.ts' },
];
const RUNTIME_KINDS = new Set(['class', 'function', 'variable']);
const STATUSES = ['coberto-script', 'coberto-nativo', 'só-SDK', 'lacuna', 'dados'];

async function tsFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await tsFiles(path));
    else if (entry.name.endsWith('.ts')) result.push(path);
  }
  return result.sort();
}

function sourceOf(path, text) {
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
}

function exportKind(symbol) {
  const flags = symbol.flags;
  if (flags & ts.SymbolFlags.Class) return 'class';
  if (flags & ts.SymbolFlags.Function) return 'function';
  if (flags & ts.SymbolFlags.Interface) return 'interface';
  if (flags & ts.SymbolFlags.TypeAlias) return 'type';
  if (flags & ts.SymbolFlags.Enum) return 'enum';
  if (flags & ts.SymbolFlags.Variable) return 'variable';
  return 'other';
}

function isPublicMember(declaration, owner) {
  if (declaration.parent !== owner) return false;
  if (declaration.name && ts.isPrivateIdentifier(declaration.name)) return false;
  return !(ts.getCombinedModifierFlags(declaration) & ts.ModifierFlags.Private);
}

function memberKind(declaration) {
  if (ts.isMethodDeclaration(declaration)) return 'método';
  if (ts.isGetAccessor(declaration) || ts.isSetAccessor(declaration)) return 'acessor';
  return 'propriedade';
}

/** Inventário público de um pacote: exports e membros declarados em classes (instância e estáticos). */
function inventory(pkg) {
  const program = ts.createProgram([join(ROOT, pkg.entry)], { skipLibCheck: true, noEmit: true,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022 });
  const checker = program.getTypeChecker();
  const module = checker.getSymbolAtLocation(program.getSourceFile(join(ROOT, pkg.entry)));
  const exports = [];
  const symbols = new Map();
  for (const exported of checker.getExportsOfModule(module)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    symbols.set(exported.name, symbol);
    const kind = exportKind(symbol);
    const members = [];
    const declaration = symbol.declarations?.find(item => ts.isClassDeclaration(item));
    if (declaration && kind === 'class') {
      const instance = checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol));
      const statics = checker.getPropertiesOfType(checker.getTypeOfSymbol(symbol));
      for (const member of [...instance, ...statics]) {
        const decl = member.declarations?.find(item => isPublicMember(item, declaration));
        if (!decl) continue;
        // Chaves computadas (ex.: [Symbol.iterator]) recebem ids internos do TypeScript que variam entre execuções.
        const name = decl.name && ts.isComputedPropertyName(decl.name) ? decl.name.getText() : member.name;
        members.push({ name, kind: memberKind(decl) });
      }
      const seen = new Set();
      exports.push({ name: exported.name, package: pkg.name, kind, members: members.filter(m => !seen.has(m.name) && seen.add(m.name)) });
      continue;
    }
    exports.push({ name: exported.name, package: pkg.name, kind, members: [] });
  }
  return { exports, checker, symbols };
}

/** Nomes usados por arquivos do Yuzuha que importam o SDK; palavras comuns fora dele não contam. */
async function yuzuhaUsage() {
  const identifiers = new Set();
  const properties = new Set();
  for (const path of await tsFiles(join(ROOT, 'src'))) {
    const file = sourceOf(path, await readFile(path, 'utf8'));
    const importsSdk = file.statements.some(node => ts.isImportDeclaration(node)
      && ts.isStringLiteral(node.moduleSpecifier) && node.moduleSpecifier.text.startsWith('@fluxerjs/'));
    if (!importsSdk) continue;
    const visit = node => {
      if (ts.isPropertyAccessExpression(node)) properties.add(node.name.text);
      if (ts.isIdentifier(node)) identifiers.add(node.text);
      ts.forEachChild(node, visit);
    };
    visit(file);
  }
  return { identifiers, properties };
}

/** Métodos que os builtins chamam em recursos e transporte, com os nomes alcançados no adaptador do SDK. */
async function scriptChain() {
  const calls = new Set();
  for (const path of await tsFiles(join(ROOT, 'src/scripting/builtins'))) {
    const text = await readFile(path, 'utf8');
    for (const match of text.matchAll(/\bresources\.(\w+)\.(\w+)/g)) calls.add(`${match[1]}.${match[2]}`);
    for (const match of text.matchAll(/\btransport\.(\w+)/g)) calls.add(`transport.${match[1]}`);
  }
  const names = new Set();
  for (const call of calls) {
    const [area, method] = call.split('.');
    const file = area === 'transport' ? join(ROOT, 'src/infrastructure/fluxer/transport.ts')
      : join(ROOT, `src/infrastructure/fluxer/resources/${area}.ts`);
    let text;
    try { text = await readFile(file, 'utf8'); } catch { continue; }
    for (const name of adapterNames(sourceOf(file, text), method)) names.add(name);
  }
  return names;
}

function adapterNames(file, method) {
  const helpers = new Map();
  let target;
  const visit = node => {
    if ((ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) && node.name && ts.isIdentifier(node.name)) {
      if (node.name.text === method && ts.isMethodDeclaration(node)) target = node;
      if (ts.isFunctionDeclaration(node)) helpers.set(node.name.text, node);
    }
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer
      && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) {
      helpers.set(node.name.text, node.initializer);
      if (node.name.text === method) target = node.initializer;
    }
    if (ts.isPropertyAssignment(node) && ts.isIdentifier(node.name) && node.name.text === method) target = node.initializer;
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === method) target = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  const names = new Set();
  const seen = new Set();
  const collect = node => {
    if (!node || seen.has(node)) return;
    seen.add(node);
    const walk = child => {
      if (ts.isPropertyAccessExpression(child)) names.add(child.name.text);
      if (ts.isIdentifier(child)) {
        names.add(child.text);
        const helper = helpers.get(child.text);
        if (helper) collect(helper);
      }
      ts.forEachChild(child, walk);
    };
    walk(node);
  };
  collect(target);
  return names;
}

function clientEvents(core) {
  const symbol = core.symbols.get('ClientEvents');
  if (!symbol) throw new Error('ClientEvents ausente em @fluxerjs/core; revise scripts/parity-matrix.mjs.');
  return core.checker.getPropertiesOfType(core.checker.getDeclaredTypeOfSymbol(symbol)).map(prop => prop.name).sort();
}

async function functionModeEvents() {
  const text = await readFile(join(ROOT, 'src/framework/script-events.ts'), 'utf8');
  const file = sourceOf('script-events.ts', text);
  let names = [];
  file.forEachChild(node => {
    if (ts.isVariableStatement(node)) for (const declaration of node.declarationList.declarations) {
      if (declaration.name.getText() === 'scriptEventNames' && declaration.initializer) {
        names = [...declaration.initializer.getText().matchAll(/'([A-Za-z]+)'/g)].map(match => match[1]);
      }
    }
  });
  return names;
}

export async function buildParityMatrix() {
  const areasDocument = JSON.parse(await readFile(join(ROOT, 'scripts/parity-areas.json'), 'utf8'));
  const packages = SDK_PACKAGES.map(pkg => ({ pkg, ...inventory(pkg) }));
  const usage = await yuzuhaUsage();
  const chain = await scriptChain();
  const sdkOnly = new Map();
  for (const [reason, entry] of Object.entries(areasDocument.sdkOnly)) {
    for (const name of entry.exports) sdkOnly.set(name, reason);
  }
  const areaOf = new Map();
  for (const [area, names] of Object.entries(areasDocument.areas)) for (const name of names) areaOf.set(name, area);

  const rows = [];
  for (const { pkg, exports } of packages) {
    for (const item of exports) {
      if (!RUNTIME_KINDS.has(item.kind) && pkg.name !== '@fluxerjs/types') {
        rows.push({ ...item, area: null, status: 'dados', evidence: '' });
        continue;
      }
      const runtimeItem = RUNTIME_KINDS.has(item.kind);
      const memberRows = item.members.map(member => {
        const script = chain.has(member.name);
        const native = usage.properties.has(member.name) || usage.identifiers.has(member.name);
        return { ...member, status: script ? 'coberto-script' : native ? 'coberto-nativo' : 'lacuna' };
      });
      const scriptHit = chain.has(item.name) || memberRows.some(member => member.status === 'coberto-script');
      const nativeHit = usage.identifiers.has(item.name) || usage.properties.has(item.name) || memberRows.some(member => member.status === 'coberto-nativo');
      let status;
      if (sdkOnly.has(item.name)) status = 'só-SDK';
      else if (!runtimeItem) status = 'dados';
      else if (scriptHit) status = 'coberto-script';
      else if (nativeHit) status = 'coberto-nativo';
      else status = 'lacuna';
      rows.push({ ...item, area: areaOf.get(item.name) ?? null, status, members: memberRows,
        reason: sdkOnly.get(item.name) ?? '', evidence: scriptHit ? 'builtins' : nativeHit ? 'código nativo' : '' });
    }
  }

  const unclassified = rows.filter(row => RUNTIME_KINDS.has(row.kind) && !row.area && !sdkOnly.has(row.name)).map(row => `${row.package}:${row.name}`);
  const known = new Set(rows.map(row => row.name));
  const stale = [...areaOf.keys(), ...sdkOnly.keys()].filter(name => !known.has(name));
  const sdkEvents = clientEvents(packages.find(item => item.pkg.name === '@fluxerjs/core'));
  const modeEvents = await functionModeEvents();
  return { rows, unclassified, stale, sdkEvents, modeEvents, areas: areasDocument, sdkOnly };
}

function cell(value) {
  return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
}

export function renderMatrix(matrix) {
  const { rows, sdkEvents, modeEvents, sdkOnly } = matrix;
  const runtime = rows.filter(row => RUNTIME_KINDS.has(row.kind));
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  for (const row of runtime) counts[row.status] += 1;
  const memberRows = runtime.flatMap(row => row.members.map(member => ({ row, member })));
  const memberCounts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  for (const { member } of memberRows) memberCounts[member.status] += 1;
  const lines = ['# Matriz automática de paridade', '',
    'Gerada por `scripts/parity-matrix.mjs` a partir dos `.d.ts` de `@fluxerjs/core`, `@fluxerjs/builders` e `@fluxerjs/types` instalados. '
    + 'Atualize com `npm run docs:generate`. Não edite à mão.', '',
    '## Como ler', '',
    '- **coberto-script**: o nome é alcançado pelo caminho `builtins → ports → adaptador do SDK`.',
    '- **coberto-nativo**: o código do Yuzuha usa o nome do SDK, mas nenhuma função `$` o alcança.',
    '- **só-SDK**: exceção intencional, com motivo em `scripts/parity-areas.json`.',
    '- **lacuna**: nenhum dos caminhos acima alcança o nome. Vira candidato a função ou a recurso.',
    '- **dados**: tipos e enums, sem comportamento próprio.', '',
    'A cobertura é por nome: um método `send` de uma classe conta como coberto se qualquer adaptador usar `send`. '
    + 'Use a matriz como lista de revisão, não como prova de cobertura.', '',
    '## Resumo por export', '', '| Status | Exports de runtime | Membros |', '|---|---:|---:|'];
  for (const status of STATUSES.filter(status => status !== 'dados')) lines.push(`| ${status} | ${counts[status]} | ${memberCounts[status]} |`);
  lines.push('', `Pacotes: ${[...new Set(rows.map(row => row.package))].join(', ')}. Tipos e enums são listados, mas não contam como lacuna.`, '');

  lines.push('## Exports de runtime', '', '| Pacote | Export | Tipo | Área | Status | Evidência |', '|---|---|---|---|---|---|');
  for (const row of runtime.sort((a, b) => a.package.localeCompare(b.package) || a.name.localeCompare(b.name))) {
    lines.push(`| ${cell(row.package)} | \`${cell(row.name)}\` | ${row.kind} | ${cell(row.area ?? (sdkOnly.has(row.name) ? 'só SDK' : ''))} | ${row.status} | ${cell(row.evidence)} |`);
  }
  lines.push('');

  lines.push('## Métodos e propriedades de classes', '', '| Classe | Membro | Tipo | Status |', '|---|---|---|---|');
  for (const { row, member } of memberRows.sort((a, b) => a.row.name.localeCompare(b.row.name) || a.member.name.localeCompare(b.member.name))) {
    lines.push(`| \`${cell(row.name)}\` | \`${cell(member.name)}\` | ${member.kind} | ${member.status} |`);
  }
  lines.push('');

  lines.push('## Eventos do cliente', '', 'Comparação entre `ClientEvents` do SDK e `scriptEventNames` do function mode.', '',
    '| Evento | Function mode | Status |', '|---|---|---|');
  for (const event of sdkEvents) {
    const covered = modeEvents.includes(event);
    lines.push(`| \`${event}\` | ${covered ? 'sim' : 'não'} | ${covered ? 'coberto-script' : 'lacuna'} |`);
  }
  lines.push('', `Eventos do function mode que o SDK não declara: ${modeEvents.filter(event => !sdkEvents.includes(event)).join(', ') || 'nenhum'}.`, '');

  lines.push('## Exceções intencionais (só SDK)', '');
  for (const [reason, entry] of Object.entries(matrix.areas.sdkOnly)) {
    lines.push(`- **${reason}** (${entry.exports.map(name => `\`${name}\``).join(', ')}): ${entry.note}`);
  }
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const matrix = await buildParityMatrix();
  if (matrix.unclassified.length || matrix.stale.length) {
    throw new Error(`Classificação de paridade incompleta. Sem área: ${matrix.unclassified.join(', ') || 'nenhum'}. `
      + `Obsoletos em parity-areas.json: ${matrix.stale.join(', ') || 'nenhum'}.`);
  }
  const content = renderMatrix(matrix);
  const path = join(ROOT, 'docs/PARITY-MATRIX.md');
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== content) throw new Error('Matriz de paridade desatualizada. Execute npm run docs:generate.');
    console.log(`Matriz de paridade conferida: ${matrix.rows.length} exports.`);
  } else {
    await writeFile(path, content);
    console.log(`Matriz de paridade gerada: ${matrix.rows.length} exports em ${relative(ROOT, path)}.`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
