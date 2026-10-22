import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const manifest = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as {
  version: string; engines: { node: string };
};

export const VERSION = manifest.version;
export const NODE_REQUIREMENT = manifest.engines.node;
export const packageRoot = fileURLToPath(new URL('../../', import.meta.url));
