import { lstat, readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { registerBuiltins } from '../functions.js';
import { Runtime } from '../runtime.js';
import { YuzuhaError } from '../errors.js';
import { documentDiagnostics, mergeFunctionCatalogs, parseFunctionCatalog } from '../tooling/language.js';
import type { FunctionMetadata, ScriptDiagnostic } from '../tooling/language.js';

export interface LintReport {
  valid: boolean;
  offline: true;
  files: number;
  diagnostics: (ScriptDiagnostic & { file: string })[];
}
const extensions = new Map([
  ['.yz', 'yuzuha'], ['.yuzuha', 'yuzuha'], ['.js', 'javascript'], ['.mjs', 'javascript'], ['.cjs', 'javascript'],
  ['.ts', 'typescript'], ['.mts', 'typescript'], ['.cts', 'typescript'], ['.jsx', 'javascriptreact'], ['.tsx', 'typescriptreact'],
]);
const ignored = new Set(['node_modules', '.git', 'dist', 'coverage', 'artifacts']);

export async function builtinCatalog(catalogPaths: readonly string[] = []): Promise<FunctionMetadata[]> {
  if (catalogPaths.length > 16) throw new YuzuhaError('LINT_CATALOG', 'Informe até 16 catálogos.');
  const builtins = registerBuiltins(new Runtime()).functions().map(({ execute: _execute, ...fn }) => fn);
  const catalogs = await Promise.all(catalogPaths.map(async path => {
    try {
      const info = await lstat(resolve(path));
      if (!info.isFile() || info.size > 2_000_000) throw new Error('Catálogo deve ser arquivo JSON de até 2000000 bytes.');
      return parseFunctionCatalog(await readFile(resolve(path), 'utf8'));
    } catch (cause) { throw new YuzuhaError('LINT_CATALOG', 'Não foi possível validar o catálogo JSON.', { cause }); }
  }));
  try { return mergeFunctionCatalogs(builtins, ...catalogs); }
  catch (cause) { throw new YuzuhaError('LINT_CATALOG', 'Catálogos possuem funções ou aliases duplicados.', { cause }); }
}

/** Inspects text only. Target files and catalogs are never imported. */
export async function lint(input: string, catalogPaths: readonly string[] = []): Promise<LintReport> {
  const catalog = await builtinCatalog(catalogPaths), files: string[] = [];
  async function collect(path: string, depth: number): Promise<void> {
    if (depth > 32) throw new YuzuhaError('LINT_LIMIT', 'Diretório excede 32 níveis.');
    const info = await lstat(path);
    if (info.isSymbolicLink()) return;
    if (info.isDirectory()) {
      const entries = await readdir(path, { withFileTypes: true });
      if (entries.length > 10_000) throw new YuzuhaError('LINT_LIMIT', 'Diretório excede 10000 entradas.');
      for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
        if (!ignored.has(entry.name) && !entry.isSymbolicLink()) await collect(join(path, entry.name), depth + 1);
      }
    } else if (info.isFile() && extensions.has(extname(path)) && !/\.d\.(?:ts|mts|cts)$/.test(path)) {
      if (info.size > 2_000_000) throw new YuzuhaError('LINT_LIMIT', 'Arquivo excede 2000000 bytes.');
      files.push(path);
      if (files.length > 1000) throw new YuzuhaError('LINT_LIMIT', 'Lint aceita até 1000 arquivos por chamada.');
    }
  }
  const root = resolve(input), info = await lstat(root);
  if (info.isSymbolicLink() || (!info.isDirectory() && (!info.isFile() || !extensions.has(extname(root))))) {
    throw new YuzuhaError('LINT_INPUT', 'Informe um arquivo de script/JS/TS ou diretório, sem link simbólico.');
  }
  await collect(root, 0);
  const diagnostics: LintReport['diagnostics'] = [];
  let bytes = 0;
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    bytes += Buffer.byteLength(source);
    if (source.length > 2_000_000 || bytes > 20_000_000) throw new YuzuhaError('LINT_LIMIT', 'Lint excede o limite de leitura de arquivos.');
    diagnostics.push(...documentDiagnostics(source, extensions.get(extname(file))!, catalog).map(value => ({ file, ...value })));
    if (diagnostics.length > 10_000) throw new YuzuhaError('LINT_LIMIT', 'Lint excede 10000 diagnósticos.');
  }
  return { valid: diagnostics.length === 0, offline: true, files: files.length, diagnostics };
}
