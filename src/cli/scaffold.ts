import { mkdir, rm, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { YuzuhaError } from '../errors.js';
import { NODE_REQUIREMENT, packageRoot } from './version.js';

function commandFiles(extension: string, functions: boolean): Record<string, string> {
  const files: Record<string, string> = {
    [`commands/ping.${extension}`]: `import { defineCommand } from 'yuzuha';\n\nexport default defineCommand({\n  name: 'ping',\n  description: 'Latência do bot.',\n  async run(ctx) {\n    await ctx.reply(\`Pong! \${ctx.transport.ping} ms\`);\n  },\n});\n`,
    [`commands/ban.${extension}`]: `import { arg, defineCommand } from 'yuzuha';\n\nexport default defineCommand({\n  name: 'ban',\n  description: 'Bane um membro e registra um caso.',\n  args: {\n    membro: arg.user().required(),\n    motivo: arg.text().rest(),\n  },\n  async run(ctx) {\n    const caso = await ctx.mod.ban(ctx.args.get('membro'), {\n      reason: ctx.args.get('motivo') ?? '',\n    });\n    await ctx.reply(\`Membro banido. Caso #\${caso.id}.\`);\n  },\n});\n`,
    [`commands/hello.${extension}`]: `import { arg, defineCommand } from 'yuzuha';\n\nexport default defineCommand({\n  name: 'hello',\n  description: 'Exemplo de comando nativo com argumento tipado.',\n  args: { nome: arg.text().default('mundo') },\n  async run(ctx) {\n    await ctx.reply(\`Olá, \${ctx.args.get('nome')}!\`);\n  },\n});\n`,
  };
  if (functions) {
    files[`commands/eco.${extension}`] = `import { script } from 'yuzuha/functions';\n\nexport default script({\n  name: 'eco',\n  description: 'Exemplo de function mode.',\n  code: '$reply[$messageSlice[0]]',\n});\n`;
  }
  return files;
}

export async function scaffold(directory: string, language: 'js' | 'ts', functions = false): Promise<void> {
  const root = resolve(directory);
  const name = basename(root).toLowerCase().replace(/[^a-z0-9_-]/g, '-');
  if (!name || name.startsWith('-')) throw new YuzuhaError('INIT_NAME', 'Escolha um nome de diretório válido.');
  const scripts: Record<string, string> = { start: 'yuzuha run', dev: 'yuzuha dev', check: 'yuzuha check' };
  if (language === 'ts') scripts['typecheck'] = 'tsc --noEmit';
  const manifest = { name, version: '0.1.0', private: true, type: 'module', engines: { node: NODE_REQUIREMENT },
    scripts, dependencies: { yuzuha: `file:${packageRoot}` },
    ...(language === 'ts' ? { devDependencies: { typescript: '^5.9.0', '@types/node': '^22.0.0' } } : {}),
  };
  const files: Record<string, string> = {
    ...commandFiles(language, functions),
    'package.json': `${JSON.stringify(manifest, null, 2)}\n`,
    '.env.example': 'FLUXER_BOT_TOKEN=\n',
    '.gitignore': 'node_modules/\n.env\ndata/\n',
    [`yuzuha.config.${language}`]: `import { defineConfig } from 'yuzuha';\n\nexport default defineConfig({\n  name: ${JSON.stringify(name)},\n  prefix: '!',\n  commands: './commands',\n});\n`,
    'README.md': `# ${name}\n\nBot do Fluxer com Yuzuha.\n\n1. Execute \`npm install\`.\n2. Execute \`npm run check\` para validar offline.\n3. Copie \`.env.example\` para \`.env\` e preencha o token.\n4. Execute \`npm run dev\` ou \`npm start\`.\n\nComandos: \`!ping\`, \`!hello\`, \`!ban @membro motivo\`.\n\nA dependência local aponta para a instalação que gerou este projeto.\nCasos e variáveis ficam no diretório XDG de dados do Yuzuha, sob o nome deste bot.\n`,
  };
  if (language === 'ts') files['tsconfig.json'] = `${JSON.stringify({ compilerOptions: { target: 'ES2023', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, noEmit: true }, include: ['**/*.ts'] }, null, 2)}\n`;
  await mkdir(root, { recursive: false });
  try {
    await mkdir(join(root, 'commands'));
    for (const [file, content] of Object.entries(files)) await writeFile(join(root, file), content, { flag: 'wx', mode: 0o644 });
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
  console.log(`Criado: ${root}\nEntre no diretório e execute npm install e npm run check.`);
}
