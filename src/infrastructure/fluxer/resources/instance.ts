import type { Client } from '@fluxerjs/core';
import type { APIApplicationMe, APIInstance, APIInstanceEndpoints, APIOAuthApplication } from '@fluxerjs/types';
import type {
  ApplicationInfo,
  InstanceInfo,
  InstanceResources,
} from '../../../ports/resources/instance.js';

function instanceInfo(endpoints: APIInstanceEndpoints, discovery: APIInstance | null): InstanceInfo {
  return {
    apiCodeVersion: discovery?.api_code_version ?? null,
    codename: discovery?.codename ?? null,
    endpoints: {
      api: endpoints.api,
      apiClient: endpoints.api_client,
      apiPublic: endpoints.api_public,
      gateway: endpoints.gateway,
      media: endpoints.media,
      staticCDN: endpoints.static_cdn,
      marketing: endpoints.marketing,
      admin: endpoints.admin,
      invite: endpoints.invite,
      gift: endpoints.gift,
      webapp: endpoints.webapp,
    },
    features: discovery?.features ? {
      voiceEnabled: discovery.features.voice_enabled,
      stripeEnabled: discovery.features.stripe_enabled,
      selfHosted: discovery.features.self_hosted,
      presignedAttachmentUploads: discovery.features.presigned_attachment_uploads,
      emailsEnabled: discovery.features.emails_enabled,
    } : null,
    registrationMode: discovery?.registration?.mode ?? null,
    ssoEnabled: discovery?.sso?.enabled ?? null,
    ssoEnforced: discovery?.sso?.enforced ?? null,
    singleCommunity: discovery?.community?.single_community ?? null,
    singleCommunityGuildID: discovery?.community?.single_community_guild_id ?? null,
    directMessagesDisabled: discovery?.community?.direct_messages_disabled ?? null,
    services: discovery?.services ? {
      gif: discovery.services.gif_enabled,
      youtube: discovery.services.youtube_enabled,
      bluesky: discovery.services.bluesky_enabled,
    } : null,
  };
}

function applicationInfo(application: APIApplicationMe | APIOAuthApplication): ApplicationInfo {
  return {
    id: application.id,
    name: application.name,
    icon: application.icon ?? null,
    description: application.description ?? null,
    botPublic: application.bot_public ?? null,
    botRequireCodeGrant: application.bot_require_code_grant ?? null,
    verifyKey: 'verify_key' in application ? application.verify_key ?? null : null,
    flags: 'flags' in application ? application.flags ?? null : null,
    ownerID: 'owner' in application ? application.owner?.id ?? null : null,
    botID: 'bot' in application ? application.bot?.id ?? null : null,
    redirectURIs: 'redirect_uris' in application ? [...application.redirect_uris ?? []] : [],
    clientSecret: 'client_secret' in application ? application.client_secret ?? null : null,
  };
}

export function createInstanceResources(client: Client): InstanceResources {
  return {
    async describe() {
      const resolved = client.instance;
      const fetched = await client.fetchInstance();
      return instanceInfo(fetched?.endpoints ?? resolved.endpoints, fetched ?? resolved.discovery);
    },
    async gatewayInfo() {
      const info = await client.fetchGatewayInfo();
      const limit = info.session_start_limit;
      return {
        url: info.url,
        shards: info.shards,
        sessionStartLimit: limit ? {
          total: limit.total,
          remaining: limit.remaining,
          resetAfter: limit.reset_after,
          maxConcurrency: limit.max_concurrency,
        } : null,
      };
    },
    async application() {
      return applicationInfo(await client.fetchApplication());
    },
    async oauthApplications() {
      return (await client.fetchOAuthApplications()).map(applicationInfo);
    },
    async emojiMetadata(emojiID) {
      const metadata = await client.fetchEmojiMetadata(emojiID);
      return { id: metadata.id, guildID: metadata.guild_id, name: metadata.name,
        animated: metadata.animated, allowCloning: metadata.allow_cloning };
    },
    async stickerMetadata(stickerID) {
      const metadata = await client.fetchStickerMetadata(stickerID);
      return { id: metadata.id, guildID: metadata.guild_id, name: metadata.name,
        animated: metadata.animated, allowCloning: metadata.allow_cloning };
    },
    resolveEmoji(emoji, guildID) {
      return client.resolveEmoji(emoji, guildID);
    },
  };
}
