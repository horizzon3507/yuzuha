// Cobertura explícita; nunca inferida por coincidências de nomes.
import ts from 'typescript';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const SDK_PACKAGES = ['core', 'builders', 'types', 'voice', 'sharding', 'rest', 'ws', 'collection', 'util']
  .map(name => ({ name: '@fluxerjs/' + name, entry: 'node_modules/@fluxerjs/' + name + '/dist/index.d.ts' }));
export const AREAS = ['pure', 'resources', 'entities', 'events', 'voice'];
const STATUSES = ['function', 'equivalent', 'excluded', 'pending'];
const REASONS = ['internal', 'credentials', 'lifecycle', 'eval', 'raw-transport', 'data-only'];

function exportKind(symbol) {
  for (const [flag, kind] of [[ts.SymbolFlags.Class, 'class'], [ts.SymbolFlags.Function, 'function'],
    [ts.SymbolFlags.Interface, 'interface'], [ts.SymbolFlags.TypeAlias, 'type'],
    [ts.SymbolFlags.Enum, 'enum'], [ts.SymbolFlags.Variable, 'variable']]) {
    if (symbol.flags & flag) return kind;
  }
  return 'other';
}

/** Membros próprios; herdados aparecem no export de origem. */
export function inventorySDK() {
  const program = ts.createProgram(SDK_PACKAGES.map(pkg => join(ROOT, pkg.entry)), {
    skipLibCheck: true, noEmit: true, module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler, target: ts.ScriptTarget.ES2022,
  });
  const checker = program.getTypeChecker(), items = [];
  for (const pkg of SDK_PACKAGES) {
    const file = program.getSourceFile(join(ROOT, pkg.entry));
    const module = file && checker.getSymbolAtLocation(file);
    if (!module) throw new Error('SDK ausente: ' + pkg.name + '; execute npm ci com peers de desenvolvimento.');
    for (const exported of checker.getExportsOfModule(module)) {
      const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
      const kind = exportKind(symbol), id = pkg.name + '#' + exported.name;
      items.push({ id, package: pkg.name, name: exported.name, kind, scope: 'export' });
      if (kind === 'class') {
        const seen = new Set();
        for (const declaration of symbol.declarations?.filter(ts.isClassDeclaration) ?? []) {
          for (const member of declaration.members) {
            const flags = ts.getCombinedModifierFlags(member);
            if (flags & ts.ModifierFlags.Private || member.name && ts.isPrivateIdentifier(member.name)) continue;
            const name = ts.isConstructorDeclaration(member) ? 'constructor' : member.name?.getText();
            if (!name) continue;
            const memberID = id + '.' + (flags & ts.ModifierFlags.Static ? 'static:' : '') + name;
            if (seen.has(memberID)) continue;
            seen.add(memberID);
            items.push({ id: memberID, package: pkg.name, name: exported.name, member: name, scope: 'member',
              protected: Boolean(flags & ts.ModifierFlags.Protected),
              kind: ts.isConstructorDeclaration(member) ? 'constructor' : ts.isMethodDeclaration(member) ? 'method'
                : ts.isGetAccessor(member) || ts.isSetAccessor(member) ? 'accessor' : 'property' });
          }
        }
      }
      if (/Events$/.test(exported.name) && (kind === 'interface' || kind === 'type')) {
        for (const event of checker.getPropertiesOfType(checker.getDeclaredTypeOfSymbol(symbol))) {
          items.push({ id: id + ':' + event.name, package: pkg.name, name: exported.name,
            event: event.name, scope: 'event', kind: 'event' });
        }
      }
    }
  }
  return items.sort((a, b) => a.id.localeCompare(b.id));
}

