import { z } from "zod";

const targetTypeSchema = z.enum(["company", "person", "repo", "token", "website"]);

const signalSchema = z.object({
  label: z.string().min(1).max(80),
  value: z.string().min(1).max(500),
  source: z.string().url().optional(),
});

const linkSchema = z.object({
  title: z.string().min(1).max(120).optional(),
  url: z.string().url(),
});

export const briefInputSchema = z.object({
  target: z.string().min(1).max(160),
  type: targetTypeSchema.default("company"),
  objective: z.string().min(1).max(500).default("Evaluate whether this target is worth deeper agent research."),
  links: z.array(linkSchema).max(12).default([]),
  signals: z.array(signalSchema).max(20).default([]),
});

export type BriefInput = z.infer<typeof briefInputSchema>;

export type DiligencePacket = {
  target: string;
  type: BriefInput["type"];
  objective: string;
  summary: string;
  facts: Array<{ claim: string; source: string | null; confidence: "low" | "medium" | "high" }>;
  recentSignals: Array<{ signal: string; interpretation: string; source: string | null }>;
  risks: Array<{ risk: string; severity: "low" | "medium" | "high"; mitigation: string }>;
  recommendedNextActions: string[];
  agentCallPlan: Array<{ step: string; preferredEndpointCategory: string; expectedOutput: string }>;
  citations: string[];
  generatedAt: string;
};

export function buildDiligencePacket(input: BriefInput, options: { depth: "preview" | "standard" | "deep" }): DiligencePacket {
  const facts = buildFacts(input);
  const recentSignals = buildSignals(input);
  const risks = buildRisks(input, options.depth);
  const actions = buildActions(input, options.depth);

  return {
    target: input.target,
    type: input.type,
    objective: input.objective,
    summary: summarize(input, facts, recentSignals, options.depth),
    facts,
    recentSignals,
    risks,
    recommendedNextActions: actions,
    agentCallPlan: buildAgentCallPlan(input, options.depth),
    citations: unique([
      ...input.links.map((link) => link.url),
      ...input.signals.flatMap((signal) => (signal.source ? [signal.source] : [])),
    ]),
    generatedAt: new Date().toISOString(),
  };
}

function buildFacts(input: BriefInput): DiligencePacket["facts"] {
  const linkFacts = input.links.map((link) => ({
    claim: `${input.target} has a relevant public reference${link.title ? `: ${link.title}` : ""}.`,
    source: link.url,
    confidence: "medium" as const,
  }));

  const signalFacts = input.signals.map((signal) => ({
    claim: `${signal.label}: ${signal.value}`,
    source: signal.source ?? null,
    confidence: signal.source ? ("high" as const) : ("medium" as const),
  }));

  const baseFacts = [
    {
      claim: `${input.target} should be evaluated as a ${input.type} target for the stated objective.`,
      source: null,
      confidence: "low" as const,
    },
  ];

  return [...signalFacts, ...linkFacts, ...baseFacts].slice(0, 12);
}

function buildSignals(input: BriefInput): DiligencePacket["recentSignals"] {
  if (input.signals.length === 0) {
    return [
      {
        signal: "No caller-provided signals",
        interpretation: "The next agent should gather fresh public evidence before making a recommendation.",
        source: null,
      },
    ];
  }

  return input.signals.slice(0, 8).map((signal) => ({
    signal: signal.label,
    interpretation: interpretSignal(signal.value),
    source: signal.source ?? null,
  }));
}

