import { GuardError } from '../../shared/errors.js';
import { defineFunctions } from './definition.js';

export const eventFunctions = defineFunctions(fn => {
  for (const [name, key] of [['eventName', 'name'], ['eventUserID', 'userID'], ['eventGuildID', 'guildID'],
    ['eventChannelID', 'channelID'], ['eventMessageID', 'messageID'], ['eventContent', 'content'],
    ['eventOldContent', 'oldContent'], ['eventEmoji', 'emoji']] as const) {
    fn(name, 'events', 0, 0, '', 'Consulta o campo do evento; requer contexto de evento e preserva ausências como null.', c => {
      if (!c.ctx.event) throw new GuardError('Esta função exige um contexto de evento.');
      return c.ctx.event[key];
    });
  }
});
