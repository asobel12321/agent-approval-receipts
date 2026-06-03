import express from "express";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import type { PaymentOption } from "@x402/core/http";
import type { Network } from "@x402/core/types";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { ExactSvmScheme } from "@x402/svm/exact/server";
import {
  approvalInputSchema,
  approvalResponseSchema,
  createApproval,
  recordApprovalResponse,
  verifyApprovalDecision,
} from "./approval.js";
import { auditEndpoint, auditInputSchema, generateFixes, type AuditInput } from "./audit.js";
import { briefInputSchema, buildDiligencePacket } from "./brief.js";
import { createDeployment, deployInputSchema, previewDeployment, verifyDeploymentReceipt } from "./deploy.js";
import {
  batchScoreEndpoints,
  batchScoreInputSchema,
  compareEndpoints,
  compareQuerySchema,
  scoreEndpoint,
  scoreQuerySchema,
} from "./intelligence.js";
import { openapiSpec } from "./openapi.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));

const port = Number(process.env.PORT ?? 4021);
const dataRoot = process.env.DATA_DIR ?? process.cwd();
const deploymentRoot = path.join(dataRoot, "deployments");
const approvalRoot = path.join(dataRoot, "approvals");
const demoManifestPath = path.join(dataRoot, "demo", "latest.json");
const evmAddress = requiredEnv("EVM_ADDRESS");
const solanaAddress = process.env.SOLANA_ADDRESS;
const evmNetwork = networkEnv("X402_EVM_NETWORK", "eip155:84532");
const solanaNetwork = networkEnv("X402_SOLANA_NETWORK", "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1");

const facilitator = new HTTPFacilitatorClient({
  url: process.env.X402_FACILITATOR_URL ?? "https://x402.org/facilitator",
});

const resourceServer = new x402ResourceServer(facilitator);
resourceServer.register("eip155:*", new ExactEvmScheme());
resourceServer.register("solana:*", new ExactSvmScheme());

app.get("/", (_request, response) => {
  response.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Approval Receipts</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #141414;
        background: #f7f7f4;
      }

      body {
        margin: 0;
      }

      main {
        max-width: 920px;
        margin: 0 auto;
        padding: 48px 24px;
      }

      h1 {
        margin: 0 0 10px;
        font-size: 36px;
        line-height: 1.1;
      }

      p {
        color: #4d4d4d;
        line-height: 1.55;
      }

      .grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 16px;
        margin: 28px 0 22px;
      }

      form {
        display: grid;
        gap: 10px;
        padding: 16px;
        border: 1px solid #d8d8d2;
        border-radius: 8px;
        background: #fff;
      }

      textarea {
        min-height: 128px;
        resize: vertical;
      }

      input, textarea, select, button {
        font: inherit;
        border-radius: 8px;
      }

      input, textarea, select {
        min-width: 0;
        padding: 11px 12px;
        border: 1px solid #c9c9c2;
        background: white;
      }

      button {
        border: 0;
        padding: 12px 14px;
        background: #171717;
        color: white;
        cursor: pointer;
      }

      .links {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        margin: 20px 0;
      }

      a {
        color: #164c8a;
      }

      label {
        display: grid;
        gap: 6px;
        color: #4d4d4d;
        font-size: 13px;
      }

      .hint {
        font-size: 13px;
        color: #666;
      }

      .result-row {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }

      .result-row a {
        word-break: break-all;
      }

      pre {
        min-height: 180px;
        overflow: auto;
        padding: 16px;
        border: 1px solid #d8d8d2;
        border-radius: 8px;
        background: #fff;
        white-space: pre-wrap;
      }

      @media (max-width: 640px) {
        main {
          padding: 32px 16px;
        }

        .grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Agent Approval Receipts</h1>
      <p>x402-paid approval pages and signed decision receipts for autonomous agents. Agents create a human checkpoint, receive a shareable URL, and get verifiable approve/reject metadata back.</p>

      <div class="grid">
        <form id="artifact-form">
          <strong>Create artifact preview</strong>
          <label>Title <input name="title" required value="Vendor Review" /></label>
          <label>Template
            <select name="template">
              <option value="report">Report</option>
              <option value="receipt">Receipt</option>
            </select>
          </label>
          <label>Markdown <textarea name="markdown">## Summary

This vendor is ready for a test purchase.

- Clear pricing
- Public docs
- Fast support path</textarea></label>
          <button type="submit">Preview artifact</button>
          <span class="hint">Paid creation uses POST /v1/artifacts and returns 402 before payment.</span>
        </form>

        <form id="approval-form">
          <strong>Create approval preview</strong>
          <label>Title <input name="title" required value="Approve vendor purchase" /></label>
          <label>Markdown <textarea name="markdown">## Request

Approve a $29/month test purchase for this vendor.

- Clear docs
- Low risk
- Cancel any time</textarea></label>
          <button type="submit">Preview approval payment</button>
          <span class="hint">Paid creation uses POST /v1/approvals and returns 402 before payment.</span>
        </form>
      </div>

      <div class="links">
        <a href="/health">Health</a>
        <a href="/demo">Seeded Demo</a>
        <a href="/openapi.json">OpenAPI JSON</a>
        <a href="/.well-known/x402">x402 Discovery</a>
        <a href="/api/deploy-preview">Artifact Preview</a>
      </div>

      <pre id="output">Use the forms above to preview the agent-facing JSON.</pre>
    </main>

    <script>
      const output = document.querySelector("#output");

      document.querySelector("#artifact-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        output.textContent = "Previewing artifact...";

        const response = await fetch("/v1/artifacts/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.value,
            markdown: form.markdown.value,
            template: form.template.value,
            ttlHours: 168,
          }),
        });

        const data = await response.json();
        output.textContent = JSON.stringify(data, null, 2);
      });

      document.querySelector("#approval-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        output.textContent = "Checking approval payment challenge...";

        const response = await fetch("/v1/approvals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            title: form.title.value,
            markdown: form.markdown.value,
            ttlHours: 72,
          }),
        });

        const text = await response.text();
        output.textContent = "HTTP " + response.status + "\\n" + text;
      });
    </script>
  </body>
