import { GuardError, YuzuhaError } from '../shared/errors.js';
import { cdnAvatarURL, cdnBannerURL, cdnEmojiURL, cdnGuildAssetURL,
  cdnMemberAvatarURL, cdnMemberBannerURL, cdnStickerURL } from '@fluxerjs/core';
import type { CdnUrlOptions } from '@fluxerjs/core';

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

export function createCdn(mediaBase?: string): Cdn {
  if (mediaBase !== undefined && !/^https:\/\//.test(mediaBase)) {
    throw new YuzuhaError('OPTIONS', 'cdn.mediaBase deve ser uma URL https.');
  }
  const base = <T extends { mediaBase?: string }>(options: T | undefined): T | undefined =>
    mediaBase === undefined ? options : { ...options, mediaBase } as T;
  return {
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
        out = /[?&]size=\d+/.test(out) ? out.replace(/([?&]size=)\d+/, `$1${options.size}`)
          : out + (out.includes('?') ? '&' : '?') + `size=${options.size}`;
      }
      return fixAnimatedAssetUrl(out)!;
    },
  };
}