export async function loadMappings(directory = join(ROOT, 'scripts/parity')) {
  const entries = [];
  for (const file of (await readdir(directory)).filter(name => name.endsWith('.jsonl')).sort()) {
    const area = file.slice(0, -6);
    if (!AREAS.includes(area)) throw new Error('Área inválida: ' + file);
    for (const [index, line] of (await readFile(join(directory, file), 'utf8')).split('\n').entries()) {
      if (!line.trim()) continue;
      try { entries.push({ ...JSON.parse(line), file: area }); }
      catch (error) { throw new Error(file + ':' + (index + 1) + ': JSON inválido', { cause: error }); }
    }
  }
  return entries;
}

export async function functionModeEvents() {
  const source = await readFile(join(ROOT, 'src/framework/script-events.ts'), 'utf8');
  const file = ts.createSourceFile('script-events.ts', source, ts.ScriptTarget.Latest, true);
  for (const statement of file.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (declaration.name.getText(file) === 'scriptEventNames') {
        return [...declaration.initializer.getText(file).matchAll(/'([A-Za-z]+)'/g)].map(match => match[1]);
      }
    }
  }
  throw new Error('scriptEventNames ausente.');
}

export function validateMappings(items, entries, functions, events = []) {
  const known = new Map(items.map(item => [item.id, item])), mapped = new Map(), errors = [];
  for (const entry of entries) {
    const label = entry.id ?? '<sem id>';
    if (mapped.has(entry.id)) errors.push('Duplicado: ' + label);
    mapped.set(entry.id, entry);
    if (!known.has(entry.id)) errors.push('Obsoleto: ' + label);
    if (!STATUSES.includes(entry.status)) errors.push('Status inválido: ' + label);
    if (!AREAS.includes(entry.area) || entry.file && entry.file !== entry.area) errors.push('Área inválida: ' + label);
    if (typeof entry.note !== 'string' || !entry.note.trim()) errors.push('Sem justificativa: ' + label);
    if (entry.status === 'function' || entry.status === 'equivalent') {
      if (!Array.isArray(entry.functions) || !entry.functions.length) errors.push('Sem funções: ' + label);
      else for (const name of entry.functions) if (!functions.has(name)) errors.push('Função desconhecida ' + name + ': ' + label);
      const item = known.get(entry.id);
      if (item?.scope === 'event' && (item.name !== 'ClientEvents' || !events.includes(item.event))) {
        errors.push('Evento sem adaptação de script: ' + label);
      }
    } else if (entry.functions !== undefined) errors.push('Funções em status ' + entry.status + ': ' + label);
    if (entry.status === 'excluded') {
      if (!REASONS.includes(entry.reason)) errors.push('Motivo inválido: ' + label);
    } else if (entry.reason !== undefined) errors.push('Motivo fora de excluded: ' + label);
  }
  return { mapped, errors, unclassified: items.filter(item => !mapped.has(item.id)).map(item => item.id),
    stale: entries.filter(entry => !known.has(entry.id)).map(entry => entry.id) };
}

export function summarize(items) {
  const counts = Object.fromEntries(STATUSES.map(status => [status, 0]));
  const pending = Object.fromEntries(AREAS.map(area => [area, 0]));
  for (const item of items) {
    if (item.status in counts) counts[item.status]++;
    if (item.status === 'pending') pending[item.area]++;
  }
  const covered = counts.function + counts.equivalent, safe = covered + counts.pending;
  return { counts, pending, covered, safe, coverage: safe ? covered / safe * 100 : 100 };
}

export function assertComplete(matrix, release = false) {
  const errors = [...matrix.errors, ...matrix.unclassified.map(id => 'Sem classificação: ' + id)];
  if (release && matrix.summary.counts.pending) errors.push('Release exige zero pending: ' + matrix.summary.counts.pending);
  if (errors.length) throw new Error(errors.join('\n'));
}