</html>`);
});

app.get("/health", (_request, response) => {
  response.json({ ok: true, service: "x402-agent-artifact-hosting" });
});

app.get("/demo", async (_request, response) => {
  try {
    const demo = JSON.parse(await readFile(demoManifestPath, "utf8")) as {
      artifact?: { url?: string; metadataUrl?: string; verifyUrl?: string };
      approval?: { url?: string; metadataUrl?: string; verifyUrl?: string; status?: string };
    };

    response.type("html").send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Agent Approval Receipts Demo</title>
    <style>
      body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f7f4; color: #141414; }
      main { max-width: 760px; margin: 0 auto; padding: 48px 24px; }
      p, li { color: #4d4d4d; line-height: 1.55; }
      a { color: #164c8a; word-break: break-all; }
      .section { padding: 16px; border: 1px solid #d8d8d2; border-radius: 8px; background: #fff; margin: 16px 0; }
    </style>
  </head>
  <body>
    <main>
      <h1>Agent Approval Receipts Demo</h1>
      <p>An agent prepared a vendor-purchase report, created a human approval checkpoint, and recorded a signed approval decision.</p>
      <div class="section">
        <h2>Signed Report Artifact</h2>
        <ul>
          <li><a href="${demo.artifact?.url ?? "#"}">Open artifact</a></li>
          <li><a href="${demo.artifact?.metadataUrl ?? "#"}">Open metadata</a></li>
          <li><a href="${demo.artifact?.verifyUrl ?? "#"}">Verify receipt</a></li>
        </ul>
      </div>
      <div class="section">
        <h2>Approval Checkpoint</h2>
        <p>Status: ${escapeHtml(String(demo.approval?.status ?? "unknown"))}</p>
        <ul>
          <li><a href="${demo.approval?.url ?? "#"}">Open approval page</a></li>
          <li><a href="${demo.approval?.metadataUrl ?? "#"}">Open metadata</a></li>
          <li><a href="${demo.approval?.verifyUrl ?? "#"}">Verify decision receipt</a></li>
        </ul>
      </div>
    </main>
  </body>
</html>`);
  } catch {
    response.type("html").send(`<!doctype html><html><body><main><h1>No seeded demo yet</h1><p>Run <code>npm.cmd run demo:seed</code>, then refresh this page.</p></main></body></html>`);
  }
});

app.get(["/a/:artifactId", "/a/:artifactId/"], async (request, response, next) => {
  try {
    const artifactId = routeParam(request.params.artifactId);
    await sendUnexpiredFile({
      metadataPath: path.join(deploymentRoot, artifactId, "metadata.json"),
      filePath: path.join(deploymentRoot, artifactId, "index.html"),
      response,
    });
  } catch (error) {
    next(error);
  }
});

