/**
 * Integration registry (ClipForge Phase 5).
 *
 * A first-class Integration definition: typed config schema, required
 * environment variables, and a status derivation that never claims a
 * live connection without credentials. Registry entries are static
 * definitions; per-user instances (enabled/disabled + encrypted
 * config) live in clipper_integrations (migration 005) and are managed
 * by the admin integrations API.
 *
 * BUILT-INS (honest by construction):
 * - slack-notify: posts Phase 4-style alert messages to a Slack
 *   incoming webhook URL. Requires SLACK_ALERT_WEBHOOK_URL (the same
 *   Phase 4 alert webhook). Until that URL is set, status is
 *   "not_configured" — never "connected".
 * - drive-export: an export-destination interface (upload a finished
 *   clip file to the user's own Drive). NO adapter exists yet — no
 *   credentials are accepted for it and its status is always
 *   "interface_only" until an adapter lands. This is deliberate: the
 *   owner has not yet provided a backends list, so no named Drive
 *   integration is claimed.
 * - generic-webhook: the webhooks subsystem itself (any HTTPS
 *   endpoint, HMAC-signed). Always available; per-endpoint status
 *   lives on the endpoint rows, not here.
 *
 * No other named third-party integration is registered. Adding one
 * means: a registry entry + an adapter + env vars + docs — never a
 * name in a list with no adapter behind it.
 */

export type IntegrationConfigField = {
  key: string;
  label: string;
  /** "text" = shown in UI; "secret" = encrypted at rest, never returned. */
  type: "text" | "secret";
  required: boolean;
  help: string;
};

export type IntegrationDefinition = {
  id: string;
  name: string;
  description: string;
  category: "notify" | "export" | "webhook";
  docsUrl: string;
  /** Env vars that must all be set for status "configured". */
  requiresEnv: string[];
  /** True when no adapter exists yet (status is always interface_only). */
  interfaceOnly: boolean;
  configFields: IntegrationConfigField[];
};

export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  {
    id: "slack-notify",
    name: "Slack notifications",
    description:
      "Post ClipForge alerts (publish failures, strikes, anomalies) to a Slack channel via an incoming webhook URL.",
    category: "notify",
    docsUrl: "/docs/integrations#slack-notify",
    requiresEnv: ["SLACK_ALERT_WEBHOOK_URL"],
    interfaceOnly: false,
    configFields: [
      {
        key: "channel",
        label: "Channel override (optional)",
        type: "text",
        required: false,
        help: "Leave blank to use the webhook's default channel.",
      },
    ],
  },
  {
    id: "drive-export",
    name: "Drive export (interface only)",
    description:
      "Export finished clips to the user's own Drive account. The interface is defined, but no adapter exists yet — this integration cannot be enabled until an adapter and credentials land.",
    category: "export",
    docsUrl: "/docs/integrations#drive-export",
    requiresEnv: ["DRIVE_EXPORT_CLIENT_ID", "DRIVE_EXPORT_CLIENT_SECRET"],
    interfaceOnly: true,
    configFields: [],
  },
  {
    id: "generic-webhook",
    name: "Generic webhooks",
    description:
      "Send HMAC-signed event payloads to any HTTPS endpoint you control. Managed per-endpoint on the webhooks page.",
    category: "webhook",
    docsUrl: "/docs/integrations#generic-webhook",
    requiresEnv: [],
    interfaceOnly: false,
    configFields: [],
  },
];

export type IntegrationStatus =
  | "configured"
  | "not_configured"
  | "interface_only"
  | "disabled";

export type IntegrationInstance = {
  integrationId: string;
  enabled: boolean;
};

/**
 * Derive the display status for one registry entry. Interface-only
 * entries are never "configured". Disabled instances report
 * "disabled" even when configured, so the console never implies an
 * integration is live when the owner turned it off.
 */
export function integrationStatus(
  definition: IntegrationDefinition,
  instance: IntegrationInstance | null,
  env: Record<string, string | undefined> = process.env,
): IntegrationStatus {
  if (definition.interfaceOnly) return "interface_only";
  if (instance && !instance.enabled) return "disabled";
  const configured = definition.requiresEnv.every((key) => {
    const value = env[key];
    return value !== undefined && value.trim() !== "";
  });
  return configured ? "configured" : "not_configured";
}

export function findIntegrationDefinition(
  id: string,
): IntegrationDefinition | null {
  return INTEGRATION_REGISTRY.find((d) => d.id === id) ?? null;
}
