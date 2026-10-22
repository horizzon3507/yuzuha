import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
async function markdown(directory) {
  const paths = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await markdown(path));
    else if (entry.name.endsWith('.md')) paths.push(path);
  }
  return paths;
}
const files = [...(await readdir(root)).filter(name => name.endsWith('.md')).map(name => join(root, name)), ...await markdown(join(root, 'docs'))];
const failures = [];
for (const file of files) {
  const content = await readFile(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(?:[a-z]+:|\/\/)/i.test(target)) continue;
    try { await access(resolve(dirname(file), decodeURIComponent(target))); }
    catch { failures.push(`${file}:${content.slice(0, match.index).split('\n').length}: link ausente ${target}`); }
  }
}
const manifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
if (lock.version !== manifest.version || lock.packages[''].version !== manifest.version) failures.push('package.json e lockfile têm versões diferentes.');
const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## v${manifest.version} · `)) failures.push('O changelog não contém a versão do pacote no formato Hory.');
if (failures.length) throw new Error(failures.join('\n'));
console.log(`Documentação conferida: ${files.length} arquivos, links locais e versão ${manifest.version}.`);
