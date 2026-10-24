import { text } from '../values.js';
import { loopFrame, setLoopFrame, LoopControl } from '../control-flow.js';
import { YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'] as const;

function headers(raw: string): Record<string, string> {
  const result: Record<string, string> = {};
  const entries = raw.split(/\n|,(?=\s*[A-Za-z0-9-]+\s*:)/);
  for (const entry of entries) {
    const text = entry.trim();
    if (!text) continue;
    const separator = text.indexOf(':');
    if (separator <= 0) throw new YuzuhaError('HTTP_HEADER', `Cabeçalho inválido: ${text}. Use "Nome: valor".`);
    const name = text.slice(0, separator).trim();
    const value = text.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9-]+$/.test(name)) throw new YuzuhaError('HTTP_HEADER', `Nome de cabeçalho inválido: ${name}.`);
    if (/[\r\n]/.test(value)) throw new YuzuhaError('HTTP_HEADER', 'Valor de cabeçalho não pode conter quebras de linha.');
    result[name] = value;
  }
  return result;
}

function method(raw: string): string {
  const value = raw.trim().toUpperCase();
  if (!METHODS.includes(value as typeof METHODS[number])) {
    throw new YuzuhaError('HTTP_METHOD', `Método HTTP inválido: ${raw}. Use ${METHODS.join(', ')}.`);
  }
  return value;
}

