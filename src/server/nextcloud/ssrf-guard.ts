import "server-only";

import { lookup } from "node:dns/promises";
import { isIPv4 } from "node:net";

/**
 * A server-side request to a URL entered by a (low-trust) logged-in user in Settings —
 * without this, the app could be abused as an SSRF proxy to probe the internal Docker
 * network (e.g. the `db` service) or cloud metadata endpoints (169.254.169.254). We
 * check the resolved IP, not just the hostname string — DNS could point anywhere.
 */
export async function assertPublicHost(rawUrl: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error("Neplatná URL adresa.");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Povolené jsou jen http/https adresy.");
  }

  const hostname = parsed.hostname.replace(/^\[|\]$/g, ""); // strip [] from IPv6 literals
  if (hostname.toLowerCase() === "localhost") {
    throw new Error("Adresa serveru nesmí mířit na localhost/interní síť.");
  }

  let addresses: string[];
  try {
    addresses = (await lookup(hostname, { all: true })).map((a) => a.address);
  } catch {
    throw new Error("Adresu serveru se nepodařilo přeložit (DNS).");
  }
  if (addresses.length === 0) {
    throw new Error("Adresu serveru se nepodařilo přeložit (DNS).");
  }

  for (const address of addresses) {
    if (isPrivateOrReservedIp(address)) {
      throw new Error("Adresa serveru nesmí mířit na localhost/interní síť.");
    }
  }
}

function isPrivateOrReservedIp(address: string): boolean {
  if (isIPv4(address)) return isPrivateOrReservedIpv4(address);
  return isPrivateOrReservedIpv6(address);
}

function isPrivateOrReservedIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  const [a, b] = octets as [number, number, number, number];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (+ cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  if (a >= 224) return true; // multicast (224+) and reserved (240+)
  return false;
}

function isPrivateOrReservedIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::1") return true; // loopback
  if (normalized === "::") return true; // unspecified
  if (normalized.startsWith("fe80:")) return true; // link-local
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 ULA
  // IPv4-mapped ("::ffff:127.0.0.1") — check the embedded IPv4 address too.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(normalized);
  if (mapped?.[1]) return isPrivateOrReservedIpv4(mapped[1]);
  return false;
}
