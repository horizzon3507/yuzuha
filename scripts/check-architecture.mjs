import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.name.endsWith('.ts')) result.push(path);
  }
  return result;
}
const modules = await files(root), known = new Set(modules), graph = new Map();
for (const path of modules) {
  const source = ts.createSourceFile(path, await readFile(path, 'utf8'), ts.ScriptTarget.Latest, true);
  const dependencies = new Set();
  function visit(node) {
    const specifier = ts.isImportDeclaration(node) || ts.isExportDeclaration(node) ? node.moduleSpecifier
      : ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword ? node.arguments[0] : undefined;
    if (specifier && ts.isStringLiteral(specifier) && specifier.text.startsWith('.')) {
      const target = resolve(dirname(path), specifier.text.replace(/\.js$/, '.ts'));
      if (known.has(target)) dependencies.add(target);
    }
    ts.forEachChild(node, visit);
  }
  visit(source); graph.set(path, dependencies);
}
const layers = {
  domain: new Set(['domain', 'shared']),
  ports: new Set(['ports', 'domain', 'shared']),
  services: new Set(['services', 'ports', 'domain', 'shared']),
  scripting: new Set(['scripting', 'commands', 'services', 'ports', 'domain', 'shared']),
};
const violations = [];
for (const origin of modules) {
  const layer = relative(root, origin).split('/')[0], allowed = layers[layer];
  if (!allowed) continue;
  const visited = new Set();
  function follow(path, chain) {
    if (visited.has(path)) return; visited.add(path);
    const name = relative(root, path), targetLayer = name.split('/')[0];
    if (name.includes('/') && !allowed.has(targetLayer)) {
      violations.push(`${relative(root, origin)} -> ${chain.join(' -> ')}: ${targetLayer} fora da camada ${layer}`);
      return;
    }
    for (const dependency of graph.get(path) ?? []) follow(dependency, [...chain, relative(root, dependency)]);
  }
  follow(origin, []);
}
if (violations.length) throw new Error(`Dependências de arquitetura inválidas:\n${violations.join('\n')}`);
console.log(`Arquitetura conferida: ${modules.length} módulos; domínio, ports, serviços e scripting isolados.`);