app.get(["/a/:artifactId/v/:versionId", "/a/:artifactId/v/:versionId/"], async (request, response, next) => {
  try {
    const artifactId = routeParam(request.params.artifactId);
    const versionId = routeParam(request.params.versionId);
    await sendUnexpiredFile({
      metadataPath: path.join(deploymentRoot, artifactId, "metadata.json"),
      filePath: path.join(deploymentRoot, artifactId, "v", versionId, "index.html"),
      response,
    });
  } catch (error) {
    next(error);
  }
});

app.get(["/approve/:approvalId", "/approve/:approvalId/"], async (request, response, next) => {
  try {
    const approvalId = routeParam(request.params.approvalId);
    await sendUnexpiredFile({
      metadataPath: path.join(approvalRoot, approvalId, "metadata.json"),
      filePath: path.join(approvalRoot, approvalId, "index.html"),
      response,
    });
  } catch (error) {
    next(error);
  }
});

app.get("/openapi.json", (_request, response) => {
  response.json(openapiSpec({ baseUrl: baseUrl() }));
});

app.get("/.well-known/x402", (_request, response) => {
  response.json(x402Discovery());
});

app.post("/api/preview", async (request, response, next) => {
  try {
    const input = auditInputSchema.parse(request.body);
    const report = await auditEndpoint(input, { deep: false });
    response.json({
      endpoint: input.url,
      method: input.method,
      free: true,
      score: report.score,
      verdict: report.verdict,
      scores: report.scores,
      topIssues: report.issues.slice(0, 5),
      listingAdvice: report.listingAdvice.slice(0, 3),
      paidEndpoints: {
        audit: "/api/audit",
        deepAudit: "/api/deep-audit",
        generateFix: "/api/generate-fix",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/score-preview", async (request, response, next) => {
  try {
    const input = scoreQuerySchema.parse(request.query);
    const score = await scoreEndpoint(input);
    response.json({
      free: true,
      url: score.url,
      score: score.score,
      verdict: score.verdict,
      risk: score.risk,
      topIssues: score.topIssues.slice(0, 2),
      paidEndpoints: {
        score: "/api/score",
        batchScore: "/api/batch-score",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/compare-preview", (request, response, next) => {
  try {
    const input = compareQuerySchema.parse({ ...request.query, limit: request.query.limit ?? 5 });
    const comparison = compareEndpoints(input);
    response.json({
      free: true,
      ...comparison,
      endpoints: comparison.endpoints.slice(0, 5),
      paidEndpoints: {
        compare: "/api/compare",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/deploy-preview", (_request, response) => {
  const input = deployInputSchema.parse({
    title: "Agent Report",
    description: "A signed artifact published by an agent through x402.",
    markdown: "## Example\n\nThis endpoint turns Markdown into a hosted page.\n\n- Pay once\n- Receive a URL\n- Share the artifact",
    template: "report",
  });
  response.json({
    free: true,
    ...previewDeployment(input, { baseUrl: baseUrl() }),
    paidEndpoint: "/api/deploy",
  });
});

app.post("/api/deploy-preview", (request, response, next) => {
  try {
    const input = deployInputSchema.parse(request.body);
    response.json({
      free: true,
      ...previewDeployment(input, { baseUrl: baseUrl() }),
      paidEndpoint: "/api/deploy",
    });
  } catch (error) {
    next(error);
  }
});

app.post("/v1/artifacts/preview", (request, response, next) => {
  try {
    const input = deployInputSchema.parse(request.body);
    response.json({
      free: true,
      ...previewDeployment(input, { baseUrl: baseUrl() }),
      paidEndpoint: "/v1/artifacts",
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/packet-preview", (request, response, next) => {
  try {
    const input = briefInputSchema.parse({
      target: request.query.target,
      type: request.query.type,
      objective: request.query.objective ?? "Decide whether this target deserves deeper agent research.",
      links: [],
      signals: [],
    });
    response.json({
      free: true,
      ...buildDiligencePacket(input, { depth: "preview" }),
      paidEndpoints: {
        packet: "/api/packet",
        deepPacket: "/api/deep-packet",
      },
    });
  } catch (error) {
    next(error);
  }
});

app.use(
  paymentMiddleware(
    {
      "POST /api/audit": {
        accepts: paymentOptions("$0.10"),
        description: "Audit an x402 endpoint for launch readiness, agent discoverability, and payment readiness",
        mimeType: "application/json",
      },
      "POST /api/deep-audit": {
        accepts: paymentOptions("$0.75"),
        description: "Deep x402 launch audit with runtime, pricing, schema, and revenue diagnostics",
        mimeType: "application/json",
      },
      "POST /api/generate-fix": {
        accepts: paymentOptions("$2.00"),
        description: "Generate OpenAPI, .well-known/x402, and marketplace listing fixes for a paid endpoint",
        mimeType: "application/json",
      },
      "POST /api/demo/insight": {
        accepts: paymentOptions("$0.01"),
        description: "Demo paid x402 endpoint that returns a compact launch insight",
        mimeType: "application/json",
      },
      "GET /api/score": {
        accepts: paymentOptions("$0.01"),
        description: "Agent preflight score for an x402 endpoint before spending money",
        mimeType: "application/json",
      },
      "GET /api/compare": {
        accepts: paymentOptions("$0.02"),
        description: "Compare x402 endpoints by category, price, quality, and agent readiness",
        mimeType: "application/json",
      },
      "POST /api/batch-score": {
        accepts: paymentOptions("$0.10"),
        description: "Rank up to ten x402 endpoints by trust, discovery, and pricing quality",
        mimeType: "application/json",
      },
      "POST /api/deploy": {
        accepts: paymentOptions("$0.05"),
        description: "Publish a small static Markdown page and return a hosted URL for an agent artifact",
        mimeType: "application/json",
      },
      "POST /v1/artifacts": {
        accepts: paymentOptions("$0.10"),
        description: "Create an immutable signed agent artifact from Markdown or JSON",
        mimeType: "application/json",
      },
      "POST /v1/approvals": {
        accepts: paymentOptions("$0.25"),
        description: "Create a signed approval page with Approve, Reject, and Request changes actions",
        mimeType: "application/json",
      },
      "POST /api/packet": {
        accepts: paymentOptions("$0.05"),
        description: "Generate a structured diligence packet for an agent evaluating a company, person, repo, token, or website",
        mimeType: "application/json",
      },
      "POST /api/deep-packet": {
        accepts: paymentOptions("$0.25"),
        description: "Generate a deeper diligence packet with a fuller verification plan and recommendation workflow",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

app.post("/api/audit", async (request, response, next) => {
  try {
    const input = auditInputSchema.parse(request.body);
    response.json(await auditEndpoint(input, { deep: false }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deep-audit", async (request, response, next) => {
  try {
    const input = auditInputSchema.parse(request.body);
    response.json(await auditEndpoint(input, { deep: true }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/generate-fix", async (request, response, next) => {
  try {
    const input = auditInputSchema.parse(request.body);
    const audit = await auditEndpoint(input, { deep: true });
    response.json(generateFixes(input, audit));
  } catch (error) {
    next(error);
  }
});

app.post("/api/demo/insight", (request, response, next) => {
  try {
    const body = demoInsightInput(request.body);
    response.json({
      topic: body.topic,
      insight:
        "Agents buy endpoints when the price, schema, unpaid 402 challenge, and paid outcome are all visible before integration.",
      x402Takeaway:
        "A paid endpoint is more than middleware: it needs discovery metadata, clear fixed pricing, examples, and a public payment transcript.",
      nextAction: "Publish /openapi.json and /.well-known/x402, then submit the endpoint to ecosystem directories.",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

app.get("/api/score", async (request, response, next) => {
  try {
    const input = scoreQuerySchema.parse(request.query);
    response.json(await scoreEndpoint(input));
  } catch (error) {
    next(error);
  }
});

app.get("/api/compare", (request, response, next) => {
  try {
    const input = compareQuerySchema.parse(request.query);
    response.json(compareEndpoints(input));
  } catch (error) {
    next(error);
  }
});

app.post("/api/batch-score", async (request, response, next) => {
  try {
    const input = batchScoreInputSchema.parse(request.body);
    response.json(await batchScoreEndpoints(input.endpoints));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deploy", async (request, response, next) => {
  try {
    const input = deployInputSchema.parse(request.body);
    response.json(await createDeployment(input, { baseUrl: baseUrl(), deploymentRoot }));
  } catch (error) {
    next(error);
  }
});

app.post("/v1/artifacts", async (request, response, next) => {
  try {
    const input = deployInputSchema.parse(request.body);
    response.json(await createDeployment(input, { baseUrl: baseUrl(), deploymentRoot }));
  } catch (error) {
    next(error);
  }
});

app.get("/v1/artifacts/:artifactId", (request, response) => {
  response.sendFile(path.join(deploymentRoot, request.params.artifactId, "metadata.json"));
});

app.get("/v1/artifacts/:artifactId/verify", async (request, response, next) => {
  try {
    const metadata = JSON.parse(
      await readFile(path.join(deploymentRoot, request.params.artifactId, "metadata.json"), "utf8"),
    );
    response.json(verifyDeploymentReceipt(metadata));
  } catch (error) {
    next(error);
  }
});

app.get("/v1/artifacts/:artifactId/private", async (request, response, next) => {
  try {
    const artifactId = request.params.artifactId;
    const token = ownerTokenFromRequest(request);
    const privateMetadata = JSON.parse(
      await readFile(path.join(deploymentRoot, artifactId, "private-metadata.json"), "utf8"),
    ) as { ownerToken?: string };

    if (!token || privateMetadata.ownerToken !== token) {
      response.status(403).json({ error: "Invalid owner token" });
      return;
    }

    response.json(privateMetadata);
  } catch (error) {
    next(error);
  }
});

app.delete("/v1/artifacts/:artifactId", async (request, response, next) => {
  try {
    const artifactId = request.params.artifactId;
    const token = ownerTokenFromRequest(request);
    const privateMetadata = JSON.parse(
      await readFile(path.join(deploymentRoot, artifactId, "private-metadata.json"), "utf8"),
    ) as { ownerToken?: string };

    if (!token || privateMetadata.ownerToken !== token) {
      response.status(403).json({ error: "Invalid owner token" });
      return;
    }

    await rm(path.join(deploymentRoot, artifactId), { recursive: true, force: true });
    response.json({ deleted: true, artifactId, deletedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

app.post("/v1/approvals", async (request, response, next) => {
  try {
    const input = approvalInputSchema.parse(request.body);
    response.json(await createApproval(input, { baseUrl: baseUrl(), approvalRoot }));
  } catch (error) {
    next(error);
  }
});

app.get("/v1/approvals/:approvalId", (request, response) => {
  response.sendFile(path.join(approvalRoot, request.params.approvalId, "metadata.json"));
});

app.get("/v1/approvals/:approvalId/verify", async (request, response, next) => {
  try {
    const metadata = JSON.parse(
      await readFile(path.join(approvalRoot, request.params.approvalId, "metadata.json"), "utf8"),
    );
    response.json(verifyApprovalDecision(metadata));
  } catch (error) {
    next(error);
  }
});

app.get("/v1/approvals/:approvalId/private", async (request, response, next) => {
  try {
    const approvalId = request.params.approvalId;
    const token = ownerTokenFromRequest(request);
    const privateMetadata = JSON.parse(
      await readFile(path.join(approvalRoot, approvalId, "private-metadata.json"), "utf8"),
    ) as { ownerToken?: string };

    if (!token || privateMetadata.ownerToken !== token) {
      response.status(403).json({ error: "Invalid owner token" });
      return;
    }

    response.json(privateMetadata);
  } catch (error) {
    next(error);
  }
});

app.delete("/v1/approvals/:approvalId", async (request, response, next) => {
  try {
    const approvalId = request.params.approvalId;
    const token = ownerTokenFromRequest(request);
    const privateMetadata = JSON.parse(
      await readFile(path.join(approvalRoot, approvalId, "private-metadata.json"), "utf8"),
    ) as { ownerToken?: string };

    if (!token || privateMetadata.ownerToken !== token) {
      response.status(403).json({ error: "Invalid owner token" });
      return;
    }

    await rm(path.join(approvalRoot, approvalId), { recursive: true, force: true });
    response.json({ deleted: true, approvalId, deletedAt: new Date().toISOString() });
  } catch (error) {
    next(error);
  }
});

app.post("/v1/approvals/:approvalId/respond", async (request, response, next) => {
  try {
    const responseToken = typeof request.body.responseToken === "string" ? request.body.responseToken : "";
    const privateMetadata = JSON.parse(
      await readFile(path.join(approvalRoot, request.params.approvalId, "private-metadata.json"), "utf8"),
    ) as { responseToken?: string; callbackUrl?: string | null };

    if (privateMetadata.responseToken !== responseToken) {
      response.status(403).json({ error: "Invalid response token" });
      return;
    }

    const input = approvalResponseSchema.parse(request.body);
    const pendingPayload = {
      approvalId: request.params.approvalId,
      status: input.decision,
      response: {
        ...input,
        respondedAt: new Date().toISOString(),
      },
    };
    const callbackDelivery = privateMetadata.callbackUrl
      ? await deliverApprovalCallback(privateMetadata.callbackUrl, pendingPayload)
      : null;
    const result = await recordApprovalResponse(request.params.approvalId, input, {
      approvalRoot,
      callbackDelivery,
    });

    if (request.accepts("html") && !request.accepts("json")) {
      response.type("html").send(`<!doctype html><html><body><main><h1>Decision recorded</h1><p>Status: ${result.status}</p><p><a href="/approve/${request.params.approvalId}/">Back to approval page</a></p></main></body></html>`);
      return;
    }

    response.json({ ...result, callbackDelivery });
  } catch (error) {
    next(error);
  }
});

app.post("/api/packet", (request, response, next) => {
  try {
    const input = briefInputSchema.parse(request.body);
    response.json(buildDiligencePacket(input, { depth: "standard" }));
  } catch (error) {
    next(error);
  }
});

app.post("/api/deep-packet", (request, response, next) => {
  try {
    const input = briefInputSchema.parse(request.body);
    response.json(buildDiligencePacket(input, { depth: "deep" }));
  } catch (error) {
    next(error);
  }
});

app.use(
  (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    _next: express.NextFunction,
  ) => {
    if (error instanceof Error) {
      response.status(400).json({ error: error.message });
      return;
    }

    response.status(400).json({ error: "Invalid request" });
  },
);

app.listen(port, () => {
  console.log(`Agent Approval Receipts listening on http://localhost:${port}`);
});

function x402Discovery() {
  const publicBaseUrl = baseUrl();

  return {
    name: "Agent Approval Receipts",
    description:
      "An x402-paid approval and receipt endpoint for agents that need human checkpoints before taking action.",
    openapi: `${publicBaseUrl}/openapi.json`,
    resources: [
      paidResource("/v1/artifacts", "POST", "$0.10", "Create an immutable signed agent artifact"),
      paidResource("/v1/approvals", "POST", "$0.25", "Create an approval page with signed metadata"),
    ],
  };
}

function paidResource(path: string, method: AuditInput["method"], price: string, description: string) {
  return {
    url: `${baseUrl()}${path}`,
    method,
    description,
    accepts: paymentOptions(price),
  };
}

async function sendUnexpiredFile(input: { metadataPath: string; filePath: string; response: express.Response }) {
  const metadata = JSON.parse(await readFile(input.metadataPath, "utf8")) as { expiresAt?: string };
  if (metadata.expiresAt && new Date(metadata.expiresAt).getTime() <= Date.now()) {
    input.response.status(410).type("html").send(`<!doctype html><html><body><main><h1>Expired</h1><p>This agent artifact has expired.</p></main></body></html>`);
    return;
  }

  input.response.sendFile(input.filePath);
}

function ownerTokenFromRequest(request: express.Request) {
  const header = request.header("x-owner-token");
  if (header) return header;
  return typeof request.query.ownerToken === "string" ? request.query.ownerToken : null;
}

function routeParam(value: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function deliverApprovalCallback(callbackUrl: string, payload: unknown) {
  const validation = validateCallbackUrl(callbackUrl);
  if (!validation.ok) {
    return {
      ok: false,
      error: validation.reason,
      attemptedAt: new Date().toISOString(),
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-agent-artifact-event": "approval.responded",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    return {
      ok: response.ok,
      status: response.status,
      deliveredAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown callback error",
      attemptedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function validateCallbackUrl(callbackUrl: string) {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    return { ok: false, reason: "Invalid callback URL" };
  }

  if (url.protocol !== "https:") {
    return { ok: false, reason: "Callback URL must use https" };
  }

  const hostname = url.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    return { ok: false, reason: "Callback URL cannot target local or internal hosts" };
  }

  return { ok: true as const };
}

function demoInsightInput(value: unknown) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return { topic: "x402 launch readiness" };
  }

  const topic = "topic" in value && typeof value.topic === "string" ? value.topic : "x402 launch readiness";
  return { topic };
}

function baseUrl() {
  return (process.env.PUBLIC_BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, "");
}

function paymentOptions(price: string): PaymentOption[] {
  const options: PaymentOption[] = [
    {
      scheme: "exact",
      price,
      network: evmNetwork,
      payTo: evmAddress,
    },
  ];

  if (solanaAddress) {
    options.push({
      scheme: "exact",
      price,
      network: solanaNetwork,
      payTo: solanaAddress,
    });
  }

  return options;
}

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function networkEnv(name: string, fallback: Network): Network {
  const value = process.env[name] ?? fallback;
  if (!value.includes(":")) {
    throw new Error(`${name} must be a CAIP-2 network identifier like eip155:84532`);
  }
  return value as Network;
}
