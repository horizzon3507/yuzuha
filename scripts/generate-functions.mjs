import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Runtime, registerBuiltins } from '../dist/functions.js';

const functions = registerBuiltins(new Runtime()).functions();
const categories = [...new Set(functions.map(fn => fn.category))].sort();
const lines = ['# Referência das funções', '',
  'Function mode opcional, importado de `yuzuha/functions`.',
  `Gerada do registro executável: **${functions.length} funções**. Atualize com \`npm run docs:generate\`.`, '',
  'Aliases não contam como funções adicionais. Índices e semântica estão em [LANGUAGE.md](LANGUAGE.md).', ''];
for (const category of categories) {
  lines.push(`## ${category}`, '', '| Função | Descrição | Aliases |', '|---|---|---|');
  for (const fn of functions.filter(fn => fn.category === category).sort((a, b) => a.name.localeCompare(b.name))) {
    const cell = s => s.replaceAll('|', '\\|').replaceAll('\n', ' ');
    lines.push(`| \`${cell(fn.usage)}\` | ${cell(fn.description)} | ${(fn.aliases ?? []).map(a => `\`$${a}\``).join(', ')} |`);
  }
  lines.push('');
}
const content = lines.join('\n');
const metadata = `${JSON.stringify(functions.map(({ execute: _execute, ...fn }) => fn), null, 2)}\n`;
const metadataPath = fileURLToPath(new URL('../editors/vscode/functions.json', import.meta.url));
const path = fileURLToPath(new URL('../docs/FUNCTIONS.md', import.meta.url));
if (process.argv.includes('--check')) {
  if (await readFile(path, 'utf8') !== content) throw new Error('Referência de funções desatualizada. Execute npm run docs:generate.');
  if (await readFile(metadataPath, 'utf8') !== metadata) throw new Error('Metadados do editor desatualizados. Execute npm run docs:generate.');
} else { await writeFile(path, content); await writeFile(metadataPath, metadata); }
console.log(`Referência conferida: ${functions.length} funções.`);
