import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

export const deployInputSchema = z.object({
  title: z.string().min(1).max(120),
  markdown: z.string().min(1).max(80_000).optional(),
  data: z
    .object({
      summary: z.string().max(2000).optional(),
      sections: z
        .array(
          z.object({
            heading: z.string().min(1).max(120),
            body: z.string().max(5000).optional(),
            bullets: z.array(z.string().min(1).max(500)).max(20).default([]),
          }),
        )
        .max(12)
        .default([]),
      fields: z
        .array(
          z.object({
            label: z.string().min(1).max(80),
            value: z.string().min(1).max(500),
          }),
        )
        .max(30)
        .default([]),
    })
    .optional(),
  description: z.string().max(240).optional(),
  template: z.enum(["report", "receipt"]).default("report"),
  ttlHours: z.coerce.number().int().min(1).max(24 * 30).default(24 * 7),
}).refine((value) => value.markdown || value.data, {
  message: "Either markdown or data is required.",
  path: ["markdown"],
});

export type DeployInput = z.infer<typeof deployInputSchema>;

export type DeployPreview = {
  title: string;
  description: string | null;
  template: DeployInput["template"];
  expiresAt: string;
  sha256: string;
  estimatedBytes: number;
  warnings: string[];
  outputShape: {
    artifactId: string;
    versionId: string;
    url: string;
    versionUrl: string;
    metadataUrl: string;
  };
};

export type Deployment = {
  artifactId: string;
  versionId: string;
  title: string;
  description: string | null;
  url: string;
  versionUrl: string;
  metadataUrl: string;
  publicMetadataUrl: string;
  bytes: number;
  template: DeployInput["template"];
  immutable: true;
  sha256: string;
  expiresAt: string;
  ownerToken: string;
  receipt: ArtifactReceipt;
  createdAt: string;
};

type ArtifactReceipt = {
  receiptId: string;
  signedAt: string;
  signature: string;
  signatureAlgorithm: "hmac-sha256";
  x402: {
    amountUsd: string;
    paymentScheme: "exact";
  };
};

export function previewDeployment(input: DeployInput, options: { baseUrl: string }): DeployPreview {
  input = normalizeDeployInput(input);
  const artifactId = "art_generated";
  const versionId = "ver_generated";
  const html = renderPage(input);
  const createdAt = new Date();
  const expiresAt = expiryDate(createdAt, input.ttlHours).toISOString();

  return {
    title: input.title,
    description: input.description ?? null,
    template: input.template,
    expiresAt,
    sha256: sha256Hex(html),
    estimatedBytes: Buffer.byteLength(html, "utf8"),
    warnings: deploymentWarnings(input),
    outputShape: {
      artifactId,
      versionId,
      url: `${options.baseUrl}/a/${artifactId}/`,
      versionUrl: `${options.baseUrl}/a/${artifactId}/v/${versionId}/`,
      metadataUrl: `${options.baseUrl}/v1/artifacts/${artifactId}`,
    },
  };
}

export async function createDeployment(
  input: DeployInput,
  options: { baseUrl: string; deploymentRoot: string },
): Promise<Deployment> {
  input = normalizeDeployInput(input);
  const artifactId = `art_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const versionId = `ver_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const directory = path.join(options.deploymentRoot, artifactId);
  const versionDirectory = path.join(directory, "v", versionId);
  const createdAtDate = new Date();
  const createdAt = createdAtDate.toISOString();
  const expiresAt = expiryDate(createdAtDate, input.ttlHours).toISOString();
  const html = renderPage(input);
  const sha256 = sha256Hex(html);
  const receipt = buildReceipt({
    artifactId,
    versionId,
    sha256,
    createdAt,
    expiresAt,
  });
  const deployment: Deployment = {
    artifactId,
    versionId,
    title: input.title,
    description: input.description ?? null,
    url: `${options.baseUrl}/a/${artifactId}/`,
    versionUrl: `${options.baseUrl}/a/${artifactId}/v/${versionId}/`,
    metadataUrl: `${options.baseUrl}/v1/artifacts/${artifactId}`,
    publicMetadataUrl: `${options.baseUrl}/a/${artifactId}/metadata.json`,
    bytes: Buffer.byteLength(html, "utf8"),
    template: input.template,
    immutable: true,
    sha256,
    expiresAt,
    ownerToken: `own_${randomBytes(24).toString("base64url")}`,
    receipt,
    createdAt,
  };

  const publicMetadata = publicDeploymentMetadata(deployment);

  await mkdir(versionDirectory, { recursive: true });
  await writeFile(path.join(directory, "index.html"), html, "utf8");
  await writeFile(path.join(versionDirectory, "index.html"), html, "utf8");
  await writeFile(path.join(directory, "metadata.json"), JSON.stringify(publicMetadata, null, 2), "utf8");
  await writeFile(path.join(directory, "private-metadata.json"), JSON.stringify(deployment, null, 2), "utf8");

  return deployment;
}

