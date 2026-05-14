import { z } from "zod";
import { auditEndpoint, auditInputSchema, type AuditInput } from "./audit.js";

const endpointCategorySchema = z.enum(["search", "data", "ai", "devtools", "finance", "identity", "any"]);

export const scoreQuerySchema = z.object({
  url: z.string().url(),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("POST"),
});

export const batchScoreInputSchema = z.object({
  endpoints: z.array(auditInputSchema).min(1).max(10),
});

export const compareQuerySchema = z.object({
  category: endpointCategorySchema.default("any"),
  limit: z.coerce.number().int().min(1).max(25).default(10),
});

export type EndpointScore = {
  url: string;
  method: AuditInput["method"];
  score: number;
  verdict: string;
  risk: "low" | "medium" | "high";
  priceClarity: number;
  discoveryQuality: number;
  openapiQuality: number;
  x402Readiness: number;
  agentFit: number;
  topIssues: string[];
  nextBestFix: string | null;
  recommendedForAgents: boolean;
  checkedAt: string;
};

type CompareEndpoint = {
  name: string;
  category: z.infer<typeof endpointCategorySchema>;
  url: string;
  summary: string;
  estimatedPriceUsd: number;
  volumeSignal: "high" | "medium" | "emerging";
  score: number;
  notes: string[];
};

const seededEndpoints: CompareEndpoint[] = [
  {
    name: "Launch Doctor",
    category: "devtools",
    url: "/api/score",
    summary: "Trust, discovery, and pricing score for x402 endpoints before an agent spends.",
    estimatedPriceUsd: 0.01,
    volumeSignal: "emerging",
    score: 88,
    notes: ["Built for repeat preflight checks", "Strong OpenAPI and discovery surface"],
  },
  {
    name: "x402 Launch Deep Audit",
    category: "devtools",
    url: "/api/deep-audit",
    summary: "Deep launch-readiness report with runtime challenge inspection and generated fixes.",
    estimatedPriceUsd: 0.75,
    volumeSignal: "emerging",
    score: 84,
    notes: ["Best for sellers before listing", "Higher price, lower frequency"],
  },
  {
    name: "Search/Data Endpoint",
    category: "search",
    url: "https://example.com/search",
    summary: "Placeholder comparator row for search providers until live x402scan ingestion is added.",
    estimatedPriceUsd: 0.05,
    volumeSignal: "high",
    score: 76,
    notes: ["High repeat-call category", "Replace with live provider data after launch"],
  },
  {
    name: "On-chain Analytics Endpoint",
    category: "finance",
    url: "https://example.com/onchain",
    summary: "Placeholder comparator row for DeFi and wallet intelligence providers.",
    estimatedPriceUsd: 0.08,
    volumeSignal: "medium",
    score: 73,
    notes: ["Useful for agentic commerce risk checks", "Needs live pricing ingestion"],
  },
  {
    name: "Identity/Risk Endpoint",
    category: "identity",
    url: "https://example.com/identity",
    summary: "Placeholder comparator row for compliance, KYB, KYC, and agent trust providers.",
    estimatedPriceUsd: 0.12,
    volumeSignal: "emerging",
    score: 79,
    notes: ["Underserved category", "Strong alignment with agentic commerce safety"],
  },
];

export async function scoreEndpoint(input: AuditInput): Promise<EndpointScore> {
  const audit = await auditEndpoint(input, { deep: false });
  const topIssues = audit.issues.slice(0, 4);
  const agentFit = Math.round(audit.scores.agentDiscovery * 0.35 + audit.scores.pricing * 0.3 + audit.scores.conversion * 0.35);

  return {
    url: input.url,
    method: input.method,
    score: audit.score,
    verdict: audit.verdict,
    risk: riskFromScore(audit.score),
    priceClarity: audit.scores.pricing,
    discoveryQuality: audit.scores.agentDiscovery,
    openapiQuality: audit.scores.openapiQuality,
    x402Readiness: audit.scores.x402Runtime,
    agentFit,
    topIssues,
    nextBestFix: audit.fixes[0] ?? null,
    recommendedForAgents: audit.score >= 75 && audit.scores.pricing >= 70 && audit.scores.agentDiscovery >= 70,
    checkedAt: new Date().toISOString(),
  };
}

export async function batchScoreEndpoints(inputs: AuditInput[]) {
  const scored = await Promise.all(inputs.map((input) => scoreEndpoint(input)));
  return {
    count: scored.length,
    ranked: scored.sort((a, b) => b.score - a.score),
    checkedAt: new Date().toISOString(),
  };
}

export function compareEndpoints(input: z.infer<typeof compareQuerySchema>) {
  const rows = seededEndpoints
    .filter((endpoint) => input.category === "any" || endpoint.category === input.category)
    .sort((a, b) => b.score - a.score || a.estimatedPriceUsd - b.estimatedPriceUsd)
    .slice(0, input.limit);

  return {
    category: input.category,
    count: rows.length,
    endpoints: rows,
    caveat:
      "Seeded comparison data. Next launch step: ingest live x402scan and /.well-known/x402 pricing feeds.",
    generatedAt: new Date().toISOString(),
  };
}

function riskFromScore(score: number): EndpointScore["risk"] {
  if (score >= 85) return "low";
  if (score >= 65) return "medium";
  return "high";
}
