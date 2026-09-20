// Shared (client + server) checks for partner logo URLs.

/**
 * Discord *attachment* links are signed (`?ex=…&is=…&hm=…`) and stop working
 * roughly 24 hours after they were copied — the CDN then answers 404. Using
 * one as a partner logo makes the image "disappear after a while" even though
 * the entry itself is still stored.
 *
 * Permanent Discord CDN paths (avatars, icons, emojis, banners) are not signed
 * and are therefore allowed.
 */
export function isExpiringDiscordUrl(url: string): boolean {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host !== "cdn.discordapp.com" && host !== "media.discordapp.net") return false;
    return (
      u.pathname.startsWith("/attachments/") ||
      u.pathname.startsWith("/ephemeral-attachments/") ||
      u.searchParams.has("ex") ||
      u.searchParams.has("hm")
    );
  } catch {
    return false;
  }
}

export const EXPIRING_DISCORD_URL_MESSAGE =
  "Discord-Anhang-Links laufen nach etwa 24 Stunden ab, danach ist das Logo weg. " +
  "Bitte das Bild dauerhaft hosten (z. B. auf deinem Webspace) und diese URL eintragen.";
