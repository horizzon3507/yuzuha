import { ConfigError, GuardError } from '../shared/errors.js';
import { cdnAvatarURL, cdnBannerURL, cdnDefaultAvatarURL, cdnDisplayAvatarURL, cdnEmojiURL, cdnGuildAssetURL,
  cdnMemberAvatarURL, cdnMemberBannerURL, cdnStickerURL, DEFAULT_INSTANCE_ENDPOINTS, inviteUrl } from '@fluxerjs/core';
import type { APIInstanceEndpoints, CdnUrlOptions } from '@fluxerjs/core';

export function fixAnimatedAssetUrl(url: string | null): string | null {
  return url?.replace(/\/(a_[^/.]+)\.png(\?|$)/, '/$1.gif$2') ?? null;
}

const VALID_SIZES = new Set([16, 32, 64, 128, 256, 512, 1024, 2048, 4096]);

export interface Cdn {
  avatar(userID: string, hash: string | null, options?: CdnUrlOptions): string | null;
  banner(userID: string, hash: string | null, options?: CdnUrlOptions): string | null;
  guildIcon(guildID: string, hash: string | null, options?: Pick<CdnUrlOptions, 'size' | 'mediaBase'>): string | null;
  guildBanner(guildID: string, hash: string | null, options?: Pick<CdnUrlOptions, 'size' | 'mediaBase'>): string | null;
  guildSplash(guildID: string, hash: string | null, options?: Pick<CdnUrlOptions, 'size' | 'mediaBase'>): string | null;
  memberAvatar(guildID: string, userID: string, hash: string | null, options?: CdnUrlOptions): string | null;
  memberBanner(guildID: string, userID: string, hash: string | null, options?: CdnUrlOptions): string | null;
  emoji(id: string, options?: CdnUrlOptions & { animated?: boolean }): string;
  sticker(id: string, options?: CdnUrlOptions & { animated?: boolean }): string;
  asset(url: string, options?: { size?: number; format?: 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif' }): string;
}

type AssetEndpoints = Pick<APIInstanceEndpoints, 'media' | 'static_cdn' | 'invite'>;
type InstanceCdn = Cdn & {
  endpoints: Readonly<AssetEndpoints>;
  defaultAvatar(userIDOrIndex: string | number): string;
  displayAvatar(userID: string, hash: string | null, options?: CdnUrlOptions): string;
  invite(code: string, inviteBase?: string): string;
};

function endpoint(value: string): string | undefined {
  if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || value.includes('\\')) return;
  const url = URL.parse(value);
  return url && (url.protocol === 'https:' || url.protocol === 'http:')
    && !url.username && !url.password && !url.search && !url.hash ? value.trim().replace(/\/+$/, '') : undefined;
}

export function createCdn(mediaBase?: string, instance: AssetEndpoints = DEFAULT_INSTANCE_ENDPOINTS): InstanceCdn {
  const override = mediaBase === undefined ? undefined : endpoint(mediaBase);
  if (mediaBase !== undefined && !override?.startsWith('https://')) {
    throw new ConfigError('OPTIONS', 'cdn.mediaBase deve ser uma URL https.');
  }
  const endpoints = Object.freeze({
    media: override ?? endpoint(instance.media) ?? DEFAULT_INSTANCE_ENDPOINTS.media,
    static_cdn: endpoint(instance.static_cdn) ?? DEFAULT_INSTANCE_ENDPOINTS.static_cdn,
    invite: endpoint(instance.invite) ?? DEFAULT_INSTANCE_ENDPOINTS.invite,
  });
  const base = (options?: CdnUrlOptions): CdnUrlOptions => ({
    ...options, mediaBase: override ?? options?.mediaBase ?? endpoints.media,
    staticCdnBase: options?.staticCdnBase ?? endpoints.static_cdn,
  });
  return {
    endpoints,
    defaultAvatar: (userIDOrIndex: string | number) => cdnDefaultAvatarURL(userIDOrIndex, base()),
    displayAvatar: (userID: string, hash: string | null, options?: CdnUrlOptions) =>
      fixAnimatedAssetUrl(cdnDisplayAvatarURL(userID, hash, base(options)))!,
    invite: (code: string, inviteBase = endpoints.invite) => inviteUrl(inviteBase, code),
    avatar: (userID, hash, options) => fixAnimatedAssetUrl(cdnAvatarURL(userID, hash, base(options))),
    banner: (userID, hash, options) => fixAnimatedAssetUrl(cdnBannerURL(userID, hash, base(options))),
    guildIcon: (guildID, hash, options) => fixAnimatedAssetUrl(cdnGuildAssetURL('icons', guildID, hash, base(options))),
    guildBanner: (guildID, hash, options) => fixAnimatedAssetUrl(cdnGuildAssetURL('banners', guildID, hash, base(options))),
    guildSplash: (guildID, hash, options) => fixAnimatedAssetUrl(cdnGuildAssetURL('splashes', guildID, hash, base(options))),
    memberAvatar: (guildID, userID, hash, options) => fixAnimatedAssetUrl(cdnMemberAvatarURL(guildID, userID, hash, base(options))),
    memberBanner: (guildID, userID, hash, options) => fixAnimatedAssetUrl(cdnMemberBannerURL(guildID, userID, hash, base(options))),
    emoji: (id, options) => cdnEmojiURL(id, options?.animated ?? false, base(options)),
    sticker: (id, options) => cdnStickerURL(id, options?.animated ?? false, base(options)),
    asset: (url, options = {}) => {
      if (options.size !== undefined && !VALID_SIZES.has(options.size))
        throw new GuardError('size deve ser potência de dois entre 16 e 4096.', 'INVALID_ARGUMENT');
      let out = url;
      if (options.format) out = out.replace(/\.(png|jpg|jpeg|webp|gif)(\?|$)/, `.${options.format}$2`);
      if (options.size !== undefined) {
        const [main = '', fragment] = out.split('#', 2);
        const sized = /[?&]size=\d+/.test(main) ? main.replace(/([?&]size=)\d+/, `$1${options.size}`)
          : main + (main.includes('?') ? '&' : '?') + `size=${options.size}`;
        out = sized + (fragment !== undefined ? '#' + fragment : '');
      }
      return fixAnimatedAssetUrl(out)!;
    },
  };
}
