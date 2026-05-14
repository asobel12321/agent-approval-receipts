import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createApproval, recordApprovalResponse } from "../dist/approval.js";
import { createDeployment, verifyDeploymentReceipt } from "../dist/deploy.js";

const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:4021";
const dataRoot = process.env.DATA_DIR ?? process.cwd();
const artifactRoot = path.join(dataRoot, "deployments");
const approvalRoot = path.join(dataRoot, "approvals");
const demoRoot = path.join(dataRoot, "demo");

const artifact = await createDeployment(
  {
    title: "Vendor Trial Approval Brief",
    description: "Signed report prepared by an agent before requesting human approval.",
    template: "report",
    ttlHours: 168,
    data: {
      summary: "The agent recommends a limited $29/month SaaS trial, pending human approval.",
      fields: [
        { label: "Requested action", value: "Approve one-month vendor trial" },
        { label: "Maximum spend", value: "$29" },
        { label: "Risk level", value: "Low" },
      ],
      sections: [
        {
          heading: "Evidence",
          bullets: ["Pricing is public", "Docs are available", "Trial can be cancelled before renewal"],
        },
        {
          heading: "Agent next step",
          body: "If approved, the agent will purchase the trial, store the receipt, and report back with results.",
        },
      ],
    },
  },
  { baseUrl, deploymentRoot: artifactRoot },
);

const approval = await createApproval(
  {
    title: "Approve $29 SaaS trial",
    description: "Human checkpoint before an autonomous agent spends money.",
    ttlHours: 72,
    markdown: `## Request

Approve a one-month $29 SaaS trial.

- Agent has produced a signed brief
- Spend is capped at $29
- Trial can be cancelled before renewal
- Agent will store the purchase receipt after approval`,
  },
  { baseUrl, approvalRoot },
);

const decision = await recordApprovalResponse(
  approval.approvalId,
  {
    decision: "approved",
    note: "Approved for one-month trial only.",
    actor: "demo-human",
  },
  { approvalRoot },
);

const manifest = {
  createdAt: new Date().toISOString(),
  story: "Agent creates a signed report and approval checkpoint before spending money.",
  artifact: {
    url: artifact.url,
    metadataUrl: artifact.metadataUrl,
    verifyUrl: `${artifact.metadataUrl}/verify`,
    sha256: artifact.sha256,
    receiptValid: verifyDeploymentReceipt({
      artifactId: artifact.artifactId,
      versionId: artifact.versionId,
      title: artifact.title,
      description: artifact.description,
      url: artifact.url,
      versionUrl: artifact.versionUrl,
      template: artifact.template,
      immutable: artifact.immutable,
      sha256: artifact.sha256,
      expiresAt: artifact.expiresAt,
      bytes: artifact.bytes,
      receipt: artifact.receipt,
      createdAt: artifact.createdAt,
    }).valid,
  },
  approval: {
    url: approval.url,
    metadataUrl: approval.metadataUrl,
    verifyUrl: `${approval.metadataUrl}/verify`,
    status: decision.status,
    decisionReceipt: decision.response?.decisionReceipt,
  },
};

await mkdir(demoRoot, { recursive: true });
await writeFile(path.join(demoRoot, "latest.json"), JSON.stringify(manifest, null, 2), "utf8");
console.log(JSON.stringify(manifest, null, 2));