function buildRisks(input: BriefInput, depth: "preview" | "standard" | "deep"): DiligencePacket["risks"] {
  const risks: DiligencePacket["risks"] = [];

  if (input.links.length === 0) {
    risks.push({
      risk: "No cited links were supplied.",
      severity: "medium",
      mitigation: "Run web search or source extraction before treating this packet as decision-grade.",
    });
  }

  if (input.signals.length < 2) {
    risks.push({
      risk: "Sparse evidence set.",
      severity: depth === "preview" ? "low" : "medium",
      mitigation: "Add multiple independent signals such as website, repo, docs, social, pricing, or transaction data.",
    });
  }

  if (input.type === "token") {
    risks.push({
      risk: "Token evaluations can become stale quickly.",
      severity: "high",
      mitigation: "Refresh holder, liquidity, contract, and governance data immediately before spending or trading.",
    });
  }

  if (input.type === "repo") {
    risks.push({
      risk: "Repository activity may not reflect production usage.",
      severity: "medium",
      mitigation: "Cross-check commits, issues, releases, package downloads, deployments, and user references.",
    });
  }

  return risks.length ? risks : [
    {
      risk: "No obvious structural risk from caller-provided context.",
      severity: "low",
      mitigation: "Still verify claims against primary sources before using this packet for a paid decision.",
    },
  ];
}

function buildActions(input: BriefInput, depth: "preview" | "standard" | "deep") {
  const base = [
    `Verify ${input.target}'s primary source: website, docs, repo, or official profile.`,
    "Collect at least three source-backed claims before scoring fit.",
    "Separate factual evidence from inferred recommendation text.",
  ];

  if (depth === "preview") return base.slice(0, 2);

  const standard = [
    ...base,
    "Check recent activity and external validation from customers, contributors, transactions, or social references.",
    "Identify one concrete next paid API call that would reduce uncertainty.",
  ];

  if (depth === "standard") return standard;

  return [
    ...standard,
    "Compare against two alternatives in the same category.",
    "Produce a go/no-go recommendation with confidence and missing evidence.",
  ];
}

function buildAgentCallPlan(input: BriefInput, depth: "preview" | "standard" | "deep"): DiligencePacket["agentCallPlan"] {
  const steps = [
    {
      step: "Search public web and official sources",
      preferredEndpointCategory: "search",
      expectedOutput: "Canonical website, docs, profiles, and recent mentions",
    },
    {
      step: "Extract and normalize source facts",
      preferredEndpointCategory: "data",
      expectedOutput: "Claims with URLs, dates, and confidence levels",
    },
  ];

  if (input.type === "repo") {
    steps.push({
      step: "Inspect repository health",
      preferredEndpointCategory: "devtools",
      expectedOutput: "Commit cadence, open issues, releases, license, and contributor signals",
    });
  }

  if (input.type === "token") {
    steps.push({
      step: "Inspect onchain context",
      preferredEndpointCategory: "finance",
      expectedOutput: "Contract, liquidity, holder, governance, and transaction summaries",
    });
  }

  if (depth === "deep") {
    steps.push({
      step: "Score alternatives",
      preferredEndpointCategory: "ai",
      expectedOutput: "Ranked alternatives, tradeoffs, and final recommendation",
    });
  }

  return steps;
}

function summarize(
  input: BriefInput,
  facts: DiligencePacket["facts"],
  signals: DiligencePacket["recentSignals"],
  depth: "preview" | "standard" | "deep",
) {
  const evidenceCount = facts.filter((fact) => fact.source).length;
  const signalCount = signals.filter((signal) => signal.source || signal.signal !== "No caller-provided signals").length;

  return `${input.target} is a ${input.type} diligence target for: ${input.objective} This ${depth} packet contains ${evidenceCount} source-backed facts and ${signalCount} caller-provided signals. Treat it as structured agent input, not a final verdict, unless sources are fresh and primary.`;
}

function interpretSignal(value: string) {
  const lower = value.toLowerCase();
  if (lower.includes("launch") || lower.includes("new") || lower.includes("recent")) {
    return "Potential recency signal worth verifying against primary sources.";
  }
  if (lower.includes("customer") || lower.includes("usage") || lower.includes("transaction")) {
    return "Potential traction signal; compare against independent usage evidence.";
  }
  if (lower.includes("risk") || lower.includes("issue") || lower.includes("warning")) {
    return "Potential risk signal; prioritize verification before recommendation.";
  }
  return "Context signal supplied by caller; use as a lead for follow-up research.";
}

function unique(values: string[]) {
  return [...new Set(values)];
}
