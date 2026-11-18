import { ConfigError, YuzuhaError } from '../../shared/errors.js';

/** Anexo resolvido por URL, sem transferir bytes pelo runtime de scripts. */
export interface AttachmentSpec {
  url: string;
  name: string;
  description?: string;
  spoiler?: boolean;
}

export interface BinaryAttachmentSpec {
  data: Uint8Array;
  name: string;
  description?: string;
  spoiler?: boolean;
}

export type PresenceStatus = 'online' | 'idle' | 'dnd' | 'invisible';

export type ActivityType = 'playing' | 'listening' | 'watching' | 'competing' | 'custom';

export interface ActivityInfo {
  type: ActivityType;
  name: string;
  url?: string;
  state?: string;
}

export interface CustomStatusInput {
  text: string;
  emoji?: string;
}

export interface PresenceInput {
  status?: PresenceStatus;
  activities?: ActivityInfo[];
  activity?: ActivityInfo;
  customStatus?: string | CustomStatusInput | null;
  afk?: boolean;
}

const VALID_STATUSES = new Set<PresenceStatus>(['online', 'idle', 'dnd', 'invisible']);
const VALID_ACTIVITY_TYPES = new Set<ActivityType>(['playing', 'listening', 'watching', 'competing', 'custom']);

function presenceFail(message: string, asConfig: boolean): never {
  throw asConfig ? new ConfigError('PRESENCE_OPTIONS', message) : new YuzuhaError('PRESENCE_OPTIONS', message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function assertPresenceStatus(status: unknown, asConfig = false): PresenceStatus {
  if (typeof status !== 'string' || !VALID_STATUSES.has(status as PresenceStatus)) {
    presenceFail('status de presença deve ser online, idle, dnd ou invisible.', asConfig);
  }
  return status as PresenceStatus;
}

export function assertActivityInfo(activity: unknown, asConfig = false): ActivityInfo {
  if (!isPlainObject(activity)) {
    presenceFail('activity deve ser um objeto com type e name.', asConfig);
  }
  if (typeof activity.type !== 'string' || !VALID_ACTIVITY_TYPES.has(activity.type as ActivityType)) {
    presenceFail('activity.type deve ser playing, listening, watching, competing ou custom.', asConfig);
  }
  const type = activity.type as ActivityType;
  if (typeof activity.name !== 'string') {
    presenceFail('activity.name deve ser texto.', asConfig);
  }
  if (activity.state !== undefined && typeof activity.state !== 'string') {
    presenceFail('activity.state deve ser texto quando informado.', asConfig);
  }
  if (type !== 'custom' && !activity.name.trim()) {
    presenceFail('activity.name não pode ser vazio.', asConfig);
  }
  if (type === 'custom' && !activity.name.trim() && !(typeof activity.state === 'string' && activity.state.trim())) {
    presenceFail('Atividade customizada exige name ou state não vazio.', asConfig);
  }
  if (activity.url !== undefined && (typeof activity.url !== 'string' || !activity.url.trim())) {
    presenceFail('activity.url deve ser um texto não vazio quando informado.', asConfig);
  }
  return {
    type,
    name: activity.name,
    ...(activity.url !== undefined ? { url: activity.url } : {}),
    ...(activity.state !== undefined ? { state: activity.state } : {}),
  };
}

export function validatePresenceInput(input: unknown, asConfig = false): PresenceInput {
  if (!isPlainObject(input)) {
    presenceFail('Presença deve ser um objeto PresenceInput.', asConfig);
  }
  const status = input.status === undefined ? undefined : assertPresenceStatus(input.status, asConfig);
  const activity = input.activity === undefined ? undefined : assertActivityInfo(input.activity, asConfig);
  let activities: ActivityInfo[] | undefined;
  if (input.activities !== undefined) {
    if (!Array.isArray(input.activities)) {
      presenceFail('activities deve ser uma lista de atividades.', asConfig);
    }
    activities = input.activities.map(item => assertActivityInfo(item, asConfig));
  }
  let customStatus: PresenceInput['customStatus'];
  if (input.customStatus !== undefined) {
    if (input.customStatus === null || typeof input.customStatus === 'string') {
      customStatus = input.customStatus;
    } else if (isPlainObject(input.customStatus) && typeof input.customStatus.text === 'string') {
      if (input.customStatus.emoji !== undefined && (typeof input.customStatus.emoji !== 'string' || !input.customStatus.emoji.trim())) {
        presenceFail('customStatus.emoji deve ser um texto não vazio quando informado.', asConfig);
      }
      customStatus = {
        text: input.customStatus.text,
        ...(input.customStatus.emoji !== undefined ? { emoji: input.customStatus.emoji } : {}),
      };
    } else {
      presenceFail('customStatus deve ser texto, null ou um objeto { text, emoji? }.', asConfig);
    }
  }
  if (input.afk !== undefined && typeof input.afk !== 'boolean') {
    presenceFail('afk deve ser um booleano quando informado.', asConfig);
  }
  return {
    ...(status !== undefined ? { status } : {}),
    ...(activity !== undefined ? { activity } : {}),
    ...(activities !== undefined ? { activities } : {}),
    ...(customStatus !== undefined ? { customStatus } : {}),
    ...(input.afk !== undefined ? { afk: input.afk } : {}),
  };
}

export function limitOf(value: number | undefined, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 1 || value > max) {
    throw new YuzuhaError('LIMIT', `Limite deve ser um inteiro entre 1 e ${max}.`);
  }
  return value;
}