export const httpFunctions = defineFunctions(fn => {
  fn('httpChunk', 'network', 0, 0, '', 'Trecho UTF-8 atual de httpStream; vazio fora do callback.', c => c.ctx.vars.get('__httpChunk') ?? '');
  fn('httpChunkIndex', 'network', 0, 0, '', 'Índice do trecho textual de httpStream, começando em zero; vazio fora dele.', c => c.ctx.vars.get('__httpChunkIndex') ?? '');
  fn('httpStream', 'network', 3, 5, '[método;url;callback;corpo?;cabeçalhos?]', 'Consome resposta por trechos UTF-8 e reavalia callback; até 1000 chunks, com backpressure, cancelamento e política HTTP do comando.', async c => {
    const requestMethod = method(await c.text(0)), url = await c.text(1);
    const body = c.count > 3 ? await c.text(3) : undefined;
    const response = await c.wait(c.ctx.http.stream({ method: requestMethod, url,
      ...(body ? { body } : {}), ...(c.count > 4 ? { headers: headers(await c.text(4)) } : {}) }));
    const reader = response.body.getReader(), decoder = new TextDecoder();
    const keys = ['__httpChunk', '__httpChunkIndex'];
    const saved = new Map(keys.filter(key => c.ctx.vars.has(key)).map(key => [key, c.ctx.vars.get(key)]));
    const previousFrame = loopFrame(c.ctx), frame = {};
    let result = '', index = 0, chunks = 0, stop = false;
    const consume = async (chunk: string): Promise<void> => {
      if (!chunk) return;
      c.checkOutput(chunk);
      c.ctx.vars.set('__httpChunk', chunk); c.ctx.vars.set('__httpChunkIndex', index++);
      setLoopFrame(c.ctx, frame);
      try { result += text(await c.fresh(2)); c.checkOutput(result); }
      catch (error) {
        if (!(error instanceof LoopControl) || error.frame !== frame) throw error;
        stop = error.action === 'break';
      }
    };
    try {
      for (;;) {
        const next = await c.wait(reader.read());
        if (next.done) { await consume(decoder.decode()); break; }
        if (++chunks > 1000) throw new YuzuhaError('EXECUTION_LIMIT', 'Streaming excede 1000 chunks.');
        await consume(decoder.decode(next.value, { stream: true }));
        if (stop) break;
      }
      return result;
    } finally {
      // Source cancellation may never settle; cleanup must not hold the command open.
      void reader.cancel().catch(() => {});
      reader.releaseLock();
      for (const key of keys) {
        if (saved.has(key)) c.ctx.vars.set(key, saved.get(key)); else c.ctx.vars.delete(key);
      }
      setLoopFrame(c.ctx, previousFrame);
    }
  });
  fn('httpMultipart', 'network', 3, 4, '[método;url;partes;cabeçalhos?]', 'Envia partes de formulário com value textual ou base64 binário; retorna o corpo da resposta.', async c => {
    const requestMethod = method(await c.text(0));
    if (requestMethod === 'GET' || requestMethod === 'HEAD') throw new YuzuhaError('HTTP_BODY', `${requestMethod} não aceita corpo.`);
    const parts: unknown = await c.arg(2);
    if (!Array.isArray(parts) || !parts.length || parts.length > 100) throw new YuzuhaError('HTTP_MULTIPART', 'Informe de 1 a 100 partes.');
    const input = parts.map((part: unknown) => {
      if (!part || typeof part !== 'object' || Array.isArray(part)) throw new YuzuhaError('HTTP_MULTIPART', 'Parte inválida.');
      const data = part as Record<string, unknown>;
      if (Object.keys(data).some(key => !['name', 'value', 'base64', 'filename', 'contentType'].includes(key))
        || typeof data['name'] !== 'string' || (data['filename'] !== undefined && typeof data['filename'] !== 'string')
        || (data['contentType'] !== undefined && typeof data['contentType'] !== 'string')
        || (data['base64'] !== undefined && data['value'] !== undefined)) throw new YuzuhaError('HTTP_MULTIPART', 'Campos de parte inválidos.');
      let value: string | Uint8Array;
      if (data['base64'] !== undefined) {
        if (typeof data['base64'] !== 'string' || data['base64'].length > 13_333_336
          || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(data['base64'])) throw new YuzuhaError('HTTP_MULTIPART', 'Base64 inválido ou excessivo.');
        const bytes = Buffer.from(data['base64'], 'base64');
        if (bytes.toString('base64') !== data['base64']) throw new YuzuhaError('HTTP_MULTIPART', 'Base64 deve usar a forma canônica.');
        value = bytes;
      } else {
        if (typeof data['value'] !== 'string') throw new YuzuhaError('HTTP_MULTIPART', 'Parte precisa de value textual ou base64.');
        value = data['value'];
      }
      return { name: data['name'], value, filename: data['filename'] as string | undefined, contentType: data['contentType'] as string | undefined };
    });
    return (await c.wait(c.ctx.http.multipart({ method: requestMethod, url: await c.text(1), parts: input,
      ...(c.count > 3 ? { headers: headers(await c.text(3)) } : {}) }))).body;
  });
  fn('http', 'network', 2, 4, '[método;url;corpo?;cabeçalhos?]', 'Executa requisição HTTP com timeout e limite de resposta; retorna o corpo.', async c => {
    const requestMethod = method(await c.text(0));
    const url = (await c.text(1)).trim();
    if (!url) throw new YuzuhaError('HTTP_URL', 'Informe a URL da requisição.');
    const body = c.count > 2 ? await c.text(2) : undefined;
    if (body && (requestMethod === 'GET' || requestMethod === 'HEAD')) {
      throw new YuzuhaError('HTTP_BODY', `${requestMethod} não aceita corpo.`);
    }
    const response = await c.wait(c.ctx.http.request({
      method: requestMethod,
      url,
      ...(body === undefined || body === '' ? {} : { body }),
      ...(c.count > 3 ? { headers: headers(await c.text(3)) } : {}),
    }));
    return response.body;
  });
  fn('httpJson', 'network', 2, 4, '[método;url;corpo?;cabeçalhos?]', 'Como $http, mas decodifica a resposta como JSON.', async c => {
    const requestMethod = method(await c.text(0));
    const url = (await c.text(1)).trim();
    if (!url) throw new YuzuhaError('HTTP_URL', 'Informe a URL da requisição.');
    const body = c.count > 2 ? await c.text(2) : undefined;
    const requestHeaders = c.count > 3 ? headers(await c.text(3)) : {};
    if (body && (requestMethod === 'GET' || requestMethod === 'HEAD')) {
      throw new YuzuhaError('HTTP_BODY', `${requestMethod} não aceita corpo.`);
    }
    if (body && !Object.keys(requestHeaders).some(name => name.toLowerCase() === 'content-type')) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    const response = await c.wait(c.ctx.http.request({
      method: requestMethod,
      url,
      ...(body === undefined || body === '' ? {} : { body }),
      ...(Object.keys(requestHeaders).length ? { headers: requestHeaders } : {}),
    }));
    if (!response.body.trim()) return null;
    try {
      return JSON.parse(response.body) as unknown;
    } catch (cause) {
      throw new YuzuhaError('HTTP_JSON', 'Resposta não é JSON válido.', { cause });
    }
  });
});
