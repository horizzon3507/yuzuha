import { PermissionFlags } from '@fluxerjs/core';
import { YuzuhaError } from '../shared/errors.js';

const normalize = (name: string): string => name.replaceAll('_', '').toLowerCase();
const flags = new Map(Object.entries(PermissionFlags).map(([key, value]) => [normalize(key), value]));

export function permission(name: string): bigint {
  const value = flags.get(normalize(name));
  if (typeof value !== 'bigint') throw new YuzuhaError('PERMISSION', `Permissão desconhecida: ${name}.`);
  return value;
}

export function hasPermission(bits: bigint, name: string, owner = false): boolean {
  const needed = permission(name);
  return owner || (bits & PermissionFlags.Administrator) !== 0n || (bits & needed) === needed;
}
