import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const approvalInputSchema = z.object({
  title: z.string().min(1).max(120),
  markdown: z.string().min(1).max(80_000),
  description: z.string().max(240).optional(),
  callbackUrl: z.string().url().optional(),
  ttlHours: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
});

export const approvalResponseSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  note: z.string().max(1000).default(""),
  actor: z.string().max(120).default("anonymous"),
});

export type ApprovalInput = z.infer<typeof approvalInputSchema>;
export type ApprovalResponse = z.infer<typeof approvalResponseSchema>;

export type ApprovalRecord = {
  approvalId: string;
  title: string;
  description: string | null;
  url: string;
  metadataUrl: string;
  callbackUrl: string | null;
  status: "pending" | ApprovalResponse["decision"];
  ownerToken: string;
  responseToken: string;
  response: (ApprovalResponse & { respondedAt: string; decisionReceipt: DecisionReceipt }) | null;
  callbackDeliveries: CallbackDelivery[];
  receipt: {
    receiptId: string;
    signedAt: string;
    signature: string;
    signatureAlgorithm: "hmac-sha256";
    x402: {
      amountUsd: string;
      paymentScheme: "exact";
    };
  };
  expiresAt: string;
  createdAt: string;
};

type DecisionReceipt = {
  receiptId: string;
  signedAt: string;
  signature: string;
  signatureAlgorithm: "hmac-sha256";
};

export type CallbackDelivery = {
  ok: boolean;
  status?: number;
  error?: string;
  deliveredAt?: string;
  attemptedAt?: string;
};

