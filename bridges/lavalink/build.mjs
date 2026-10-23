import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, delimiter } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = dirname(fileURLToPath(import.meta.url));
const build = join(root, 'build');
const version = '4.2.2';
const { version: pluginVersion } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const digest = '8cb801e591072c3689fafd71ccf571a95a4ead3cc35dfc045e157d763d89119a';
await mkdir(build, { recursive: true });
const server = process.env.YUZUHA_LAVALINK_JAR ? resolve(process.env.YUZUHA_LAVALINK_JAR) : join(build, `Lavalink-${version}.jar`);
if (!existsSync(server)) {
  const response = await fetch(`https://github.com/lavalink-devs/Lavalink/releases/download/${version}/Lavalink.jar`, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Lavalink download: HTTP ${response.status}`);
  await writeFile(server, Buffer.from(await response.arrayBuffer()));
}
if (createHash('sha256').update(await readFile(server)).digest('hex') !== digest) throw new Error('Lavalink 4.2.2 SHA-256 mismatch.');
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} exited ${result.status}`);
}
run('jar', ['xf', server, 'BOOT-INF/lib'], build);
const dependencies = join(build, 'BOOT-INF/lib');
const classpath = (await readdir(dependencies)).filter(name => name.endsWith('.jar')).map(name => join(dependencies, name)).join(delimiter);
const classes = join(build, 'classes');
await rm(classes, { recursive: true, force: true });
await mkdir(classes, { recursive: true });
const sources = (await readdir(join(root, 'src'))).filter(name => name.endsWith('.java')).map(name => join(root, 'src', name));
run('javac', ['--release', '17', '-parameters', '-classpath', classpath, '-d', classes, ...sources]);
await mkdir(join(classes, 'lavalink-plugins'), { recursive: true });
await writeFile(join(classes, 'lavalink-plugins/yuzuha-audio.properties'), `name=yuzuha-audio\npath=dev.yuzuha.audio\nversion=${pluginVersion}\n`);
const output = join(build, `yuzuha-audio-${pluginVersion}.jar`);
run('jar', ['--create', '--file', output, '-C', classes, '.']);
console.log(output);
