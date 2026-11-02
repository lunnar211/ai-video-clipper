/**
 * SSRF guard for any server-side URL fetch.
 *
 * Rules: only http/https; the hostname must be on the caller's
 * allow-list; every resolved A/AAAA address must be public (private,
 * loopback, link-local, carrier-grade NAT and reserved ranges are
 * rejected). DNS resolution is injectable so tests never hit the
 * network. This guard is REQUIRED on every import path that fetches a
 * user-supplied URL — an allow-list miss is a rejection, not a warning.
 */

import * as dns from "node:dns";

export type DnsLookup = (host: string) => Promise<string[]>;

async function defaultLookup(host: string): Promise<string[]> {
  try {
    const v4 = await dns.promises.resolve4(host).catch(() => []);
    const v6 = await dns.promises.resolve6(host).catch(() => []);
    return [...v4, ...v6];
  } catch {
    return [];
  }
}

function ipv4Parts(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  return m.slice(1).map(Number);
}

/** True for private/loopback/link-local/reserved IPv4 and IPv6 loopback/ULA. */
export function isPrivateIp(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower.startsWith("fc") || lower.startsWith("fd")) {
    return true;
  }
  if (lower.startsWith("fe8") || lower.startsWith("fe9") || lower.startsWith("fea") || lower.startsWith("feb")) {
    return true; // fe80::/10 link-local
  }
  const parts = ipv4Parts(ip);
  if (!parts) return false;
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 0 || a >= 224) return true; // "this" network, multicast, reserved
  return false;
}

export function hostAllowed(host: string, allowList: string[]): boolean {
  const h = host.toLowerCase();
  return allowList.some((entry) => {
    const e = entry.toLowerCase();
    if (e.startsWith("*.")) return h === e.slice(2) || h.endsWith(e.slice(1));
    return h === e;
  });
}

/**
 * Validate a user-supplied URL for server-side fetch. Throws on any
 * violation. Returns the parsed URL on success.
 */
export async function assertAllowedFetchUrl(
  rawUrl: string,
  allowList: string[],
  lookup: DnsLookup = defaultLookup,
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("That URL is not valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Only http(s) URLs are allowed.");
  }
  if (!hostAllowed(url.hostname, allowList)) {
    throw new Error("That host is not on the allowed list for this import.");
  }
  const addresses = await lookup(url.hostname);
  if (addresses.length === 0) {
    throw new Error("That host could not be resolved.");
  }
  if (addresses.some(isPrivateIp)) {
    throw new Error("That host resolves to a private address.");
  }
  return url;
}
