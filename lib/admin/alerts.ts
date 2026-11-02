/**
 * Admin alerting (ClipForge Phase 4).
 *
 * Rules are threshold-driven and evaluated over audit rows (see
 * lib/admin/metrics.ts detectAnomalies). Dispatch posts a JSON payload
 * to a configured webhook URL (Slack, Discord, or a generic email
 * webhook). Webhooks are env-gated: without a URL the adapter reports
 * "not configured" and nothing is sent. Dispatch failures are
 * swallowed — alerting must never break admin flows.
 */

import type { FetchImpl } from "@/lib/ai/providers";
import type { Anomaly } from "./metrics";

export type AlertConfig = {
  volumeThresholdPerHour: number;
  ipUsersThreshold: number;
  slackWebhookUrl: string | null;
  discordWebhookUrl: string | null;
  emailWebhookUrl: string | null;
};

export function alertConfig(
  env: Record<string, string | undefined> = process.env,
): AlertConfig {
  const volume = Number.parseInt(env.ADMIN_ALERT_VOLUME_THRESHOLD ?? "", 10);
  const ipUsers = Number.parseInt(env.ADMIN_ALERT_IP_USERS_THRESHOLD ?? "", 10);
  return {
    volumeThresholdPerHour: Number.isFinite(volume) && volume > 0 ? volume : 100,
    ipUsersThreshold: Number.isFinite(ipUsers) && ipUsers > 0 ? ipUsers : 5,
    slackWebhookUrl: env.SLACK_ALERT_WEBHOOK_URL ?? null,
    discordWebhookUrl: env.DISCORD_ALERT_WEBHOOK_URL ?? null,
    emailWebhookUrl: env.EMAIL_ALERT_WEBHOOK_URL ?? null,
  };
}

export type AlertDispatch =
  | { sent: true; channel: string }
  | { sent: false; reason: string };

/** POST one alert payload to one webhook URL (timeout-guarded). */
export async function dispatchWebhook(
  url: string,
  payload: Record<string, unknown>,
  fetchImpl: FetchImpl = fetch,
): Promise<AlertDispatch> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) return { sent: false, reason: `Webhook HTTP ${res.status}` };
      return { sent: true, channel: url };
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return { sent: false, reason: "Webhook dispatch failed" };
  }
}

/** Send one anomaly to every configured channel. Never throws. */
export async function dispatchAnomaly(
  anomaly: Anomaly,
  config: AlertConfig,
  fetchImpl: FetchImpl = fetch,
): Promise<AlertDispatch[]> {
  const payload = {
    text: `[ClipForge alert] ${anomaly.rule} (${anomaly.severity}): ${anomaly.detail}`,
    rule: anomaly.rule,
    severity: anomaly.severity,
    detail: anomaly.detail,
  };
  const results: AlertDispatch[] = [];
  const channels = [
    config.slackWebhookUrl,
    config.discordWebhookUrl,
    config.emailWebhookUrl,
  ].filter((u): u is string => Boolean(u));
  if (channels.length === 0) {
    return [{ sent: false, reason: "No alert webhook URL configured" }];
  }
  for (const url of channels) {
    results.push(await dispatchWebhook(url, payload, fetchImpl));
  }
  return results;
}
