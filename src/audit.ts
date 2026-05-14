import { z } from "zod";

const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const auditInputSchema = z.object({
  url: z.string().url(),
  method: httpMethodSchema.default("POST"),
  body: z.unknown().optional(),
});

export type AuditInput = z.infer<typeof auditInputSchema>;

export type AuditReport = {
  endpoint: string;
  method: AuditInput["method"];
  origin: string;
  score: number;
  verdict: "launch-ready" | "needs-cleanup" | "not-ready";
  scores: {
    x402Runtime: number;
    agentDiscovery: number;
    openapiQuality: number;
    pricing: number;
    conversion: number;
  };
  issues: string[];
  fixes: string[];
  listingAdvice: string[];
  revenueRecommendations: string[];
  observed: Record<string, unknown>;
  launchArtifacts: LaunchArtifacts;
};

type LaunchArtifacts = {
  openapiOperationPatch: Record<string, unknown>;
  wellKnownX402: Record<string, unknown>;
  agentListing: Record<string, unknown>;
};

type FetchJsonResult =
  | { ok: true; status: number; data: unknown }
  | { ok: false; status?: number; error?: string };

export async function auditEndpoint(input: AuditInput, options: { deep: boolean }): Promise<AuditReport> {
  const url = new URL(input.url);
  const origin = url.origin;
  const issues: string[] = [];
  const fixes: string[] = [];
  const listingAdvice: string[] = [];
  const observed: Record<string, unknown> = {};

  const scores = {
    x402Runtime: 100,
    agentDiscovery: 100,
    openapiQuality: 100,
    pricing: 100,
    conversion: 100,
  };

  const openapi = await fetchJson(`${origin}/openapi.json`);
  observed.openapi = summarizeFetch(openapi);

  if (!openapi.ok) {
    scores.agentDiscovery -= 35;
    scores.openapiQuality -= 25;
    issues.push("No /openapi.json found. Agent marketplaces and tool builders need a canonical discovery document.");
    fixes.push("Publish /openapi.json with operationIds, request/response schemas, 402 responses, and x-payment-info.");
  } else {
    inspectOpenApi(openapi.data, url.pathname, input.method, scores, issues, fixes, listingAdvice);
  }

  const wellKnown = await fetchJson(`${origin}/.well-known/x402`);
  observed.wellKnownX402 = summarizeFetch(wellKnown);

  if (!wellKnown.ok) {
    scores.agentDiscovery -= 8;
    issues.push("No /.well-known/x402 fallback found.");
    fixes.push("Add /.well-known/x402 so older clients and ecosystem crawlers can discover paid resources.");
  }

  if (options.deep) {
    const runtime = await inspectRuntimeChallenge(input);
    observed.runtime = runtime.observed;
    scores.x402Runtime += runtime.scoreDelta;
    issues.push(...runtime.issues);
    fixes.push(...runtime.fixes);
  }

  clampScores(scores);
  const score = Math.round(
    scores.x402Runtime * 0.25 +
      scores.agentDiscovery * 0.25 +
      scores.openapiQuality * 0.2 +
      scores.pricing * 0.15 +
      scores.conversion * 0.15,
  );

  const verdict = score >= 85 ? "launch-ready" : score >= 65 ? "needs-cleanup" : "not-ready";

  return {
    endpoint: input.url,
    method: input.method,
    origin,
    score,
    verdict,
    scores,
    issues: issues.length ? unique(issues) : ["No major discovery or payment issues detected."],
    fixes: unique(fixes),
    listingAdvice: unique([
      ...listingAdvice,
      "List the endpoint with a short outcome-driven name, one clear price, and a copy-pasteable JSON example.",
      "Keep a free preview or health route so agents can evaluate the service before paying.",
      "Publish a public demo transcript showing an unpaid request, the HTTP 402 challenge, and the paid success path.",
    ]),
    revenueRecommendations: [
      "Use a cheap fixed-price diagnostic call for repeat agent traffic.",
      "Offer a higher-priced remediation endpoint that returns patches or generated files, not just advice.",
      "Avoid custom accounts or API keys in the first paid path; the x402 value is programmatic payment at request time.",
      "Track successful paid calls and publish lightweight usage proof once the endpoint is live.",
    ],
    observed,
    launchArtifacts: buildLaunchArtifacts(input),
  };
}

