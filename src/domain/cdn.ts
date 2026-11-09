import { GuardError } from '../shared/errors.js';
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
  emoji(id: string, options?: CdnUrlOptions): string | null;
  sticker(id: string, options?: CdnUrlOptions): string | null;
  asset(url: string, options?: { size?: number; format?: 'png' | 'jpg' | 'jpeg' | 'webp' | 'gif' }): string;
}

export function createCdn(): Cdn {
  return {
    avatar: (userID, hash, options) => fixAnimatedAssetUrl(cdnAvatarURL(userID, hash, options)),
    banner: (userID, hash, options) => fixAnimatedAssetUrl(cdnBannerURL(userID, hash, options)),
    guildIcon: (guildID, hash, options) => fixAnimatedAssetUrl(cdnGuildAssetURL('icons', guildID, hash, options)),
    guildBanner: (guildID, hash, options) => fixAnimatedAssetUrl(cdnGuildAssetURL('banners', guildID, hash, options)),
    guildSplash: (guildID, hash, options) => fixAnimatedAssetUrl(cdnGuildAssetURL('splashes', guildID, hash, options)),
    memberAvatar: (guildID, userID, hash, options) => fixAnimatedAssetUrl(cdnMemberAvatarURL(guildID, userID, hash, options)),
    memberBanner: (guildID, userID, hash, options) => fixAnimatedAssetUrl(cdnMemberBannerURL(guildID, userID, hash, options)),
    emoji: (id, options) => cdnEmojiURL(id, id.startsWith('a_'), options),
    sticker: (id, options) => cdnStickerURL(id, id.startsWith('a_'), options),
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
