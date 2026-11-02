/**
 * Metering + minute credits (ClipForge Phase 6).
 *
 * The balance is ALWAYS a sum, never a stored column: balance =
 * SUM(delta_minutes) over the user's ledger entries. Consumption
 * entries are negative, grants/purchases/adjustments positive.
 * This cannot drift the way a mutable balance column can.
 *
 * Phase 4 clip credits (delta_clips) are a different unit and are
 * never mixed into this balance.
 */

import { z } from "zod";
import {
  listLedgerByUser,
  recordLedgerEntry,
  resolveBillingDb,
  type BillingDb,
  type LedgerEntry,
  type LedgerKind,
} from "./store";
import type { FetchImpl } from "@/lib/ai/providers";

/** Whole minutes for a duration, minimum 1 (a clip always costs). */
export function consumptionMinutes(durationSec: number): number {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return 1;
  return Math.max(1, Math.ceil(durationSec / 60));
}

/** Balance = sum of all ledger deltas (may go negative; see below). */
export function minuteBalance(entries: LedgerEntry[]): number {
  return entries.reduce((sum, e) => sum + e.delta_minutes, 0);
}

/**
 * Minutes consumed in a calendar month (UTC), as a positive number.
 * Only consumption entries count; grants and purchases do not
 * reduce the monthly usage figure (they raise the balance instead).
 */
export function monthlyConsumption(
  entries: LedgerEntry[],
  year: number,
  month: number,
): number {
  let total = 0;
  for (const e of entries) {
    if (e.kind !== "consumption") continue;
    const d = new Date(e.created_at);
    if (d.getUTCFullYear() === year && d.getUTCMonth() === month) {
      total += -e.delta_minutes;
    }
  }
  return total;
}

/** Low-balance threshold in minutes (config; default 10). */
export function lowBalanceThreshold(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = Number.parseInt(env.BILLING_LOW_BALANCE_MINUTES ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : 10;
}

export function isLowBalance(
  balance: number,
  env: Record<string, string | undefined> = process.env,
): boolean {
  return balance < lowBalanceThreshold(env);
}

export const ledgerEntryInputSchema = z.object({
  userId: z.string().min(1).max(200),
  minutes: z.number().int().positive().max(100000),
  kind: z.enum(["grant", "purchase", "consumption", "adjustment", "expiry"]),
  reason: z.string().min(1).max(500),
  reference: z.string().max(200).nullable().optional(),
});

export async function recordLedger(
  db: BillingDb,
  input: {
    userId: string;
    minutes: number;
    kind: LedgerKind;
    reason: string;
    reference?: string | null;
  },
  fetchImpl: FetchImpl = fetch,
): Promise<LedgerEntry> {
  const delta =
    input.kind === "consumption" || input.kind === "expiry"
      ? -Math.abs(input.minutes)
      : Math.abs(input.minutes);
  return recordLedgerEntry(
    db,
    {
      user_id: input.userId,
      delta_minutes: delta,
      kind: input.kind,
      reason: input.reason,
      reference: input.reference ?? null,
    },
    fetchImpl,
  );
}

/**
 * Fire-and-forget metering for user flows (publish/render/AI job
 * completions). Never throws and never changes the caller's response;
 * when the database is not configured it silently does nothing.
 */
export async function recordConsumptionSafe(input: {
  userId: string;
  minutes: number;
  reason: string;
  reference?: string | null;
}): Promise<void> {
  try {
    const db = resolveBillingDb();
    if (!db) return;
    await recordLedger(
      db,
      { ...input, kind: "consumption" },
      fetch,
    );
  } catch {
    // Metering must never break a user flow.
  }
}

export async function userMinuteBalance(
  db: BillingDb,
  userId: string,
  fetchImpl: FetchImpl = fetch,
): Promise<number> {
  const entries = await listLedgerByUser(db, userId, fetchImpl);
  return minuteBalance(entries);
}
