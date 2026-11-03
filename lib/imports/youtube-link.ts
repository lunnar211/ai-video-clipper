/**
 * Client-safe YouTube link check (ClipForge Phase 14).
 *
 * Pure URL parsing, no imports — safe to use in browser components.
 * This deliberately mirrors only the HOST part of the server's
 * parseYoutubeVideoId (lib/imports/youtube.ts): any youtube.com or
 * youtu.be link routes to the own-YouTube flow, where the server
 * validates the exact shape (watch, shorts, embed, live, /v/,
 * youtu.be — playlists, channels, and other shapes are refused
 * there with a specific message). Routing on host alone means no
 * YouTube paste ever dead-ends in the CC box.
 */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

export function isYoutubeLink(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl.trim());
  } catch {
    return false;
  }
  return YOUTUBE_HOSTS.has(url.hostname.toLowerCase());
}
