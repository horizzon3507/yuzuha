import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const run = promisify(execFile);
await run(process.execPath, ['scripts/build.mjs'], { cwd: root });
await run(process.execPath, ['scripts/generate-functions.mjs'], { cwd: root });
const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
await mkdir(new URL('../artifacts/', import.meta.url), { recursive: true });
const output = fileURLToPath(new URL(`../artifacts/yuzuha-language-${manifest.version}.vsix`, import.meta.url));
const { stdout, stderr } = await run('npx', ['--yes', '@vscode/vsce', 'package', '--no-dependencies', '--allow-missing-repository', '--out', output],
  { cwd: fileURLToPath(new URL('../editors/vscode/', import.meta.url)), maxBuffer: 4_000_000 });
if (stdout) process.stdout.write(stdout);
if (stderr) process.stderr.write(stderr);
console.log(output);
