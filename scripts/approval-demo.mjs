import path from "node:path";
import { createApproval, recordApprovalResponse } from "../dist/approval.js";

const baseUrl = process.env.PUBLIC_BASE_URL ?? "http://localhost:4021";
const dataRoot = process.env.DATA_DIR ?? process.cwd();
const approvalRoot = path.join(dataRoot, "approvals");

const approval = await createApproval(
  {
    title: "Approve SaaS trial purchase",
    description: "Human checkpoint before an agent spends money.",
    ttlHours: 72,
    markdown: `## Request

The agent wants approval to buy a $29/month SaaS trial.

- Purpose: test vendor API for one workflow
- Max spend: $29
- Risk: low, cancel any time
- Agent action after approval: proceed with purchase and store receipt`,
  },
  { baseUrl, approvalRoot },
);

const decision = await recordApprovalResponse(
  approval.approvalId,
  {
    decision: "approved",
    note: "Approved for one-month trial only.",
    actor: "human-reviewer",
  },
  { approvalRoot },
);

console.log(
  JSON.stringify(
    {
      story: "Agent creates a human approval checkpoint before spending money.",
      approvalPage: approval.url,
      metadata: approval.metadataUrl,
      status: decision.status,
      signedDecisionReceipt: decision.response?.decisionReceipt,
      nextAgentAction: decision.status === "approved" ? "Proceed with limited SaaS trial purchase." : "Do not purchase.",
    },
    null,
    2,
  ),
);
