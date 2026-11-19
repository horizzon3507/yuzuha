import { FluxerAPIError, HTTPError, RateLimitError } from '@fluxerjs/rest';
import { APIErrorCode } from '@fluxerjs/types';
import { ErrorCodes, FluxerError } from '@fluxerjs/util';
import { GuardError, ScriptError } from '../../errors.js';
import { defineFunctions } from './definition.js';

const codes = new Set<string>([...Object.values(ErrorCodes), ...Object.values(APIErrorCode)]);
const methods = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export const pureErrorFunctions = defineFunctions(fn => {
  fn('sdkError', 'sdk', 2, 2, '[infoOuTextoOuIsFluxer;operação]',
    'Executa uma vez e captura só erros reais do SDK. info retorna metadados permitidos, text resume tipo/código e isFluxer testa FluxerError. Em caso de sucesso retorna null ou false. Nunca expõe mensagem, URL, corpo ou causa; outros erros se propagam.',
    async c => {
      const op = await c.text(0);
      if (op !== 'info' && op !== 'text' && op !== 'isFluxer') throw new GuardError('Operação de erro SDK inválida.', 'INVALID_ARGUMENT');
      try { await c.arg(1); }
      catch (error) {
        if (!(error instanceof ScriptError) || error.code !== 'FUNCTION_ERROR') throw error;
        const cause: unknown = error.cause;
        const fluxer = FluxerError.isFluxerError(cause);
        if (!fluxer && !(cause instanceof HTTPError) && !(cause instanceof FluxerAPIError)) throw error;
        if (op === 'isFluxer') return fluxer;
        const name = fluxer ? 'FluxerError' : cause instanceof RateLimitError ? 'RateLimitError'
          : cause instanceof FluxerAPIError ? 'FluxerAPIError' : 'HTTPError';
        const code = 'code' in cause && typeof cause.code === 'string' && codes.has(cause.code) ? cause.code : null;
        if (op === 'text') return code ? `${name} [${code}]` : name;
        if (fluxer) return { name, code };
        return {
          name, code, statusCode: Number.isInteger(cause.statusCode) ? cause.statusCode : null,
          isRetryable: cause.isRetryable, method: cause.method && methods.has(cause.method) ? cause.method : null,
          ...(cause instanceof RateLimitError ? {
            retryAfter: Number.isFinite(cause.retryAfter) ? cause.retryAfter : null, global: cause.global === true,
          } : {}),
        };
      }
      return op === 'isFluxer' ? false : null;
    });
});
