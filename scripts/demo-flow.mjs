import path from "node:path";
import { createApproval, recordApprovalResponse } from "../dist/approval.js";
import { createDeployment, verifyDeploymentReceipt } from "../dist/deploy.js";

const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:4021";
const dataRoot = process.env.DATA_DIR ?? process.cwd();
const artifactRoot = path.join(dataRoot, "deployments");
const approvalRoot = path.join(dataRoot, "approvals");

const artifact = await createDeployment(
  {
    title: "Vendor Review",
    description: "Signed report artifact created by an agent.",
    template: "report",
    ttlHours: 168,
    data: {
      summary: "This vendor is ready for a small test purchase pending human approval.",
      fields: [
        { label: "Recommendation", value: "Approve limited trial" },
        { label: "Max spend", value: "$29/month" },
      ],
      sections: [
        {
          heading: "Evidence",
          bullets: ["Clear public pricing", "Public docs", "Low-risk cancellation path"],
        },
        {
          heading: "Next step",
          body: "Send the approval page to a human reviewer before the agent spends money.",
        },
      ],
    },
  },
  { baseUrl, deploymentRoot: artifactRoot },
);

const verification = verifyDeploymentReceipt({
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
});

const approval = await createApproval(
  {
    title: "Approve vendor purchase",
    description: "Human checkpoint for an agent decision.",
    ttlHours: 72,
    markdown: "## Request\n\nApprove a $29/month test purchase for this vendor.\n\n- Clear docs\n- Low risk\n- Cancel any time",
  },
  { baseUrl, approvalRoot },
);

const approvalDecision = await recordApprovalResponse(
  approval.approvalId,
  {
    decision: "approved",
    note: "Approved for a limited trial.",
    actor: "demo-human",
  },
  { approvalRoot },
);

console.log(
  JSON.stringify(
    {
      artifact: {
        url: artifact.url,
        metadataUrl: artifact.metadataUrl,
        sha256: artifact.sha256,
        receiptId: artifact.receipt.receiptId,
        receiptValid: verification.valid,
      },
      approval: {
        url: approval.url,
        metadataUrl: approval.metadataUrl,
        status: approvalDecision.status,
        response: approvalDecision.response,
      },
    },
    null,
    2,
  ),
);
