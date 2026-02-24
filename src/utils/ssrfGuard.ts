/**
 * SSRF (Server-Side Request Forgery) guard.
 * Validates URLs by resolving DNS and checking the resulting IP against
 * a blocklist of private, loopback, link-local, reserved, and cloud
 * metadata ranges. Prevents the server from being tricked into making
 * requests to internal services.
 */

import dns from 'node:dns/promises';
import * as ipaddr from 'ipaddr.js';

/** IP range classifications that indicate internal/reserved addresses. */
const BLOCKED_RANGES: ReadonlySet<string> = new Set([
  'private', // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
  'loopback', // 127.0.0.0/8, ::1
  'linkLocal', // 169.254.0.0/16, fe80::/10
  'uniqueLocal', // fc00::/7
  'unspecified', // 0.0.0.0, ::
  'reserved', // Various reserved ranges
  'carrierGradeNat', // 100.64.0.0/10
]);

/** Cloud provider metadata endpoint IPs. */
const METADATA_IPS: ReadonlySet<string> = new Set(['169.254.169.254', 'fd00:ec2::254']);

/** Allowed URL protocols. */
const ALLOWED_PROTOCOLS: ReadonlySet<string> = new Set(['http:', 'https:']);

/**
 * Validate that an IP address is not in a blocked range.
 * @throws If the IP is private, loopback, link-local, reserved, or a cloud metadata endpoint.
 */
function validateIp(ip: string): void {
  if (METADATA_IPS.has(ip)) {
    throw new Error(`Blocked IP: cloud metadata endpoint ${ip}`);
  }

  const parsed = ipaddr.parse(ip);

  // Handle IPv6-mapped IPv4 addresses (e.g., ::ffff:127.0.0.1)
  if (parsed.kind() === 'ipv6') {
    const ipv6 = parsed as ipaddr.IPv6;
    const v6Range = ipv6.range();
    if (BLOCKED_RANGES.has(v6Range)) {
      throw new Error(`Blocked IP: ${ip} is in ${v6Range} range`);
    }
    if (ipv6.isIPv4MappedAddress()) {
      const innerV4 = ipv6.toIPv4Address();
      const v4Range = innerV4.range();
      if (BLOCKED_RANGES.has(v4Range)) {
        throw new Error(`Blocked IP: ${ip} maps to ${v4Range} IPv4 range`);
      }
      const innerStr = innerV4.toString();
      if (METADATA_IPS.has(innerStr)) {
        throw new Error(`Blocked IP: ${ip} maps to cloud metadata endpoint`);
      }
    }
  } else {
    const range = (parsed as ipaddr.IPv4).range();
    if (BLOCKED_RANGES.has(range)) {
      throw new Error(`Blocked IP: ${ip} is in ${range} range`);
    }
  }
}

export interface ValidatedUrl {
  readonly url: URL;
  readonly resolvedIp: string;
}

/**
 * Validate a URL for SSRF safety.
 *
 * 1. Parses the URL and checks the protocol is HTTP(S).
 * 2. Resolves the hostname to an IP via DNS (or uses the IP directly).
 * 3. Validates the resolved IP is not in any blocked range.
 *
 * @returns The parsed URL and the resolved IP address.
 * @throws On invalid URL, blocked protocol, or blocked IP.
 */
export async function validateUrl(rawUrl: string): Promise<ValidatedUrl> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    throw new Error('Only HTTP(S) protocols allowed');
  }

  // Strip brackets from IPv6 hostname (URL parser wraps IPv6 in [])
  const hostname = url.hostname.replace(/^\[|\]$/g, '');

  let resolvedIp: string;
  if (ipaddr.isValid(hostname)) {
    resolvedIp = hostname;
  } else {
    try {
      const result = await dns.lookup(hostname);
      if (!result.address) {
        throw new Error(`DNS lookup returned no address for ${hostname}`);
      }
      resolvedIp = result.address;
    } catch (err) {
      throw new Error(`DNS resolution failed for ${hostname}: ${(err as Error).message}`);
    }
  }

  validateIp(resolvedIp);

  return { url, resolvedIp };
}
