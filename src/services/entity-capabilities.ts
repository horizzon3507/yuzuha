import type { ModerationAction } from '../domain/moderation.js';
import type { Transport } from '../ports/transport.js';
import { GuardError } from '../shared/errors.js';
import { AuthorizationService } from './authorization.js';

export async function botCanModerate(transport: Transport, guildID: string, userID: string, action: ModerationAction): Promise<boolean> {
  try {
    await new AuthorizationService(transport, { guildID, authorID: transport.botID }).requireModeratable(action, userID);
    return true;
  } catch (error) {
    if (error instanceof GuardError) return false;
    throw error;
  }
}
