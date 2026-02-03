
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
        const match = hexBytes.match(/.{1,2}/g);
        if (!match) return null;

        const buffer = new Uint8Array(match.map((byte: string) => parseInt(byte, 16)));

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

// Test Data from bbc.com curl
const testData = [
    { "name": "bbc.com", "type": 257, "TTL": 300, "data": "\\# 17 00 05 69 73 73 75 65 61 6d 61 7a 6f 6e 2e 63 6f 6d" },
    { "name": "bbc.com", "type": 257, "TTL": 300, "data": "\\# 19 00 05 69 73 73 75 65 64 69 67 69 63 65 72 74 2e 63 6f 6d" }
];

testData.forEach(r => {
    console.log('Input:', r.data);
    console.log('Parsed:', parseCAA(r));
});