export function publicDeploymentMetadata(deployment: Deployment) {
  return {
    artifactId: deployment.artifactId,
    versionId: deployment.versionId,
    title: deployment.title,
    description: deployment.description,
    url: deployment.url,
    versionUrl: deployment.versionUrl,
    template: deployment.template,
    immutable: deployment.immutable,
    sha256: deployment.sha256,
    expiresAt: deployment.expiresAt,
    bytes: deployment.bytes,
    receipt: deployment.receipt,
    createdAt: deployment.createdAt,
  };
}

export function verifyDeploymentReceipt(metadata: unknown) {
  if (!isPublicMetadata(metadata)) {
    return { valid: false, reason: "Invalid artifact metadata shape" };
  }

  const payload = JSON.stringify({
    artifactId: metadata.artifactId,
    versionId: metadata.versionId,
    sha256: metadata.sha256,
    createdAt: metadata.createdAt,
    expiresAt: metadata.expiresAt,
    receiptId: metadata.receipt.receiptId,
    signedAt: metadata.receipt.signedAt,
  });
  const expected = signPayload(payload);

  return {
    valid: metadata.receipt.signature === expected,
    receiptId: metadata.receipt.receiptId,
    artifactId: metadata.artifactId,
    versionId: metadata.versionId,
    sha256: metadata.sha256,
    expiresAt: metadata.expiresAt,
    checkedAt: new Date().toISOString(),
  };
}

function renderPage(input: DeployInput) {
  const body = input.markdown ? markdownToHtml(input.markdown) : dataToHtml(input);
  const escapedTitle = escapeHtml(input.title);
  const escapedDescription = escapeHtml(input.description ?? "Agent-published static page");
  const theme = themeTokens(input.template);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex, nofollow" />
    <title>${escapedTitle}</title>
    <meta name="description" content="${escapedDescription}" />
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: ${theme.text};
        background: ${theme.background};
      }

      body {
        margin: 0;
      }

      main {
        max-width: 780px;
        margin: 0 auto;
        padding: 56px 24px 72px;
      }

      article {
        line-height: 1.65;
      }

      h1 {
        margin: 0 0 12px;
        font-size: 38px;
        line-height: 1.08;
      }

      h2 {
        margin: 34px 0 10px;
        font-size: 24px;
      }

      h3 {
        margin: 26px 0 8px;
        font-size: 18px;
      }

      p, li {
        color: ${theme.muted};
        font-size: 16px;
      }

      a {
        color: ${theme.link};
      }

      code {
        padding: 2px 5px;
        border-radius: 5px;
        background: ${theme.code};
      }

      pre {
        overflow: auto;
        padding: 16px;
        border-radius: 8px;
        background: ${theme.code};
      }

      blockquote {
        margin: 20px 0;
        padding-left: 16px;
        border-left: 3px solid ${theme.accent};
        color: ${theme.muted};
      }

      dl {
        display: grid;
        grid-template-columns: minmax(120px, 0.45fr) 1fr;
        gap: 10px 16px;
        padding: 16px;
        border: 1px solid ${theme.border};
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.58);
      }

      dt {
        color: ${theme.muted};
        font-weight: 650;
      }

      dd {
        margin: 0;
        color: ${theme.text};
      }

      .meta {
        margin: 0 0 34px;
        color: ${theme.muted};
      }

      .artifact-footer {
        margin-top: 48px;
        padding-top: 18px;
        border-top: 1px solid ${theme.border};
        font-size: 13px;
        color: ${theme.muted};
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapedTitle}</h1>
      ${input.description ? `<p class="meta">${escapedDescription}</p>` : ""}
      <article>${body}</article>
      <div class="artifact-footer">Published as an immutable agent artifact. Verify hash and receipt in metadata.</div>
    </main>
  </body>
