/**
 * Host Check Handler
 *
 * Orchestrates the logic for checking a hostname.
 * - Parses input
 * - Calls DNS service
 * - Calls Cloudflare service (IP + Zone Hold)
 * - Updates D1 Database
 */

import { Context } from 'hono';
import { Bindings, RecordType } from '../types';
import { dnsQuery } from '../services/dns';
import { isCloudflareIp, checkZoneHold } from '../services/cloudflare';

// Shared logic for resolving AUTHORITATIVE NS
async function getAuthoritativeNameservers(hostname: string): Promise<string[]> {
    let nsRecord = await dnsQuery(hostname, RecordType.NS);
    let authNs = nsRecord.Answer?.filter(a => a.type === 2).map(a => a.data) || [];

    if (authNs.length === 0) {
        // Try parent domain logic
        const parent = hostname.split('.').slice(1).join('.');
        if (parent) {
            nsRecord = await dnsQuery(parent, RecordType.NS);
            authNs = nsRecord.Answer?.filter(a => a.type === 2).map(a => a.data) || [];
        }
    }
    return authNs;
}

// Logic to parse CAA
function checkCaaPermission(caaRecords: any[], domain: string): 'allowed' | 'not_allowed' {
    if (!caaRecords || caaRecords.length === 0) return 'allowed'; // No records = all allowed
    const allowed = caaRecords.some(r => {
        if (r.tag !== 'issue' && r.tag !== 'issuewild') return false;
        return r.value.includes(domain);
    });
    return allowed ? 'allowed' : 'not_allowed';
}

const HEX_PAIR_REGEX = /^[0-9A-Fa-f]{2}$/;

function parseCAA(answer: any) {
    if (answer.type !== 257) return null;

    let flags, tag, value;

    // Check for RFC 3597 hex format (common in Cloudflare DoH for some domains)
    // Format: \# <length> <hex_data>
    // e.g. \# 17 00 05 69 73 73 75 65 61 6d 61 7a 6f 6e 2e 63 6f 6d
    if (answer.data.startsWith('\\#')) {
        const parts = answer.data.split(' ');
        if (parts.length < 3) return null;

        // parts[0] = \#
        // parts[1] = length
        // parts[2...] = hex bytes
        const hexBytes = parts.slice(2).join('');

        // Convert hex string to u8 array
        const buffer = new Uint8Array(hexBytes.match(/.{1,2}/g).map((byte: string) => parseInt(byte, 16)));

        // CAA Record Struct: [Flags (1 byte)] [Tag Length (1 byte)] [Tag (n bytes)] [Value (m bytes)]
        if (buffer.length < 2) return null;

        flags = buffer[0];
        const tagLen = buffer[1];

        if (buffer.length < 2 + tagLen) return null;

        const tagBytes = buffer.slice(2, 2 + tagLen);
        const valueBytes = buffer.slice(2 + tagLen);

        const decoder = new TextDecoder();
        tag = decoder.decode(tagBytes);
        value = decoder.decode(valueBytes);

    } else {
        // Standard text format: 0 issue "amazon.com"
        const match = answer.data.match(/^(\d+)\s+(\w+)\s+(?:"(.*)"|(.*))$/);
        if (!match) return null;
        flags = parseInt(match[1], 10);
        tag = match[2];
        value = match[3] || match[4];
    }

    return {
        critical: !!(flags & 128),
        tag,
        value
    };
}


export async function handleCheckHost(c: Context<{ Bindings: Bindings }>) {
    const body = await c.req.json();
    const hostname = body.hostname?.trim();

    if (!hostname) {
        return c.json({ error: 'Hostname check failed' }, 400);
    }

    try {
        // 1. DNS Lookup (A Record)
        const aRecord = await dnsQuery(hostname, RecordType.A);
        const dnsType = 'A';
        let dnsResult = '';
        let isProxied = 'no';

        if (aRecord.Answer && aRecord.Answer.length > 0) {
            const ips = aRecord.Answer.filter(a => a.type === 1).map(a => a.data);
            dnsResult = ips.join(', ');
            if (ips.some(ip => isCloudflareIp(ip))) {
                isProxied = 'yes';
            }
        }

        // 2. Authoritative NS
        const authNs = await getAuthoritativeNameservers(hostname);

        // 3. CAA Check
        let caaRes = await dnsQuery(hostname, RecordType.CAA);
        let caaAnswers = caaRes.Answer || [];
        if (caaAnswers.length === 0) {
            const parent = hostname.split('.').slice(1).join('.');
            if (parent) {
                caaRes = await dnsQuery(parent, RecordType.CAA);
                caaAnswers = caaRes.Answer || [];
            }
        }

        const parsedCaas = caaAnswers.map(parseCAA).filter(x => x !== null);
        const sslGoogle = checkCaaPermission(parsedCaas, 'pki.goog');
        const sslSslCom = checkCaaPermission(parsedCaas, 'ssl.com');
        const sslLetsEncrypt = checkCaaPermission(parsedCaas, 'letsencrypt.org');

        // 4. Zone Hold
        const zoneHoldRes = await checkZoneHold(hostname, c.env.CLOUDFLARE_API_TOKEN, c.env.CLOUDFLARE_ZONE_ID);

        // 5. Store in D1
        await c.env.hosts_db.prepare(`
            INSERT INTO hosts (hostname, authoritative_ns, is_proxied, dns_type, dns_result, ssl_google, ssl_ssl_com, ssl_lets_encrypt, zone_hold, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(hostname) DO UPDATE SET
                authoritative_ns=excluded.authoritative_ns,
                is_proxied=excluded.is_proxied,
                dns_type=excluded.dns_type,
                dns_result=excluded.dns_result,
                ssl_google=excluded.ssl_google,
                ssl_ssl_com=excluded.ssl_ssl_com,
                ssl_lets_encrypt=excluded.ssl_lets_encrypt,
                zone_hold=excluded.zone_hold,
                updated_at=excluded.updated_at
        `).bind(
            hostname,
            authNs.join(', '),
            isProxied,
            dnsType,
            dnsResult,
            sslGoogle,
            sslSslCom,
            sslLetsEncrypt,
            zoneHoldRes.zone_hold,
            Date.now()
        ).run();

        return c.json({
            hostname,
            authoritative_ns: authNs,
            is_proxied: isProxied,
            dns_type: dnsType,
            dns_result: dnsResult,
            ssl_google: sslGoogle,
            ssl_ssl_com: sslSslCom,
            ssl_lets_encrypt: sslLetsEncrypt,
            zone_hold: zoneHoldRes.zone_hold,
            zone_hold_details: zoneHoldRes.details,
            updated_at: Date.now()
        });

    } catch (e: any) {
        return c.json({
            success: false,
            error: e.message || 'Unknown error occurred',
            code: 'INTERNAL_ERROR',
            details: e.stack
        }, 500);
    }
}
