# Agent Approval Receipts

x402-paid approval pages and signed decision receipts for autonomous agents.

The endpoint gives agents a human checkpoint before they spend money or take action: create a temporary approval page, send the link to a human, record approve/reject/request-changes, and return verifiable metadata.

## Why This Is Useful

Agents can generate recommendations, but real workflows often need a human to approve the next step. A chat message is easy to lose and hard to verify. This service turns the checkpoint into a signed, expiring artifact with receipts.

Example:

1. Agent wants to buy a $29 SaaS trial.
2. Agent creates a paid approval page through x402.
3. Human opens the URL and approves.
4. Agent reads the metadata or receives a webhook.
5. Agent proceeds with proof of approval.

## Core Routes

- `POST /v1/approvals` - paid approval page creation, `$0.25`
- `GET /approve/:approvalId/` - public approval page
- `GET /v1/approvals/:approvalId` - public approval metadata
- `GET /v1/approvals/:approvalId/verify` - verify signed decision receipt
- `GET /v1/approvals/:approvalId/private` - private metadata with `x-owner-token`
- `POST /v1/approvals/:approvalId/respond` - record approve/reject/request-changes
- `DELETE /v1/approvals/:approvalId` - delete with `x-owner-token`

Supporting artifact routes:

- `POST /v1/artifacts/preview` - free artifact preview
- `POST /v1/artifacts` - paid signed artifact creation, `$0.10`
- `GET /a/:artifactId/` - public artifact page
- `GET /v1/artifacts/:artifactId/verify` - verify artifact receipt

## Create Approval Page

```bash
curl -i -X POST http://localhost:4021/v1/approvals \
  -H 'content-type: application/json' \
  -d '{
    "title": "Approve SaaS trial purchase",
    "description": "Human checkpoint before an agent spends money.",
    "ttlHours": 72,
    "markdown": "## Request\n\nApprove a one-month $29 SaaS trial.\n\n- Agent has produced a signed brief\n- Spend is capped at $29\n- Trial can be cancelled before renewal"
  }'
```

Before payment, the route returns `402 Payment Required`. After x402 payment, it returns an approval URL, metadata URL, owner token, response token, expiry, and creation receipt.

## Signed Decisions

When a human responds, the decision metadata includes a signed decision receipt:

```json
{
  "approvalId": "appr_abc123",
  "status": "approved",
  "response": {
    "decision": "approved",
    "note": "Approved for one-month trial only.",
    "actor": "human-reviewer",
    "respondedAt": "2026-05-13T19:12:00.000Z",
    "decisionReceipt": {
      "receiptId": "drcpt_abc123",
      "signedAt": "2026-05-13T19:12:00.000Z",
      "signature": "base64url-hmac",
      "signatureAlgorithm": "hmac-sha256"
    }
  }
}
```

Verify it:

```bash
curl http://localhost:4021/v1/approvals/appr_abc123/verify
```

## Webhooks

If `callbackUrl` is provided, the service sends a JSON webhook after a decision is recorded. Callback URLs must use HTTPS and cannot target localhost or internal hosts. Callback delivery attempts are recorded in approval metadata.

## Demo

Run the focused demo:

```bash
npm.cmd run demo:seed
npm.cmd run dev
```

Then open:

```text
http://localhost:4021/demo
```

The demo creates a signed vendor-purchase report, an approval page, and an approved decision with a signed receipt.

## Run

```bash
npm install
cp .env.example .env
npm run dev
```

Fill `EVM_ADDRESS` in `.env` before testing paid routes. `SOLANA_ADDRESS` is optional.

Set `PUBLIC_BASE_URL` in production so returned URLs use your public domain instead of localhost.

Set `ARTIFACT_SIGNING_SECRET` in production so receipt signatures are stable and private.

## Deploy on Railway

See [RAILWAY.md](RAILWAY.md) for the Railway variables, volume setup, and production smoke tests.

## Verify

```bash
npm.cmd run typecheck
npm.cmd run build
npm.cmd run demo:approval
```