export async function buildParityMatrix() {
  const inventory = inventorySDK(), entries = await loadMappings();
  const metadata = JSON.parse(await readFile(join(ROOT, 'editors/vscode/functions.json'), 'utf8'));
  const functions = new Set(metadata.flatMap(fn => [fn.name, ...(fn.aliases ?? [])]).map(name => '$' + name));
  const modeEvents = await functionModeEvents();
  const validation = validateMappings(inventory, entries, functions, modeEvents);
  const items = inventory.map(item => ({ ...item, ...validation.mapped.get(item.id) }));
  return { ...validation, items, rows: items.filter(item => item.scope === 'export'),
    sdkEvents: inventory.filter(item => item.name === 'ClientEvents' && item.scope === 'event').map(item => item.event),
    modeEvents, summary: summarize(items) };
}

function cell(value) { return String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' '); }

export function renderMatrix(matrix) {
  const { counts, pending, covered, safe, coverage } = matrix.summary;
  const lines = ['# Matriz automática de paridade', '',
    'Gerada de declarações instaladas e de `scripts/parity/*.jsonl`. Atualize com `npm run docs:generate`; não edite à mão.', '',
    '## Contrato semântico do function mode', '',
    'Paridade significa toda operação segura do SDK alcançável por scripts, com exclusões justificadas. '
    + 'Não é inferida por nomes usados no código nativo. Cada ID inclui pacote, export e membro ou evento.', '',
    '- **function**: operação alcançada pelas funções listadas.',
    '- **equivalent**: comportamento equivalente por composição de funções existentes, descrito na justificativa.',
    '- **excluded**: fora da linguagem por segurança ou por não representar operação; categoria e motivo visíveis.',
    '- **pending**: operação segura reservada à área indicada; permitida durante desenvolvimento, não no gate de release.', '',
    '**Function-mode safe coverage: ' + coverage.toFixed(2) + '%** (' + covered + '/' + safe + '). '
    + 'Denominador = function + equivalent + pending; excluded não entra. Cada linha é uma unidade, '
    + 'inclusive reexports em pacotes distintos; não é uma medição de testes ou completude de parâmetros.', '',
    'Inventário: todos os exports (inclusive tipos), membros próprios não privados de classes, construtores '
    + 'e eventos dos contratos exportados *Events. Membros herdados aparecem no export de origem. '
    + 'Enums/constantes de runtime precisam de classificação operacional; interfaces e aliases são data-only. '
    + 'APIs novas exigem revisão explícita.', '',
    'Pacotes: ' + SDK_PACKAGES.map(pkg => pkg.name).join(', ') + '.', '',
    '| Status | Itens |', '|---|---:|'];
  for (const status of STATUSES) lines.push('| ' + status + ' | ' + counts[status] + ' |');
  lines.push('', '## Pendências por área', '', '| Área | Itens pending |', '|---|---:|');
  for (const area of AREAS) lines.push('| ' + area + ' | ' + pending[area] + ' |');
  for (const area of AREAS) {
    lines.push('', '## ' + area, '', '| ID | Tipo | Status | Funções / exclusão | Justificativa |', '|---|---|---|---|---|');
    for (const item of matrix.items.filter(item => item.area === area)) {
      lines.push('| `' + cell(item.id) + '` | ' + item.kind + ' | ' + item.status + ' | '
        + cell(item.functions?.join(', ') ?? item.reason ?? '') + ' | ' + cell(item.note) + ' |');
    }
  }
  return lines.join('\n') + '\n';
}

async function main() {
  const matrix = await buildParityMatrix();
  assertComplete(matrix, process.argv.includes('--release'));
  const content = renderMatrix(matrix), path = join(ROOT, 'docs/PARITY-MATRIX.md');
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== content) throw new Error('Matriz de paridade desatualizada. Execute npm run docs:generate.');
    console.log('Matriz semântica conferida: ' + matrix.items.length + ' itens; safe coverage '
      + matrix.summary.coverage.toFixed(2) + '%; pending ' + matrix.summary.counts.pending + '.');
  } else {
    await writeFile(path, content);
    console.log('Matriz semântica gerada: ' + matrix.items.length + ' itens.');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