export function generateFixes(input: AuditInput, audit: AuditReport) {
  return {
    endpoint: input.url,
    method: input.method,
    verdict: audit.verdict,
    score: audit.score,
    openapiOperationPatch: audit.launchArtifacts.openapiOperationPatch,
    wellKnownX402: audit.launchArtifacts.wellKnownX402,
    agentListing: audit.launchArtifacts.agentListing,
    checklist: audit.fixes,
  };
}

async function inspectRuntimeChallenge(input: AuditInput) {
  const issues: string[] = [];
  const fixes: string[] = [];
  let scoreDelta = 0;
  const observed: Record<string, unknown> = {};

  try {
    const response = await fetch(input.url, {
      method: input.method,
      headers: {
        accept: "application/json",
        ...(input.body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: input.body === undefined ? undefined : JSON.stringify(input.body),
    });
    const headers = Object.fromEntries(response.headers.entries());
    observed.method = input.method;
    observed.status = response.status;
    observed.paymentHeaders = Object.keys(headers).filter((name) => name.toLowerCase().includes("payment"));

    if (response.status !== 402) {
      scoreDelta -= 25;
      issues.push(`Expected an unpaid ${input.method} request to return HTTP 402, but got HTTP ${response.status}.`);
      fixes.push("Ensure protected routes return 402 Payment Required with payment instructions before payment.");
    } else if (!hasPaymentHeader(headers)) {
      scoreDelta -= 15;
      issues.push("The 402 response did not expose an obvious payment instruction header.");
      fixes.push("Return standard x402 payment instruction headers from the payment middleware.");
    }
  } catch (error) {
    scoreDelta -= 35;
    observed.error = error instanceof Error ? error.message : "Unknown runtime fetch error";
    issues.push("The endpoint could not be reached during runtime challenge inspection.");
    fixes.push("Make sure the paid route is publicly reachable and responds consistently.");
  }

  return { issues, fixes, scoreDelta, observed };
}

function inspectOpenApi(
  document: unknown,
  pathname: string,
  method: AuditInput["method"],
  scores: AuditReport["scores"],
  issues: string[],
  fixes: string[],
  listingAdvice: string[],
) {
  const text = JSON.stringify(document);
  const paths = isRecord(document) && isRecord(document.paths) ? document.paths : {};
  const operationCount = countOperations(paths);
  const operation = findOperation(paths, pathname, method);

  if (operationCount === 0) {
    scores.openapiQuality -= 30;
    issues.push("OpenAPI document has no discoverable operations under paths.");
    fixes.push("Add path operations for each endpoint agents should be able to call.");
  }

  if (!operation) {
    scores.agentDiscovery -= 18;
    scores.openapiQuality -= 15;
    issues.push(`OpenAPI does not document ${method} ${pathname}.`);
    fixes.push(`Add a ${method.toLowerCase()} operation for ${pathname} with request and response schemas.`);
  }

  if (!text.includes("x-payment-info")) {
    scores.agentDiscovery -= 30;
    scores.pricing -= 20;
    issues.push("OpenAPI exists but does not include x-payment-info.");
    fixes.push("Annotate paid operations with x-payment-info including protocol, fixed price, currency, and amount.");
  }

  if (!text.includes("\"402\"")) {
    scores.x402Runtime -= 10;
    scores.openapiQuality -= 10;
    issues.push("OpenAPI does not document 402 Payment Required responses.");
    fixes.push("Add a 402 response object to every paid operation.");
  }

  if (!text.includes("operationId")) {
    scores.openapiQuality -= 12;
    scores.conversion -= 8;
    issues.push("OpenAPI operations lack operationId values, which makes agent tool use weaker.");
    fixes.push("Add short verb+noun operationIds, for example launchAuditX402Endpoint.");
  }

  if (!text.includes("requestBody") && !text.includes("parameters")) {
    scores.openapiQuality -= 12;
    issues.push("OpenAPI does not describe request inputs.");
    fixes.push("Add requestBody schemas or parameters for every callable operation.");
  }

  if (!text.includes("\"200\"") && !text.includes("\"201\"")) {
    scores.openapiQuality -= 10;
    issues.push("OpenAPI does not document successful response schemas.");
    fixes.push("Add 200 response schemas with concrete JSON shapes.");
  }

  if (!text.includes("examples") && !text.includes("example")) {
    scores.conversion -= 8;
    issues.push("OpenAPI does not include examples.");
    fixes.push("Add request and response examples so agents can infer usage quickly.");
  }

  if (hasPriceValueWithoutAmount(document)) {
    scores.pricing -= 8;
    issues.push("OpenAPI may use price.value. Fixed x402 pricing is easier for agents when exposed as price.amount.");
    fixes.push("For fixed pricing, use price: { mode: \"fixed\", currency: \"USD\", amount: \"0.10\" }.");
  }

  if (!text.toLowerCase().includes("free") && !text.toLowerCase().includes("preview")) {
    scores.conversion -= 6;
    listingAdvice.push("Add a free preview route or documented health check so agents can learn what they are buying.");
  }
}

async function fetchJson(url: string): Promise<FetchJsonResult> {
  try {
    const response = await fetch(url, { headers: { accept: "application/json" } });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, status: response.status, data: await response.json() };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown fetch error" };
  }
}

function buildLaunchArtifacts(input: AuditInput): LaunchArtifacts {
  const url = new URL(input.url);
  const operationId = `${input.method.toLowerCase()}PaidX402Resource`;

  return {
    openapiOperationPatch: {
      [url.pathname]: {
        [input.method.toLowerCase()]: {
          operationId,
          summary: "Call a paid x402 resource",
          description: "Returns a paid result after an x402 payment challenge is satisfied.",
          requestBody:
            input.method === "GET"
              ? undefined
              : {
                  required: false,
                  content: {
                    "application/json": {
                      schema: { type: "object", additionalProperties: true },
                      examples: {
                        basic: {
                          value: input.body ?? { query: "example input" },
                        },
                      },
                    },
                  },
                },
          responses: {
            "200": {
              description: "Successful paid response",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "402": { description: "Payment Required" },
          },
          "x-payment-info": {
            protocols: ["x402"],
            price: { mode: "fixed", currency: "USD", amount: "0.10" },
          },
        },
      },
    },
    wellKnownX402: {
      resources: [
        {
          url: input.url,
          method: input.method,
          accepts: [
            {
              scheme: "exact",
              network: "eip155:84532",
              price: "$0.10",
              asset: "USDC",
            },
          ],
        },
      ],
    },
    agentListing: {
      name: "Paid x402 Resource",
      url: input.url,
      method: input.method,
      category: "developer-tooling",
      oneLineValue: "A paid HTTP resource that agents can discover, price, and call programmatically.",
      suggestedPrice: "$0.10",
      requiredDocs: ["/openapi.json", "/.well-known/x402", "HTTP 402 challenge transcript"],
    },
  };
}

function summarizeFetch(result: FetchJsonResult) {
  if (result.ok) return { ok: true, status: result.status };
  return { ok: false, status: result.status, error: result.error };
}

function hasPaymentHeader(headers: Record<string, string>) {
  return Object.keys(headers).some((name) => name.toLowerCase().includes("payment"));
}

function findOperation(paths: Record<string, unknown>, pathname: string, method: AuditInput["method"]) {
  const pathItem = paths[pathname];
  if (!isRecord(pathItem)) return undefined;
  const operation = pathItem[method.toLowerCase()];
  return isRecord(operation) ? operation : undefined;
}

function countOperations(paths: Record<string, unknown>) {
  const methods = new Set(["get", "post", "put", "patch", "delete"]);
  let count = 0;

  for (const pathItem of Object.values(paths)) {
    if (!isRecord(pathItem)) continue;
    for (const method of Object.keys(pathItem)) {
      if (methods.has(method.toLowerCase())) count += 1;
    }
  }

  return count;
}

function hasPriceValueWithoutAmount(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((item) => hasPriceValueWithoutAmount(item));
  if (!isRecord(value)) return false;

  const price = value.price;
  if (isRecord(price) && "value" in price && !("amount" in price)) return true;
  return Object.values(value).some((item) => hasPriceValueWithoutAmount(item));
}

function clampScores(scores: AuditReport["scores"]) {
  for (const key of Object.keys(scores) as Array<keyof AuditReport["scores"]>) {
    scores[key] = Math.max(0, Math.min(100, Math.round(scores[key])));
  }
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
