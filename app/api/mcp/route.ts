import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { apiKeyAuth } from "@/lib/integrations/apiAuth";
import { createEnvTokenCrypto } from "@/lib/publish/tokens";
import {
  createWebhookEndpoint,
  resolveIntegrationDb,
  toWebhookEndpointPublic,
} from "@/lib/integrations/store";
import {
  WEBHOOK_EVENTS,
} from "@/lib/integrations/webhooks";
import type { DomainEventName } from "@/lib/integrations/events";
import {
  listUserClips,
  listUserPosts,
  listUserProjects,
} from "@/lib/admin/store";

/** MCP write tools are OFF unless this flag is exactly "true". */
export function mcpWritesEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env.INTEGRATION_MCP_WRITES_ENABLED === "true";
}

const READ_TOOLS = [
  {
    name: "clip.search",
    description: "Search the key owner's clips by title keyword.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "project.list",
    description: "List the key owner's projects.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "post.status",
    description: "Get one post's status (only the key owner's posts).",
    inputSchema: {
      type: "object",
      properties: { postId: { type: "string" } },
      required: ["postId"],
    },
  },
];

const WRITE_TOOLS = [
  {
    name: "webhook.subscribe",
    description:
      "Create a webhook endpoint for the key owner (write scope + INTEGRATION_MCP_WRITES_ENABLED=true required). The signing secret is returned once.",
    inputSchema: {
      type: "object",
      properties: {
        url: { type: "string" },
        events: { type: "array", items: { type: "string" } },
      },
      required: ["url", "events"],
    },
  },
];

function jsonRpcError(id: unknown, code: number, message: string) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
}

function jsonRpcResult(id: unknown, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id: id ?? null, result });
}

/**
 * POST /api/mcp — Model Context Protocol endpoint (JSON-RPC 2.0).
 * Authenticated like the v1 API (API key, read scope for read tools).
 * Read tools are always available; write tools appear in tools/list
 * and execute ONLY when INTEGRATION_MCP_WRITES_ENABLED=true AND the
 * key carries the write scope — otherwise tools/call returns
 * -32000 "write tools are disabled". 503 without a database.
 */
export async function POST(req: Request) {
  const { key, errorResponse } = await apiKeyAuth(req, "read");
  if (errorResponse) return errorResponse;
  const db = resolveIntegrationDb();
  if (!db) {
    return NextResponse.json(
      { error: "The integrations database is not configured yet." },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => null)) as {
    jsonrpc?: string;
    id?: unknown;
    method?: string;
    params?: Record<string, unknown>;
  } | null;
  if (!body || body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonRpcError(body?.id, -32700, "Parse error: expected JSON-RPC 2.0.");
  }
  const { id, method, params } = body;

  if (method === "initialize") {
    return jsonRpcResult(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "clipforge-mcp", version: "1.0.0" },
    });
  }

  if (method === "tools/list") {
    const tools = mcpWritesEnabled() ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
    return jsonRpcResult(id, { tools });
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const args = (params?.arguments ?? {}) as Record<string, unknown>;
    try {
      if (toolName === "clip.search") {
        const query = String(args.query ?? "").toLowerCase();
        const clips = await listUserClips(db, key.user_id);
        const matches = clips.filter((c) =>
          c.title.toLowerCase().includes(query),
        );
        return jsonRpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(matches) }],
        });
      }
      if (toolName === "project.list") {
        const projects = await listUserProjects(db, key.user_id);
        return jsonRpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(projects) }],
        });
      }
      if (toolName === "post.status") {
        const posts = await listUserPosts(db, key.user_id);
        const post = posts.find((p) => p.id === args.postId);
        if (!post) {
          return jsonRpcError(id, -32001, "Post not found.");
        }
        return jsonRpcResult(id, {
          content: [{ type: "text", text: JSON.stringify(post) }],
        });
      }
      if (toolName === "webhook.subscribe") {
        if (!mcpWritesEnabled()) {
          return jsonRpcError(id, -32000, "Write tools are disabled.");
        }
        const scopes = (Array.isArray(key.scopes) ? key.scopes : []) as string[];
        if (!scopes.includes("write") && !scopes.includes("admin")) {
          return jsonRpcError(id, -32000, "Write scope required.");
        }
        const parsed = z
          .object({
            url: z.string().url(),
            events: z
              .array(z.string())
              .min(1)
              .refine((events) =>
                events.every((e) => (WEBHOOK_EVENTS as string[]).includes(e)),
              ),
          })
          .safeParse(args);
        if (!parsed.success) {
          return jsonRpcError(id, -32602, "Invalid params.");
        }
        const url = new URL(parsed.data.url);
        if (url.protocol !== "https:") {
          return jsonRpcError(id, -32602, "Webhook URL must use HTTPS.");
        }
        const crypto = createEnvTokenCrypto();
        if (!crypto) {
          return jsonRpcError(id, -32002, "Signing key is not configured.");
        }
        const signingSecret = randomBytes(32).toString("hex");
        const row = await createWebhookEndpoint(db, {
          user_id: key.user_id,
          url: parsed.data.url,
          events: parsed.data.events as DomainEventName[],
          secret_enc: crypto.encrypt(signingSecret),
          key_id: crypto.keyId,
          active: true,
        });
        return jsonRpcResult(id, {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                endpoint: toWebhookEndpointPublic(row),
                signingSecret,
              }),
            },
          ],
        });
      }
      return jsonRpcError(id, -32601, `Unknown tool: ${String(toolName)}`);
    } catch {
      return jsonRpcError(id, -32603, "Tool execution failed.");
    }
  }

  return jsonRpcError(id, -32601, `Unknown method: ${method}`);
}
