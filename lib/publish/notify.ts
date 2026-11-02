/**
 * Failure notifications (ClipForge Phase 3).
 *
 * In-app notifications are the real channel: publish failures create
 * a row the UI lists. Email is an interface with an inert adapter —
 * the owner's Brevo key is known-bad, so NO mail provider is wired as
 * working. When a mail provider is configured later, its adapter plugs
 * in here without changing callers.
 *
 * Notification bodies carry post ids and error summaries only — never
 * tokens, never video bytes, never transcripts.
 */

import type { PublishDb } from "./store";
import { createNotificationRow } from "./store";
import type { FetchImpl } from "@/lib/ai/providers";

export type EmailAdapter = {
  send(input: {
    to: string;
    subject: string;
    body: string;
  }): Promise<{ sent: boolean; reason: string }>;
};

/** Inert email adapter: honestly reports that email is not configured. */
export const inertEmailAdapter: EmailAdapter = {
  async send(): Promise<{ sent: boolean; reason: string }> {
    return { sent: false, reason: "Email provider is not configured." };
  },
};

/**
 * Record a publish failure: in-app notification when a database is
 * configured (never throws), plus the email adapter (inert until a
 * provider is configured). Returns whether the in-app row was stored.
 */
export async function notifyPublishFailure(
  db: PublishDb | null,
  input: {
    userId: string | null;
    postId: string;
    platform: string;
    error: string;
  },
  email: EmailAdapter = inertEmailAdapter,
  fetchImpl: FetchImpl = fetch,
): Promise<{ inApp: boolean; emailSent: boolean }> {
  let inApp = false;
  if (db) {
    const row = await createNotificationRow(
      db,
      {
        user_id: input.userId,
        type: "publish_failed",
        title: `Publish failed: ${input.platform}`,
        body:
          `Post ${input.postId} failed to publish to ${input.platform}. ` +
          `Reason: ${input.error}`,
      },
      fetchImpl,
    );
    inApp = row !== null;
  }
  // No recipient address is configured for email yet; the adapter is
  // inert by design, so no email is attempted until a provider lands.
  void email;
  return { inApp, emailSent: false };
}
