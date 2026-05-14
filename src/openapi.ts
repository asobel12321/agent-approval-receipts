export function openapiSpec(options: { port: number }) {
  const serverUrl = `http://localhost:${options.port}`;

  const spec = {
    openapi: "3.1.0",
    info: {
      title: "Agent Approval Receipts",
      version: "0.2.0",
      description:
        "Creates x402-paid approval pages and signed decision receipts for autonomous agents.",
    },
    servers: [{ url: serverUrl }],
    paths: {
      "/health": {
        get: {
          operationId: "getHealth",
          summary: "Check service health",
          responses: {
            "200": {
              description: "Service is healthy",
              content: {
                "application/json": {
                  schema: objectSchema({
                    ok: { type: "boolean" },
                    service: { type: "string" },
                  }),
                },
              },
            },
          },
        },
      },
      "/.well-known/x402": {
        get: {
          operationId: "getX402Discovery",
          summary: "Discover paid x402 resources",
          responses: {
            "200": {
              description: "x402 discovery metadata",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/preview": {
        post: {
          operationId: "previewX402LaunchReadiness",
          summary: "Free preview audit for an x402 endpoint",
          requestBody: auditRequestBody(),
          responses: {
            "200": {
              description: "Preview audit",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/score-preview": {
        get: {
          operationId: "previewX402EndpointScore",
          summary: "Free preview score for an x402 endpoint",
          parameters: scoreQueryParameters(),
          responses: {
            "200": {
              description: "Free score preview",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/compare-preview": {
        get: {
          operationId: "previewX402EndpointComparison",
          summary: "Free preview comparison for x402 endpoint categories",
          parameters: compareQueryParameters(),
          responses: {
            "200": {
              description: "Free comparison preview",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/deploy-preview": {
        get: {
          operationId: "previewLegacyDeployExample",
          summary: "Preview the legacy deploy output shape",
          responses: {
            "200": {
              description: "Example deploy preview",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
        post: {
          operationId: "previewLegacyDeploy",
          summary: "Validate a Markdown page before paid artifact creation",
          requestBody: deployRequestBody(),
          responses: {
            "200": {
              description: "Deploy preview",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/deploy": {
        post: {
          operationId: "publishLegacyDeploy",
          summary: "Legacy route for publishing an agent artifact",
          "x-payment-info": {
            protocols: ["x402"],
            price: { mode: "fixed", currency: "USD", amount: "0.05" },
          },
          requestBody: deployRequestBody(),
          responses: {
            "200": {
              description: "Deployment metadata with hosted URL",
              content: {
                "application/json": {
                  schema: objectSchema({
                    artifactId: { type: "string" },
                    versionId: { type: "string" },
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    url: { type: "string", format: "uri" },
                    versionUrl: { type: "string", format: "uri" },
                    metadataUrl: { type: "string", format: "uri" },
                    publicMetadataUrl: { type: "string", format: "uri" },
                    bytes: { type: "integer" },
                    template: { type: "string" },
                    immutable: { type: "boolean" },
                    sha256: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" },
                    ownerToken: { type: "string" },
                    receipt: { type: "object", additionalProperties: true },
                    createdAt: { type: "string", format: "date-time" },
                  }, ["artifactId", "versionId", "title", "url", "metadataUrl", "bytes", "template", "sha256", "expiresAt", "receipt", "createdAt"]),
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
      "/v1/artifacts/preview": {
        post: {
          operationId: "previewAgentArtifact",
          summary: "Validate an agent artifact before paid creation",
          requestBody: deployRequestBody(),
          responses: {
            "200": {
              description: "Artifact preview with hash, expiry, and output URLs",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/v1/artifacts": {
        post: {
          operationId: "createAgentArtifact",
          summary: "Create an immutable signed agent artifact",
          "x-payment-info": {
            protocols: ["x402"],
            price: { mode: "fixed", currency: "USD", amount: "0.10" },
          },
          requestBody: deployRequestBody(),
          responses: {
            "200": {
              description: "Created artifact with URL, hash, expiry, owner token, and receipt",
              content: {
                "application/json": {
                  schema: objectSchema({
                    artifactId: { type: "string" },
                    versionId: { type: "string" },
                    title: { type: "string" },
                    description: { type: ["string", "null"] },
                    url: { type: "string", format: "uri" },
                    versionUrl: { type: "string", format: "uri" },
                    metadataUrl: { type: "string", format: "uri" },
                    publicMetadataUrl: { type: "string", format: "uri" },
                    bytes: { type: "integer" },
                    template: { type: "string" },
                    immutable: { type: "boolean" },
                    sha256: { type: "string" },
                    expiresAt: { type: "string", format: "date-time" },
                    ownerToken: { type: "string" },
                    receipt: { type: "object", additionalProperties: true },
                    createdAt: { type: "string", format: "date-time" },
                  }, ["artifactId", "versionId", "url", "versionUrl", "metadataUrl", "sha256", "expiresAt", "ownerToken", "receipt"]),
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
      "/v1/artifacts/{artifactId}": {
        get: {
          operationId: "getAgentArtifactMetadata",
          summary: "Get public metadata for an agent artifact",
          parameters: [
            {
              name: "artifactId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Public artifact metadata and receipt",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
        delete: {
          operationId: "deleteAgentArtifact",
          summary: "Delete an artifact using the owner token",
          parameters: [
            {
              name: "artifactId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "x-owner-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Artifact deleted",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "403": { description: "Invalid owner token" },
          },
        },
      },
      "/v1/artifacts/{artifactId}/verify": {
        get: {
          operationId: "verifyAgentArtifactReceipt",
          summary: "Verify an artifact receipt signature",
          parameters: [
            {
              name: "artifactId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Receipt verification result",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/v1/artifacts/{artifactId}/private": {
        get: {
          operationId: "getPrivateArtifactMetadata",
          summary: "Get private artifact metadata using the owner token",
          parameters: ownerTokenParameters("artifactId"),
          responses: {
            "200": {
              description: "Private artifact metadata",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "403": { description: "Invalid owner token" },
          },
        },
      },
      "/v1/approvals": {
        post: {
          operationId: "createApprovalPage",
          summary: "Create a signed approval page for a human checkpoint",
          "x-payment-info": {
            protocols: ["x402"],
            price: { mode: "fixed", currency: "USD", amount: "0.25" },
          },
          requestBody: approvalRequestBody(),
          responses: {
            "200": {
              description: "Created approval page with URL, tokens, receipt, and metadata",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
      "/v1/approvals/{approvalId}": {
        get: {
          operationId: "getApprovalMetadata",
          summary: "Get public approval page metadata",
          parameters: [
            {
              name: "approvalId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Approval metadata",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
        delete: {
          operationId: "deleteApprovalPage",
          summary: "Delete an approval page using the owner token",
          parameters: [
            {
              name: "approvalId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            {
              name: "x-owner-token",
              in: "header",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Approval deleted",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "403": { description: "Invalid owner token" },
          },
        },
      },
      "/v1/approvals/{approvalId}/verify": {
        get: {
          operationId: "verifyApprovalDecisionReceipt",
          summary: "Verify the signed approval decision receipt",
          parameters: [
            {
              name: "approvalId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Approval decision verification result",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/v1/approvals/{approvalId}/private": {
        get: {
          operationId: "getPrivateApprovalMetadata",
          summary: "Get private approval metadata using the owner token",
          parameters: ownerTokenParameters("approvalId"),
          responses: {
            "200": {
              description: "Private approval metadata",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "403": { description: "Invalid owner token" },
          },
        },
      },
      "/v1/approvals/{approvalId}/respond": {
        post: {
          operationId: "respondToApproval",
          summary: "Record approve, reject, or request changes decision",
          parameters: [
            {
              name: "approvalId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: objectSchema({
                  responseToken: { type: "string" },
                  decision: { type: "string", enum: ["approved", "rejected", "changes_requested"] },
                  note: { type: "string", maxLength: 1000 },
                  actor: { type: "string", maxLength: 120 },
                }, ["responseToken", "decision"]),
              },
              "application/x-www-form-urlencoded": {
                schema: objectSchema({
                  responseToken: { type: "string" },
                  decision: { type: "string", enum: ["approved", "rejected", "changes_requested"] },
                  note: { type: "string", maxLength: 1000 },
                  actor: { type: "string", maxLength: 120 },
                }, ["responseToken", "decision"]),
              },
            },
          },
          responses: {
            "200": {
              description: "Recorded decision",
              content: {
                "application/json": {
                  schema: objectSchema({
                    approvalId: { type: "string" },
                    status: { type: "string", enum: ["pending", "approved", "rejected", "changes_requested"] },
                    response: objectSchema({
                      decision: { type: "string", enum: ["approved", "rejected", "changes_requested"] },
                      note: { type: "string" },
                      actor: { type: "string" },
                      respondedAt: { type: "string", format: "date-time" },
                      decisionReceipt: {
                        type: "object",
                        properties: {
                          receiptId: { type: "string" },
                          signedAt: { type: "string", format: "date-time" },
                          signature: { type: "string" },
                          signatureAlgorithm: { type: "string", enum: ["hmac-sha256"] },
                        },
                      },
                    }, ["decision", "respondedAt", "decisionReceipt"]),
                    callbackDelivery: { type: ["object", "null"], additionalProperties: true },
                  }),
                },
              },
            },
            "403": { description: "Invalid response token" },
          },
        },
      },
      "/api/packet-preview": {
        get: {
          operationId: "previewDiligencePacket",
          summary: "Free preview diligence packet for an agent target",
          parameters: packetPreviewParameters(),
          responses: {
            "200": {
              description: "Free packet preview",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
          },
        },
      },
      "/api/packet": {
        post: paidPacketOperation({
          operationId: "buildDiligencePacket",
          summary: "Build a structured diligence packet for an agent",
          amount: "0.05",
          responseDescription: "Structured diligence packet",
        }),
      },
      "/api/deep-packet": {
        post: paidPacketOperation({
          operationId: "buildDeepDiligencePacket",
          summary: "Build a deeper diligence packet with verification plan",
          amount: "0.25",
          responseDescription: "Deep structured diligence packet",
        }),
      },
      "/api/audit": {
        post: paidOperation({
          operationId: "auditX402LaunchReadiness",
          summary: "Audit an x402 endpoint for launch readiness",
          amount: "0.10",
          responseDescription: "Launch readiness audit",
        }),
      },
      "/api/deep-audit": {
        post: paidOperation({
          operationId: "deepAuditX402LaunchReadiness",
          summary: "Deep x402 launch, runtime, and revenue audit",
          amount: "0.75",
          responseDescription: "Deep launch audit",
        }),
      },
      "/api/generate-fix": {
        post: paidOperation({
          operationId: "generateX402LaunchFixes",
          summary: "Generate OpenAPI, x402 discovery, and listing fixes",
          amount: "2.00",
          responseDescription: "Generated launch fix artifacts",
        }),
      },
      "/api/demo/insight": {
        post: {
          operationId: "getPaidX402LaunchInsight",
          summary: "Demo paid x402 endpoint that returns a launch insight",
          "x-payment-info": {
            protocols: ["x402"],
            price: { mode: "fixed", currency: "USD", amount: "0.01" },
          },
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: objectSchema({
                  topic: { type: "string", description: "The x402 topic to summarize." },
                }),
                examples: {
                  basic: {
                    value: { topic: "agent payments" },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Paid launch insight",
              content: {
                "application/json": {
                  schema: objectSchema({
                    topic: { type: "string" },
                    insight: { type: "string" },
                    x402Takeaway: { type: "string" },
                    nextAction: { type: "string" },
                    generatedAt: { type: "string", format: "date-time" },
                  }),
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
      "/api/score": {
        get: paidQueryOperation({
          operationId: "scoreX402Endpoint",
          summary: "Score an x402 endpoint before an agent spends money",
          amount: "0.01",
          parameters: scoreQueryParameters(),
          responseDescription: "Endpoint score and routing recommendation",
        }),
      },
      "/api/compare": {
        get: paidQueryOperation({
          operationId: "compareX402Endpoints",
          summary: "Compare x402 endpoints by category, price, and readiness",
          amount: "0.02",
          parameters: compareQueryParameters(),
          responseDescription: "Ranked x402 endpoint comparison",
        }),
      },
      "/api/batch-score": {
        post: {
          operationId: "batchScoreX402Endpoints",
          summary: "Rank up to ten x402 endpoints by agent readiness",
          "x-payment-info": {
            protocols: ["x402"],
            price: { mode: "fixed", currency: "USD", amount: "0.10" },
          },
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: objectSchema({
                  endpoints: {
                    type: "array",
                    minItems: 1,
                    maxItems: 10,
                    items: objectSchema({
                      url: { type: "string", format: "uri" },
                      method: {
                        type: "string",
                        enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
                        default: "POST",
                      },
                      body: {},
                    }, ["url"]),
                  },
                }, ["endpoints"]),
                examples: {
                  demo: {
                    value: {
                      endpoints: [
                        { url: "http://localhost:4021/api/demo/insight", method: "POST", body: { topic: "agent payments" } },
                      ],
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Ranked endpoint scores",
              content: {
                "application/json": {
                  schema: { type: "object", additionalProperties: true },
                },
              },
            },
            "402": { description: "Payment Required" },
          },
        },
      },
    },
  };

  return {
    ...spec,
    paths: publicPaths(spec.paths),
  };
}

function publicPaths(paths: Record<string, unknown>) {
  const publicPathNames = [
    "/health",
    "/.well-known/x402",
    "/api/deploy-preview",
    "/v1/artifacts/preview",
    "/v1/artifacts",
    "/v1/artifacts/{artifactId}",
    "/v1/artifacts/{artifactId}/verify",
    "/v1/artifacts/{artifactId}/private",
    "/v1/approvals",
    "/v1/approvals/{approvalId}",
    "/v1/approvals/{approvalId}/verify",
    "/v1/approvals/{approvalId}/private",
    "/v1/approvals/{approvalId}/respond",
  ];

  return Object.fromEntries(publicPathNames.map((name) => [name, paths[name]]).filter(([, value]) => value));
}

function ownerTokenParameters(idName: "artifactId" | "approvalId") {
  return [
    {
      name: idName,
      in: "path",
      required: true,
      schema: { type: "string" },
    },
    {
      name: "x-owner-token",
      in: "header",
      required: true,
      schema: { type: "string" },
    },
  ];
}

function approvalRequestBody() {
  return {
    required: true,
    content: {
      "application/json": {
        schema: objectSchema({
          title: {
            type: "string",
            maxLength: 120,
          },
          description: {
            type: "string",
            maxLength: 240,
          },
          markdown: {
            type: "string",
            maxLength: 80000,
            description: "Approval page body in Markdown.",
          },
          callbackUrl: {
            type: "string",
            format: "uri",
            description: "Optional HTTPS webhook URL. Local/internal hosts are rejected.",
          },
          ttlHours: {
            type: "integer",
            minimum: 1,
            maximum: 720,
            default: 168,
          },
        }, ["title", "markdown"]),
        examples: {
          approval: {
            value: {
              title: "Approve vendor purchase",
              description: "Human checkpoint for an agent decision.",
              markdown: "## Request\n\nApprove a $29/month test purchase for this vendor.\n\n- Clear docs\n- Low risk\n- Cancel any time",
              ttlHours: 72,
            },
          },
        },
      },
    },
  };
}

function deployRequestBody() {
  return {
    required: true,
    content: {
      "application/json": {
        schema: objectSchema({
          title: {
            type: "string",
            maxLength: 120,
            description: "Page title.",
          },
          description: {
            type: "string",
            maxLength: 240,
            description: "Optional page description.",
          },
          markdown: {
            type: "string",
            maxLength: 80000,
            description: "Markdown content to publish. Either markdown or data is required.",
          },
          data: {
            type: "object",
            description: "Structured report or receipt data. Either markdown or data is required.",
            properties: {
              summary: { type: "string" },
              fields: {
                type: "array",
                items: objectSchema({
                  label: { type: "string" },
                  value: { type: "string" },
                }, ["label", "value"]),
              },
              sections: {
                type: "array",
                items: objectSchema({
                  heading: { type: "string" },
                  body: { type: "string" },
                  bullets: { type: "array", items: { type: "string" } },
                }, ["heading"]),
              },
            },
          },
          template: {
            type: "string",
            enum: ["report", "receipt"],
            default: "report",
          },
          ttlHours: {
            type: "integer",
            minimum: 1,
            maximum: 720,
            default: 168,
          },
        }, ["title"]),
        examples: {
          report: {
            value: {
              title: "Vendor Review",
              description: "A short agent-generated review page.",
              template: "report",
              ttlHours: 168,
              data: {
                summary: "This vendor is ready for a test purchase.",
                fields: [{ label: "Recommendation", value: "Approve limited trial" }],
                sections: [
                  {
                    heading: "Evidence",
                    bullets: ["Clear pricing", "Public docs", "Fast support path"],
                  },
                ],
              },
            },
          },
        },
      },
    },
  };
}

function paidPacketOperation(input: {
  operationId: string;
  summary: string;
  amount: string;
  responseDescription: string;
}) {
  return {
    operationId: input.operationId,
    summary: input.summary,
    "x-payment-info": {
      protocols: ["x402"],
      price: { mode: "fixed", currency: "USD", amount: input.amount },
    },
    requestBody: packetRequestBody(),
    responses: {
      "200": {
        description: input.responseDescription,
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: true },
          },
        },
      },
      "402": { description: "Payment Required" },
    },
  };
}

function paidOperation(input: {
  operationId: string;
  summary: string;
  amount: string;
  responseDescription: string;
}) {
  return {
    operationId: input.operationId,
    summary: input.summary,
    "x-payment-info": {
      protocols: ["x402"],
      price: { mode: "fixed", currency: "USD", amount: input.amount },
    },
    requestBody: auditRequestBody(),
    responses: {
      "200": {
        description: input.responseDescription,
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: true },
          },
        },
      },
      "402": { description: "Payment Required" },
    },
  };
}

function paidQueryOperation(input: {
  operationId: string;
  summary: string;
  amount: string;
  parameters: unknown[];
  responseDescription: string;
}) {
  return {
    operationId: input.operationId,
    summary: input.summary,
    parameters: input.parameters,
    "x-payment-info": {
      protocols: ["x402"],
      price: { mode: "fixed", currency: "USD", amount: input.amount },
    },
    responses: {
      "200": {
        description: input.responseDescription,
        content: {
          "application/json": {
            schema: { type: "object", additionalProperties: true },
          },
        },
      },
      "402": { description: "Payment Required" },
    },
  };
}

function packetRequestBody() {
  return {
    required: true,
    content: {
      "application/json": {
        schema: objectSchema({
          target: {
            type: "string",
            description: "Company, person, repo, token, or website to evaluate.",
          },
          type: {
            type: "string",
            enum: ["company", "person", "repo", "token", "website"],
            default: "company",
          },
          objective: {
            type: "string",
            description: "The decision or research objective for this packet.",
          },
          links: {
            type: "array",
            maxItems: 12,
            items: objectSchema({
              title: { type: "string" },
              url: { type: "string", format: "uri" },
            }, ["url"]),
          },
          signals: {
            type: "array",
            maxItems: 20,
            items: objectSchema({
              label: { type: "string" },
              value: { type: "string" },
              source: { type: "string", format: "uri" },
            }, ["label", "value"]),
          },
        }, ["target"]),
        examples: {
          merit: {
            value: {
              target: "Merit Systems",
              type: "company",
              objective: "Evaluate fit for agentic commerce and x402 infrastructure.",
              links: [{ title: "Homepage", url: "https://www.merit.systems/" }],
              signals: [
                {
                  label: "Category",
                  value: "Agentic commerce infrastructure",
                  source: "https://www.merit.systems/",
                },
              ],
            },
          },
        },
      },
    },
  };
}

function packetPreviewParameters() {
  return [
    {
      name: "target",
      in: "query",
      required: true,
      schema: { type: "string" },
      description: "Company, person, repo, token, or website to preview.",
    },
    {
      name: "type",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: ["company", "person", "repo", "token", "website"],
        default: "company",
      },
      description: "Target type.",
    },
    {
      name: "objective",
      in: "query",
      required: false,
      schema: { type: "string" },
      description: "Research objective.",
    },
  ];
}

function auditRequestBody() {
  return {
    required: true,
    content: {
      "application/json": {
        schema: objectSchema({
          url: {
            type: "string",
            format: "uri",
            description: "The x402 endpoint URL to audit.",
          },
          method: {
            type: "string",
            enum: ["GET", "POST", "PUT", "PATCH", "DELETE"],
            default: "POST",
            description: "HTTP method to use when probing the unpaid 402 challenge.",
          },
          body: {
            description: "Optional JSON body to send when probing non-GET paid endpoints.",
          },
        }, ["url"]),
        examples: {
          demo: {
            value: {
              url: "http://localhost:4021/api/demo/insight",
              method: "POST",
              body: { topic: "agent payments" },
            },
          },
        },
      },
    },
  };
}

function scoreQueryParameters() {
  return [
    {
      name: "url",
      in: "query",
      required: true,
      schema: { type: "string", format: "uri" },
      description: "The x402 endpoint URL to score.",
    },
    {
      name: "method",
      in: "query",
      required: false,
      schema: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"], default: "POST" },
      description: "HTTP method for the target endpoint.",
    },
  ];
}

function compareQueryParameters() {
  return [
    {
      name: "category",
      in: "query",
      required: false,
      schema: {
        type: "string",
        enum: ["search", "data", "ai", "devtools", "finance", "identity", "any"],
        default: "any",
      },
      description: "Endpoint category to compare.",
    },
    {
      name: "limit",
      in: "query",
      required: false,
      schema: { type: "integer", minimum: 1, maximum: 25, default: 10 },
      description: "Maximum number of comparison rows.",
    },
  ];
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []) {
  return {
    type: "object",
    required,
    properties,
  };
}
