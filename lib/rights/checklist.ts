/**
 * Per-post compliance checklist (ClipForge Phase 2).
 *
 * The checklist is ticked PER POST, never once globally: every post
 * gets its own record (post_ref + the four ticks + the pre-publish
 * verdict). Phase 3 consumes these records against real posts; until
 * then the record is keyed by a client-supplied post reference (a
 * draft id) and the API validates the shape honestly.
 */

import { z } from "zod";
import type { FetchImpl } from "@/lib/ai/providers";
import type { RightsDb } from "@/lib/rights/declarations";

export const CHECKLIST_ITEMS = [
  {
    key: "declaration",
    label: "Ownership declared for this project",
    help: "The per-project ownership declaration has been accepted.",
  },
  {
    key: "musicLicence",
    label: "Music licence chosen or royalty-free track used",
    help: "Original audio, a royalty-free track, or a licensed upload with proof — not unlicensed music.",
  },
  {
    key: "fingerprintReviewed",
    label: "Fingerprint result reviewed",
    help: "The scan result was read — including an explicit acknowledgement when no scan ran.",
  },
  {
    key: "platformRules",
    label: "Platform rules acknowledged",
    help: "You accept the target platform's music, length, and content rules for this post.",
  },
] as const;

export type ChecklistKey = (typeof CHECKLIST_ITEMS)[number]["key"];

export const checklistSchema = z.object({
  postRef: z.string().min(1).max(200),
  projectId: z.string().min(1).max(200),
  ticks: z.object({
    declaration: z.boolean(),
    musicLicence: z.boolean(),
    fingerprintReviewed: z.boolean(),
    platformRules: z.boolean(),
  }),
  policyOutcome: z
    .enum(["block", "warn", "allow-with-licence-proof", "not_scanned"])
    .optional(),
});

export type ChecklistRecord = z.infer<typeof checklistSchema> & {
  id: string;
  created_at: string;
};

export function checklistComplete(
  ticks: z.infer<typeof checklistSchema>["ticks"],
): boolean {
  return (
    ticks.declaration &&
    ticks.musicLicence &&
    ticks.fingerprintReviewed &&
    ticks.platformRules
  );
}

/**
 * Server-side checklist record (PostgREST, service-role). Mirrors the
 * share/declaration helpers: injectable fetch for tests, honest null
 * when the database is not configured (resolved by the route).
 */
export async function createChecklistRow(
  db: RightsDb,
  row: z.infer<typeof checklistSchema>,
  fetchImpl: FetchImpl = fetch,
): Promise<ChecklistRecord> {
  const res = await fetchImpl(`${db.url}/rest/v1/clipper_checklists`, {
    method: "POST",
    headers: {
      apikey: db.serviceKey,
      Authorization: `Bearer ${db.serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(row),
  });
  if (!res.ok) {
    throw new Error(`Checklist storage failed (HTTP ${res.status})`);
  }
  const data = (await res.json()) as ChecklistRecord[];
  const created = data[0];
  if (!created) throw new Error("Checklist storage returned no row");
  return created;
}
