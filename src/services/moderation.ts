import type { CaseRecord, ModerationAction, ModerationOptions } from '../domain/moderation.js';
import { userID } from '../domain/values.js';
import type { Store } from '../ports/store.js';
import type { Transport } from '../ports/transport.js';
import { GuardError, PartialModerationError, YuzuhaError } from '../shared/errors.js';
import { AuthorizationService, requireGuild } from './authorization.js';
import type { ActorScope } from './authorization.js';
import { CaseService } from './cases.js';

export class ModerationService {
  private readonly authorization: AuthorizationService;
  private readonly cases: CaseService;

  constructor(private readonly transport: Transport, store: Store, private readonly scope: ActorScope) {
    this.authorization = new AuthorizationService(transport, scope);
    this.cases = new CaseService(store);
  }

  async execute(action: ModerationAction, target: string, reason: string, options: ModerationOptions = {}): Promise<CaseRecord | undefined> {
    const guildID = requireGuild(this.scope.guildID);
    if (!['ban', 'kick', 'timeout', 'unban', 'move', 'mute', 'deafen'].includes(action)) throw new YuzuhaError('MODERATION_ACTION', 'Ação de moderação inválida.');
    const targetID = userID(target);
    if (!reason.trim()) throw new GuardError('Informe o motivo.');
    if (reason.length > 512) throw new GuardError('O motivo deve ter até 512 caracteres.');
    if (action === 'timeout' && (!Number.isSafeInteger(options.duration) || !options.duration
      || options.duration < 0 || options.duration > 28 * 86400_000)) {
      throw new GuardError('Informe uma duração de até 28 dias.');
    }
    if (options.duration !== undefined && (!Number.isSafeInteger(options.duration) || options.duration <= 0)) {
      throw new GuardError('Informe uma duração válida em milissegundos inteiros.');
    }
    const days = options.deleteMessageDays ?? 0;
    if (!Number.isInteger(days) || days < 0 || days > 7) throw new GuardError('O histórico a remover deve ser de 0 a 7 dias.');
    if (action === 'move' && options.channelID !== null && (typeof options.channelID !== 'string' || !/^\d+$/.test(options.channelID))) {
      throw new GuardError('Informe o ID do canal de voz ou null para desconectar.');
    }
    if ((action === 'mute' || action === 'deafen') && typeof options.enabled !== 'boolean') {
      throw new GuardError('Informe true ou false para o estado de voz.');
    }
    await this.authorization.requireModeratable(action, targetID, options.channelID);
    if (options.record) await this.cases.ready();
    const voice = action === 'move' ? { channelID: options.channelID! }
      : action === 'mute' || action === 'deafen' ? { enabled: options.enabled! } : undefined;
    await this.transport.moderate(guildID, action, targetID, reason, action === 'ban' ? days : options.duration, voice);
    if (!options.record) return undefined;

    try {
      return await this.cases.create({ guildID, action, targetID, moderatorID: this.scope.authorID, reason,
        ...(options.duration === undefined ? {} : { duration: options.duration }), ...voice });
    } catch (cause) { throw new PartialModerationError(action, targetID, cause); }
  }
}
