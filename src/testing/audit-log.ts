import { auditLogQueryInput } from '../domain/audit-log.js';
import { compareSnowflake } from '../domain/moderation.js';
import type { AuditLogInfo, AuditLogQueryInput, UsersResources } from '../ports/resources/users.js';

let auditSequence = 0;

export function mockAuditLogEntry(overrides: Partial<AuditLogInfo> = {}): AuditLogInfo {
  const id = overrides.id ?? String(++auditSequence);
  return structuredClone({
    id,
    actionType: 20,
    userID: '1',
    targetID: '2',
    reason: null,
    createdTimestamp: 1_700_000_000_000,
    changes: [],
    options: null,
    ...overrides,
  });
}

export function createMockAuditLogs(entries: readonly AuditLogInfo[] = []): UsersResources['auditLogs'] {
  const snapshot = structuredClone([...entries]);
  return async (_guildID: string, input?: number | AuditLogQueryInput): Promise<AuditLogInfo[]> => {
    const query = auditLogQueryInput(input);
    const filtered = snapshot.filter(entry => {
      if (query.userID !== undefined && entry.userID !== query.userID) return false;
      if (query.actionType !== undefined && entry.actionType !== query.actionType) return false;
      if (query.before !== undefined && compareSnowflake(entry.id, query.before) >= 0) return false;
      if (query.after !== undefined && compareSnowflake(entry.id, query.after) <= 0) return false;
      return true;
    });
    filtered.sort((left, right) => query.after === undefined
      ? compareSnowflake(right.id, left.id)
      : compareSnowflake(left.id, right.id));
    return structuredClone(filtered.slice(0, query.limit));
  };
}