export async function createApproval(
  input: ApprovalInput,
  options: { baseUrl: string; approvalRoot: string },
): Promise<ApprovalRecord> {
  const approvalId = `appr_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + input.ttlHours * 60 * 60 * 1000).toISOString();
  const responseToken = `resp_${randomBytes(18).toString("base64url")}`;
  const record: ApprovalRecord = {
    approvalId,
    title: input.title,
    description: input.description ?? null,
    url: `${options.baseUrl}/approve/${approvalId}/`,
    metadataUrl: `${options.baseUrl}/v1/approvals/${approvalId}`,
    callbackUrl: input.callbackUrl ?? null,
    status: "pending",
    ownerToken: `own_${randomBytes(24).toString("base64url")}`,
    responseToken,
    response: null,
    callbackDeliveries: [],
    receipt: buildReceipt(approvalId, createdAt.toISOString(), expiresAt),
    expiresAt,
    createdAt: createdAt.toISOString(),
  };

  const directory = path.join(options.approvalRoot, approvalId);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), renderApprovalPage(input, record), "utf8");
  await writeFile(path.join(directory, "metadata.json"), JSON.stringify(publicApprovalMetadata(record), null, 2), "utf8");
  await writeFile(path.join(directory, "private-metadata.json"), JSON.stringify(record, null, 2), "utf8");

  return record;
}

export async function recordApprovalResponse(
  approvalId: string,
  input: ApprovalResponse,
  options: { approvalRoot: string; callbackDelivery?: CallbackDelivery | null },
) {
  const directory = path.join(options.approvalRoot, approvalId);
  const privatePath = path.join(directory, "private-metadata.json");
  const record = JSON.parse(await readFile(privatePath, "utf8")) as ApprovalRecord;

  if (record.status !== "pending") {
    return publicApprovalMetadata(record);
  }

  const respondedAt = new Date().toISOString();
  const response = {
    ...input,
    respondedAt,
    decisionReceipt: buildDecisionReceipt({
      approvalId,
      decision: input.decision,
      note: input.note,
      actor: input.actor,
      respondedAt,
    }),
  };
  const updated: ApprovalRecord = {
    ...record,
    status: input.decision,
    response,
    callbackDeliveries: options.callbackDelivery
      ? [...record.callbackDeliveries, options.callbackDelivery]
      : record.callbackDeliveries,
  };

  await writeFile(privatePath, JSON.stringify(updated, null, 2), "utf8");
  await writeFile(path.join(directory, "metadata.json"), JSON.stringify(publicApprovalMetadata(updated), null, 2), "utf8");
  return publicApprovalMetadata(updated);
}

export function publicApprovalMetadata(record: ApprovalRecord) {
  return {
    approvalId: record.approvalId,
    title: record.title,
    description: record.description,
    url: record.url,
    metadataUrl: record.metadataUrl,
    status: record.status,
    response: record.response,
    callbackDeliveries: record.callbackDeliveries,
    receipt: record.receipt,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
  };
}

export function verifyApprovalDecision(metadata: unknown) {
  if (!isApprovalMetadata(metadata)) {
    return { valid: false, reason: "Invalid approval metadata shape" };
  }

  if (!metadata.response) {
    return {
      valid: false,
      reason: "Approval has no recorded decision",
      approvalId: metadata.approvalId,
      status: metadata.status,
      checkedAt: new Date().toISOString(),
    };
  }

  const payload = JSON.stringify({
    approvalId: metadata.approvalId,
    decision: metadata.response.decision,
    note: metadata.response.note,
    actor: metadata.response.actor,
    respondedAt: metadata.response.respondedAt,
    receiptId: metadata.response.decisionReceipt.receiptId,
    signedAt: metadata.response.decisionReceipt.signedAt,
  });
  const expected = signPayload(payload);

  return {
    valid: metadata.response.decisionReceipt.signature === expected,
    approvalId: metadata.approvalId,
    status: metadata.status,
    decision: metadata.response.decision,
    receiptId: metadata.response.decisionReceipt.receiptId,
    respondedAt: metadata.response.respondedAt,
    checkedAt: new Date().toISOString(),
  };
}

function renderApprovalPage(input: ApprovalInput, record: ApprovalRecord) {
  const body = markdownToHtml(input.markdown);
  const escapedTitle = escapeHtml(input.title);
  const escapedDescription = input.description ? `<p class="meta">${escapeHtml(input.description)}</p>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapedTitle}</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f8faf9;
        color: #171c1b;
      }

      body { margin: 0; }
      main { max-width: 820px; margin: 0 auto; padding: 48px 24px 72px; }
      h1 { margin: 0 0 12px; font-size: 36px; line-height: 1.1; }
      p, li { color: #4d5a57; line-height: 1.65; }
      .meta { margin: 0 0 30px; }
      article { padding-bottom: 28px; border-bottom: 1px solid #cbd8d4; }
      .actions { display: grid; gap: 12px; margin-top: 28px; }
      button {
        border: 0;
        border-radius: 8px;
        padding: 12px 14px;
        font: inherit;
        cursor: pointer;
        color: white;
        background: #171c1b;
      }
      button[value="approved"] { background: #0d6b57; }
      button[value="rejected"] { background: #9d2f2f; }
      textarea, input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid #cbd8d4;
        border-radius: 8px;
        padding: 10px 12px;
        font: inherit;
      }
      .footer { margin-top: 24px; font-size: 13px; color: #63706c; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapedTitle}</h1>
      ${escapedDescription}
      <article>${body}</article>
      <form class="actions" method="post" action="/v1/approvals/${record.approvalId}/respond">
        <input type="hidden" name="responseToken" value="${record.responseToken}" />
        <input name="actor" placeholder="Your name or agent id" maxlength="120" />
        <textarea name="note" placeholder="Optional note" maxlength="1000" rows="4"></textarea>
        <button name="decision" value="approved">Approve</button>
        <button name="decision" value="changes_requested">Request changes</button>
        <button name="decision" value="rejected">Reject</button>
      </form>
      <div class="footer">Approval id: ${record.approvalId}. Expires: ${record.expiresAt}.</div>
    </main>
  </body>
</html>`;
}

function markdownToHtml(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (trimmed.startsWith("## ")) return `<h2>${escapeHtml(trimmed.slice(3))}</h2>`;
      if (trimmed.startsWith("- ")) {
        const items = trimmed
          .split("\n")
          .filter((line) => line.trim().startsWith("- "))
          .map((line) => `<li>${escapeHtml(line.trim().slice(2))}</li>`)
          .join("");
        return `<ul>${items}</ul>`;
      }
      return `<p>${escapeHtml(trimmed)}</p>`;
    })
    .join("\n");
}

function buildReceipt(approvalId: string, createdAt: string, expiresAt: string): ApprovalRecord["receipt"] {
  const receiptId = `rcpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const signedAt = new Date().toISOString();
  const payload = JSON.stringify({ approvalId, createdAt, expiresAt, receiptId, signedAt });

  return {
    receiptId,
    signedAt,
    signature: signPayload(payload),
    signatureAlgorithm: "hmac-sha256",
    x402: {
      amountUsd: "0.25",
      paymentScheme: "exact",
    },
  };
}

function buildDecisionReceipt(input: {
  approvalId: string;
  decision: ApprovalResponse["decision"];
  note: string;
  actor: string;
  respondedAt: string;
}): DecisionReceipt {
  const receiptId = `drcpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const signedAt = new Date().toISOString();
  const payload = JSON.stringify({ ...input, receiptId, signedAt });

  return {
    receiptId,
    signedAt,
    signature: signPayload(payload),
    signatureAlgorithm: "hmac-sha256",
  };
}

function signPayload(payload: string) {
  const secret = process.env.ARTIFACT_SIGNING_SECRET ?? "local-dev-artifact-signing-secret";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isApprovalMetadata(value: unknown): value is ReturnType<typeof publicApprovalMetadata> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;

  if (
    typeof record.approvalId !== "string" ||
    typeof record.status !== "string" ||
    !["pending", "approved", "rejected", "changes_requested"].includes(record.status)
  ) {
    return false;
  }

  if (record.response === null || record.response === undefined) return true;
  if (typeof record.response !== "object" || Array.isArray(record.response)) return false;

  const response = record.response as Record<string, unknown>;
  if (typeof response.decisionReceipt !== "object" || response.decisionReceipt === null || Array.isArray(response.decisionReceipt)) {
    return false;
  }

  const receipt = response.decisionReceipt as Record<string, unknown>;
  return (
    typeof response.decision === "string" &&
    typeof response.note === "string" &&
    typeof response.actor === "string" &&
    typeof response.respondedAt === "string" &&
    typeof receipt.receiptId === "string" &&
    typeof receipt.signedAt === "string" &&
    typeof receipt.signature === "string"
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