</html>`;
}

function markdownToHtml(markdown: string) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const html: string[] = [];
  let inList = false;
  let inCode = false;
  let codeLines: string[] = [];

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (inCode) {
        html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
        codeLines = [];
        inCode = false;
      } else {
        closeList();
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeLines.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      closeList();
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeList();
      html.push(`<h3>${inlineMarkdown(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      html.push(`<h2>${inlineMarkdown(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${inlineMarkdown(trimmed.slice(2))}</blockquote>`);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(trimmed.slice(2))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${inlineMarkdown(trimmed)}</p>`);
  }

  closeList();

  if (inCode) {
    html.push(`<pre><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`);
  }

  return html.join("\n");
}

function inlineMarkdown(value: string) {
  let html = escapeHtml(value);
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" rel="nofollow noreferrer">$1</a>');
  return html;
}

function deploymentWarnings(input: DeployInput) {
  const warnings: string[] = [];
  const content = input.markdown ?? JSON.stringify(input.data);
  if (content.length > 40_000) warnings.push("Large page. Keep agent-published reports concise for faster loading.");
  if (/https?:\/\/\S+/i.test(content) === false) {
    warnings.push("No links detected. Add source links if this is a report or claim-backed artifact.");
  }
  if (/<script|<iframe|<form|on\w+=/i.test(content)) {
    warnings.push("Active HTML is rendered as text. Scripts, forms, iframes, and event handlers are not supported.");
  }
  return warnings;
}

function dataToHtml(input: DeployInput) {
  const data = input.data;
  if (!data) return "";

  const html: string[] = [];
  if (data.summary) html.push(`<p>${escapeHtml(data.summary)}</p>`);

  if (data.fields.length > 0) {
    html.push("<dl>");
    for (const field of data.fields) {
      html.push(`<dt>${escapeHtml(field.label)}</dt><dd>${escapeHtml(field.value)}</dd>`);
    }
    html.push("</dl>");
  }

  for (const section of data.sections) {
    html.push(`<h2>${escapeHtml(section.heading)}</h2>`);
    if (section.body) html.push(`<p>${escapeHtml(section.body)}</p>`);
    if (section.bullets.length > 0) {
      html.push("<ul>");
      for (const bullet of section.bullets) {
        html.push(`<li>${escapeHtml(bullet)}</li>`);
      }
      html.push("</ul>");
    }
  }

  return html.join("\n");
}

function normalizeDeployInput(input: DeployInput) {
  return deployInputSchema.parse(input);
}

function themeTokens(template: DeployInput["template"]) {
  if (template === "receipt") {
    return {
      background: "#f8faf9",
      text: "#171c1b",
      muted: "#4d5a57",
      link: "#0d6b57",
      code: "#e8efed",
      accent: "#2f8f73",
      border: "#cbd8d4",
    };
  }

  return {
    background: "#f7f7f4",
    text: "#141414",
    muted: "#4d4d4d",
    link: "#164c8a",
    code: "#ececea",
    accent: "#171717",
    border: "#d8d8d2",
  };
}

function buildReceipt(input: {
  artifactId: string;
  versionId: string;
  sha256: string;
  createdAt: string;
  expiresAt: string;
}): ArtifactReceipt {
  const receiptId = `rcpt_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
  const signedAt = new Date().toISOString();
  const payload = JSON.stringify({ ...input, receiptId, signedAt });

  return {
    receiptId,
    signedAt,
    signature: signPayload(payload),
    signatureAlgorithm: "hmac-sha256",
    x402: {
      amountUsd: "0.10",
      paymentScheme: "exact",
    },
  };
}

function signPayload(payload: string) {
  const secret = process.env.ARTIFACT_SIGNING_SECRET ?? "local-dev-artifact-signing-secret";
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function isPublicMetadata(value: unknown): value is ReturnType<typeof publicDeploymentMetadata> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const receipt = record.receipt;
  if (typeof receipt !== "object" || receipt === null || Array.isArray(receipt)) return false;
  const receiptRecord = receipt as Record<string, unknown>;

  return (
    typeof record.artifactId === "string" &&
    typeof record.versionId === "string" &&
    typeof record.sha256 === "string" &&
    typeof record.createdAt === "string" &&
    typeof record.expiresAt === "string" &&
    typeof receiptRecord.receiptId === "string" &&
    typeof receiptRecord.signedAt === "string" &&
    typeof receiptRecord.signature === "string"
  );
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function expiryDate(createdAt: Date, ttlHours: number) {
  return new Date(createdAt.getTime() + ttlHours * 60 * 60 * 1000);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
