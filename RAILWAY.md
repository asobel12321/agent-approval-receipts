# Railway Deployment

This service is deployable on Railway as a Dockerized Node/Express app. The production path for the portfolio demo is:

- `GET /health` for Railway health checks
- `GET /.well-known/x402` for x402 discovery
- `GET /openapi.json` for agent/tool schema discovery
- `POST /v1/approvals` for the paid approval-page endpoint
- `POST /v1/artifacts` for the paid signed-artifact endpoint

## Required Railway variables

Set these in the Railway service Variables tab:

```text
EVM_ADDRESS=0xYourWalletAddress
PUBLIC_BASE_URL=https://your-service.up.railway.app
ARTIFACT_SIGNING_SECRET=use-a-long-random-secret
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_EVM_NETWORK=eip155:84532
DATA_DIR=/data
```

Optional:

```text
SOLANA_ADDRESS=YourSolanaAddress
X402_SOLANA_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
```

`PORT` is provided by Railway and should not be hardcoded in the Railway UI.

## Persistent receipts

Approvals and artifacts are written under `DATA_DIR`. For a durable production demo, add a Railway Volume mounted at `/data`. Without a volume, a deploy/restart may remove generated approvals, artifacts, and demo data.

## Smoke tests

Replace `$BASE_URL` with the Railway URL.

```bash
curl -i "$BASE_URL/health"
curl -i "$BASE_URL/.well-known/x402"
curl -i "$BASE_URL/openapi.json"
```

Expected unpaid paid-route behavior:

```bash
curl -i -X POST "$BASE_URL/v1/approvals" \
  -H "content-type: application/json" \
  -d '{
    "title": "Approve SaaS trial purchase",
    "description": "Human checkpoint before an agent spends money.",
    "ttlHours": 72,
    "markdown": "## Request\n\nApprove a one-month $29 SaaS trial."
  }'
```

Before payment, this should return `402 Payment Required` with x402 payment requirements. After x402 payment, it should return approval metadata including `url`, `metadataUrl`, `ownerToken`, `responseToken`, `expiresAt`, and `receipt`.

## Portfolio proof points

For Merit Systems or another reviewer, show:

1. The Railway URL.
2. `/.well-known/x402` proving machine-readable paid-resource discovery.
3. `/openapi.json` proving agent-readable API shape.
4. A `402 Payment Required` response from `POST /v1/approvals`.
5. A successful paid approval creation with receipt metadata.
6. A human approval page and `/v1/approvals/:approvalId/verify` result.
