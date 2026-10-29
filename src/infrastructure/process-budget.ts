import { YuzuhaError } from '../shared/errors.js';

const PROCESS_LIMIT = 2;
let active = 0;

export function acquireImageProcess(): () => void {
  if (active >= PROCESS_LIMIT) throw new YuzuhaError('EXECUTION_LIMIT', 'Limite de dois processos de imagem simultâneos atingido.');
  active++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active--;
  };
}

export function activeImageProcesses(): number { return active; }
