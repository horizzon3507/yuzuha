import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { YuzuhaError } from '../../errors.js';

export function defaultDataPath(name = 'default'): string {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new YuzuhaError('STORE_NAME', 'Nome de store inválido.');
  const configured = process.env.XDG_DATA_HOME;
  const dataHome = configured && isAbsolute(configured) ? configured : join(homedir(), '.local', 'share');
  return join(dataHome, 'yuzuha', name, 'state.json');
}
