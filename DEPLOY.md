# Deploy

Recommended first deploy: Railway with a persistent volume mounted at `/data`.

## Required environment

```text
PORT=4021
DATA_DIR=/data
PUBLIC_BASE_URL=https://your-public-domain
EVM_ADDRESS=0xYourBaseOrBaseSepoliaAddress
ARTIFACT_SIGNING_SECRET=long-random-secret
X402_FACILITATOR_URL=https://x402.org/facilitator
X402_EVM_NETWORK=eip155:84532
```

Optional:

```text
SOLANA_ADDRESS=...
X402_SOLANA_NETWORK=solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1
```

## Railway checklist

1. Create a new Railway project from this repo.
2. Add a persistent volume mounted at `/data`.
3. Set the environment variables above.
4. Deploy with the included `Dockerfile`.
5. After deploy, run the seed command in Railway shell:

```bash
npm run demo:seed
```

6. Open:

```text
https://your-public-domain/demo
https://your-public-domain/openapi.json
https://your-public-domain/.well-known/x402
```

## Local production smoke

```powershell
$env:EVM_ADDRESS="0x0000000000000000000000000000000000000000"
$env:ARTIFACT_SIGNING_SECRET="local-secret"
$env:PUBLIC_BASE_URL="http://localhost:4021"
$env:DATA_DIR="$pwd\\.data"
npm.cmd run build
npm.cmd run demo:seed
npm.cmd run start
```
