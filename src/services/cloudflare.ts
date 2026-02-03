export const CLOUDFLARE_IPV4 = [
    "173.245.48.0/20",
    "103.21.244.0/22",
    "103.22.200.0/22",
    "103.31.4.0/22",
    "141.101.64.0/18",
    "108.162.192.0/18",
    "190.93.240.0/20",
    "188.114.96.0/20",
    "197.234.240.0/22",
    "198.41.128.0/17",
    "162.158.0.0/15",
    "104.16.0.0/13", // 104.16.0.0 - 104.31.255.255
    "104.24.0.0/14",
    "172.64.0.0/13",
    "131.0.72.0/22"
];

// Helper to check if IP is in CIDR
function ipInCidr(ip: string, cidr: string): boolean {
    const [range, bits] = cidr.split('/');
    const mask = ~(2 ** (32 - parseInt(bits)) - 1);

    const ipParts = ip.split('.').map(Number);
    const rangeParts = range.split('.').map(Number);

    const ipNum = (ipParts[0] << 24) | (ipParts[1] << 16) | (ipParts[2] << 8) | ipParts[3];
    const rangeNum = (rangeParts[0] << 24) | (rangeParts[1] << 16) | (rangeParts[2] << 8) | rangeParts[3];

    return (ipNum & mask) === (rangeNum & mask);
}

export function isCloudflareIp(ip: string): boolean {
    // Simple check for IPv4 only for now
    if (ip.includes(':')) return false; // TODO: IPv6 support
    return CLOUDFLARE_IPV4.some(cidr => ipInCidr(ip, cidr));
}


