import { register } from 'tsx/esm/api';

let registered = false;

export async function importModule(url: string): Promise<{ default?: unknown }> {
  if (!registered) { register(); registered = true; }
  return import(url);
}
