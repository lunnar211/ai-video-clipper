import { NextResponse } from "next/server";

/**
 * GET /api/v1/openapi — the public REST API specification (OpenAPI
 * 3.0). No auth: this is documentation. Every endpoint requires an
 * API key (Authorization: Bearer cf_… or X-ClipForge-Key) with the
 * scope shown, and is rate-limited per key (default 120/min).
 *
 * DELIBERATELY ABSENT write endpoints: clip creation, rendering,
 * and publishing are NOT exposed in v1. Those operations carry
 * rights-gate, quota, and cost side effects that the console UI
 * enforces interactively; exposing them as raw API writes would let
 * a leaked key bypass the consent gate. They arrive only when a
 * write path with the same gates exists (documented in
 * docs/PHASE5.md).
 */
export const OPENAPI_SPEC = {
  openapi: "3.0.0",
  info: {
    title: "ClipForge Public API",
    version: "1.0.0",
    description:
      "Read-only public API for ClipForge projects, clips, posts, and usage. Authenticate with an API key (cf_…) created in the admin console.",
  },
  servers: [{ url: "/api/v1" }],
  security: [{ ApiKeyAuth: [] }],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: "apiKey",
        in: "header",
        name: "X-ClipForge-Key",
        description:
          "API key, or Authorization: Bearer <key>. Keys are scoped read, write, or admin.",
      },
    },
  },
  paths: {
    "/projects": {
      get: {
        summary: "List the key owner's projects",
        security: [{ ApiKeyAuth: ["read"] }],
        responses: { "200": { description: "Project list." } },
      },
    },
    "/clips": {
      get: {
        summary: "List the key owner's clips (metadata only)",
        security: [{ ApiKeyAuth: ["read"] }],
        responses: { "200": { description: "Clip list." } },
      },
    },
    "/posts": {
      get: {
        summary: "List the key owner's posts",
        security: [{ ApiKeyAuth: ["read"] }],
        responses: { "200": { description: "Post list." } },
      },
    },
    "/usage": {
      get: {
        summary: "Usage summary for the key owner",
        security: [{ ApiKeyAuth: ["read"] }],
        responses: { "200": { description: "Usage summary." } },
      },
    },
  },
};

export async function GET() {
  return NextResponse.json(OPENAPI_SPEC);
}
