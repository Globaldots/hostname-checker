# Hostname Checker

The Hostname Checker is a full-stack Cloudflare Worker application designed to analyze domain properties. It performs DNS lookups (A, CNAME, NS, CAA), checks for Cloudflare proxy status, and verifies SSL issuance eligibility for major providers.

## Features
- **DNS Analysis**: Resolves A, CNAME, and NS records.
- **Proxy Detection**: Checks if a hostname resolves to Cloudflare's IP range.
- **CAA Verification**: Checks CAA records for permission to issue certificates from Google (pki.goog), SSL.com, and Let's Encrypt.
- **Bulk Processing**: Upload a list of hostnames to check them in sequence.
- **Data Export**: Download results in JSON or CSV format.
- **Database Persistence**: Stores all check results in Cloudflare D1.
- **Clear Results**: Easily wipe the check history from the UI.

## Architecture
The application is built on **Cloudflare Workers** using the **Hono** framework.
- **Frontend**: Static HTML/CSS/JS served from the worker's assets.
- **Backend**: Worker API handling DNS (via DoH), Cloudflare IP validation, and data persistence.
- **Database**: **Cloudflare D1** (`hosts_db`) stores checking history and results.
- **Services**:
    - `DNS Service`: Resolves records using 1.1.1.1 DoH (DNS over HTTPS).
    - `Cloudflare Service`: Validates if resolved IPs belong to Cloudflare's edge network.

## Local Development
```bash
npm install
npx wrangler dev
```

## Deployment
```bash
npx wrangler deploy
```

## Live URL
https://hostname-check.super-cdn.com

## API Reference

### `POST /api/check-host`
Performs a check on a single hostname.

**Parameters**:
- `hostname` (string): The domain to check.

**Response**:
```json
{
  "hostname": "example.com",
  "authoritative_ns": ["ns1.example.com"],
  "is_proxied": "yes",
  "dns_type": "A",
  "dns_result": "1.2.3.4",
  "ssl_google": "allowed",
  "ssl_ssl_com": "allowed",
  "ssl_lets_encrypt": "allowed",
  "updated_at": 1770123456789
}
```

### `POST /api/check-hosts-bulk`
Performs checks on multiple hostnames in one request (Max 10).

**Parameters**:
- `hostnames` (string[]): Array of domains to check.

**Response**:
Array of results (same structure as above, with added `success` field):
```json
[
  { "success": true, "hostname": "google.com", ... },
  { "success": false, "hostname": "broken.com", "error": "DNS Error", ... }
]
```

### `GET /api/results`
Returns the history of checked hosts.

**Response**:
Array of host objects (same structure as above).

### `DELETE /api/results`
Clears all host records from the database.

## Configuration
D1 Database Binding:
- `hosts_db`

The worker name and compatibility date are configured in `wrangler.jsonc`.
