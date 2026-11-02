/**
 * Admin SSO configuration (ClipForge Phase 5).
 *
 * Config schema + validation for per-tenant SAML/OIDC. This slice
 * stores and validates configuration only: actual IdP verification
 * (metadata exchange, test login) is an owner tap, and until an IdP
 * is configured the feature honestly reports "setup_needed" — there
 * is deliberately NO fake SSO login path. Secrets (client secrets,
 * SAML certificates) are stored ENCRYPTED via the Phase 3 envelope
 * and are never returned to clients.
 */

import { z } from "zod";

export const ssoProviderSchema = z.enum(["oidc", "saml"]);

export type SsoProvider = z.infer<typeof ssoProviderSchema>;

const oidcConfigSchema = z.object({
  issuer: z.string().url("Issuer must be a URL."),
  clientId: z.string().min(1, "Client ID is required."),
  clientSecret: z.string().min(1, "Client secret is required."),
  scopes: z.array(z.string()).default(["openid", "email", "profile"]),
});

const samlConfigSchema = z.object({
  entityId: z.string().min(1, "Entity ID is required."),
  ssoUrl: z.string().url("SSO URL must be a URL."),
  certificate: z.string().min(1, "IdP certificate is required."),
});

export const ssoConfigSchema = z.discriminatedUnion("provider", [
  z.object({ provider: z.literal("oidc"), config: oidcConfigSchema }),
  z.object({ provider: z.literal("saml"), config: samlConfigSchema }),
]);

export type SsoConfigInput = z.infer<typeof ssoConfigSchema>;

/** Public SSO status: never includes secrets or certificates. */
export type SsoStatus = {
  configured: boolean;
  provider: SsoProvider | null;
  enabled: boolean;
  /** Human setup state: "setup_needed" until a full config is saved. */
  state: "setup_needed" | "configured";
  setupSteps: string[];
};

const OIDC_SETUP_STEPS = [
  "Create an OIDC application in your identity provider.",
  "Set the redirect URI to <site>/api/auth/sso/callback (documented in docs/PHASE5.md).",
  "Save the issuer, client ID, and client secret here, then run a test login.",
];

const SAML_SETUP_STEPS = [
  "Create a SAML application in your identity provider.",
  "Set the ACS URL to <site>/api/auth/sso/callback (documented in docs/PHASE5.md).",
  "Save the entity ID, SSO URL, and IdP certificate here, then run a test login.",
];

/** Derive the display status from a stored row (or null when none exists). */
export function ssoStatusFromRow(
  row: { provider: string; enabled: boolean } | null,
): SsoStatus {
  if (!row) {
    return {
      configured: false,
      provider: null,
      enabled: false,
      state: "setup_needed",
      setupSteps: [...OIDC_SETUP_STEPS, ...SAML_SETUP_STEPS],
    };
  }
  const provider = ssoProviderSchema.safeParse(row.provider).success
    ? (row.provider as SsoProvider)
    : null;
  return {
    configured: true,
    provider,
    enabled: row.enabled,
    state: "configured",
    setupSteps:
      provider === "saml" ? [...SAML_SETUP_STEPS] : [...OIDC_SETUP_STEPS],
  };
}
