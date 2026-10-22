import { copyFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
try {
  const { stdout, stderr } = await promisify(execFile)(process.execPath,
    [fileURLToPath(new URL('../node_modules/typescript/bin/tsc', import.meta.url)), '-p', 'tsconfig.build.json'], { cwd: root });
  if (stdout) process.stdout.write(stdout);
  if (stderr) process.stderr.write(stderr);
  await copyFile(new URL('../dist/tooling/language.js', import.meta.url), new URL('../editors/vscode/language.mjs', import.meta.url));
  await copyFile(new URL('../dist/tooling/language.js.map', import.meta.url), new URL('../editors/vscode/language.js.map', import.meta.url));
  await copyFile(new URL('../dist/tooling/language.d.ts', import.meta.url), new URL('../editors/vscode/language.d.mts', import.meta.url));
  await copyFile(new URL('../LICENSE', import.meta.url), new URL('../editors/vscode/LICENSE', import.meta.url));
} catch (error) {
  process.stderr.write(error.stdout ?? '');
  process.stderr.write(error.stderr ?? '');
  process.exitCode = 1;
}
