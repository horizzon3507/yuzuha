import type { CommandContext } from '../context.js';
import { YuzuhaError } from '../errors.js';
import type { Middleware } from './options.js';

export async function runMiddleware(chain: readonly Middleware[], ctx: CommandContext, execute: () => Promise<void>): Promise<void> {
  let last = -1;
  async function dispatch(index: number): Promise<void> {
    if (index <= last) throw new YuzuhaError('MIDDLEWARE', 'next() só pode ser chamado uma vez.');
    last = index;
    const middleware = chain[index];
    if (middleware) await middleware(ctx, () => dispatch(index + 1));
    else await execute();
  }
  await dispatch(0);
}
