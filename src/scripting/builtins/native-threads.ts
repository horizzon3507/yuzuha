import { YuzuhaError } from '../../errors.js';
import { defineFunctions } from './definition.js';
import { userID } from '../../domain/values.js';

const DURATIONS = [60, 1440, 4320, 10080];

function archiveDuration(raw: string): number {
  if (!raw.trim()) return 1440;
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || !DURATIONS.includes(value)) {
    throw new YuzuhaError('THREAD_ARCHIVE', 'Arquivamento deve ser 60, 1440, 4320 ou 10080 minutos.');
  }
  return value;
}

function lockedFlag(raw: string): boolean {
  const value = raw.trim().toLowerCase();
  if (!value) return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new YuzuhaError('THREAD_LOCK', 'Bloquear aceita true ou false.');
}

export const threadFunctions = defineFunctions(fn => {
  fn('activeThreads', 'threads', 0, 0, '', 'Lista threads ativas do servidor e suas associações.', async c => {
    return c.ctx.resources.threads.active(c.ctx.requireGuild());
  });
  fn('archivedThreads', 'threads', 1, 4, '[canal;tipo?;limite?;antes?]', 'Pagina threads arquivadas: public/private usam timestamp ISO; joined usa ID.', async c => {
    c.ctx.requireGuild();
    const channelID = (await c.text(0)).trim();
    if (!channelID) throw new YuzuhaError('THREAD_PARENT', 'Informe o canal pai.');
    const type = c.count > 1 ? (await c.text(1)).trim() || 'public' : 'public';
    if (type !== 'public' && type !== 'private' && type !== 'joined') throw new YuzuhaError('THREAD_PAGE', 'Tipo deve ser public, private ou joined.');
    const limit = c.count > 2 && (await c.text(2)).trim() ? Number(await c.text(2)) : 50;
    if (!Number.isSafeInteger(limit) || limit < 2 || limit > 100) throw new YuzuhaError('THREAD_PAGE', 'Limite deve ser entre 2 e 100.');
    const before = c.count > 3 ? (await c.text(3)).trim() || undefined : undefined;
    if (before !== undefined && (type === 'joined' ? !/^\d+$/.test(before)
      : !/^\d{4}-\d{2}-\d{2}T/.test(before) || !Number.isFinite(Date.parse(before)))) {
      throw new YuzuhaError('THREAD_CURSOR', 'Cursor inválido para o tipo de paginação.');
    }
    return c.ctx.resources.threads.archived(channelID, { type, limit, before });
  });
  for (const [name, method] of [['addThreadMember', 'addMember'], ['removeThreadMember', 'removeMember']] as const) {
    fn(name, 'threads', 2, 2, '[thread;usuário]', 'Adiciona ou remove um membro da thread.', async c => {
      c.ctx.requireGuild();
      const threadID = (await c.text(0)).trim();
      if (!threadID) throw new YuzuhaError('THREAD_ID', 'ID da thread é obrigatório.');
      await c.ctx.resources.threads[method](threadID, userID(await c.text(1)));
      return '';
    });
  }
  fn('threadMembers', 'threads', 1, 3, '[thread;limite?;após?]', 'Lista membros da thread com limite de 1 a 100 e cursor por usuário.', async c => {
    c.ctx.requireGuild();
    const threadID = (await c.text(0)).trim();
    if (!threadID) throw new YuzuhaError('THREAD_ID', 'ID da thread é obrigatório.');
    const raw = c.count > 1 ? (await c.text(1)).trim() : '';
    const limit = raw ? Number(raw) : 100;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new YuzuhaError('THREAD_LIMIT', 'Limite deve ser um inteiro entre 1 e 100.');
    const after = c.count > 2 ? (await c.text(2)).trim() || undefined : undefined;
    return c.ctx.resources.threads.members(threadID, limit, after);
  });
  fn('createThread', 'threads', 1, 4, '[nome;canal?;mensagem?;arquivamento?]', 'Cria thread no canal atual ou informado.', async c => {
    c.ctx.requireGuild();
    const name = await c.text(0);
    if (!name.trim()) throw new YuzuhaError('THREAD_NAME', 'Nome da thread é obrigatório.');
    const channelID = c.count > 1 && (await c.text(1)).trim() ? await c.text(1) : c.ctx.message.channelID;
    const messageID = c.count > 2 && (await c.text(2)).trim() ? (await c.text(2)).trim() : undefined;
    const autoArchiveDuration = c.count > 3 ? archiveDuration(await c.text(3)) : 1440;
    return c.ctx.resources.threads.create(channelID, { name: name.trim(), messageID, autoArchiveDuration });
  });
  fn('archiveThread', 'threads', 1, 2, '[thread;bloquear?]', 'Arquiva thread; bloquear aceita true/false.', async c => {
    c.ctx.requireGuild();
    const threadID = await c.text(0);
    if (!threadID.trim()) throw new YuzuhaError('THREAD_ID', 'ID da thread é obrigatório.');
    await c.ctx.resources.threads.archive(threadID.trim(), c.count > 1 ? lockedFlag(await c.text(1)) : false);
    return '';
  });
  fn('unarchiveThread', 'threads', 1, 1, '[thread]', 'Desarquiva thread.', async c => {
    c.ctx.requireGuild();
    const threadID = await c.text(0);
    if (!threadID.trim()) throw new YuzuhaError('THREAD_ID', 'ID da thread é obrigatório.');
    await c.ctx.resources.threads.unarchive(threadID.trim());
    return '';
  });
  fn('forumPost', 'threads', 3, 4, '[canal;título;conteúdo;tags?]', 'Cria post em fórum/mídia; tags separadas por vírgula.', async c => {
    c.ctx.requireGuild();
    const channelID = await c.text(0);
    const name = await c.text(1);
    const content = await c.text(2);
    if (!channelID.trim()) throw new YuzuhaError('THREAD_CHANNEL', 'Canal do fórum é obrigatório.');
    if (!name.trim()) throw new YuzuhaError('THREAD_NAME', 'Título do post é obrigatório.');
    if (!content) throw new YuzuhaError('THREAD_CONTENT', 'Conteúdo do post é obrigatório.');
    const tags = c.count > 3
      ? (await c.text(3)).split(',').map(tag => tag.trim()).filter(Boolean)
      : undefined;
    return c.ctx.resources.threads.forumPost(channelID.trim(), {
      name: name.trim(), content, tags: tags?.length ? tags : undefined,
    });
  });
});
