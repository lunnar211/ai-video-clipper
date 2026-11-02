import { NextResponse } from "next/server";
import { z } from "zod";
import {
  canTransitionStrike,
  setPublishingPaused,
  shouldAutoPause,
  type StrikeStatus,
} from "@/lib/rights/strikes";
import { resolveRightsDb } from "@/lib/rights/declarations";
import { getAdminIdentity, isAdmin } from "@/lib/rights/admin";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Admin strike review (ClipForge Phase 2).
 *
 * Role-gated (owner/admin). Validates the status transition, applies
 * it, then recomputes the accused account's publishing-pause flag
 * from its upheld-strike count: paused exactly when upheld strikes
 * reach the repeat-infringer threshold. The flag is therefore
 * derived, never hand-set — overturning a strike can lift a pause,
 * and upholding one can impose it.
 */
const reviewSchema = z.object({
  to: z.enum(["under_review", "upheld", "overturned"]),
  adminNote: z.string().max(2000).nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const identity = await getAdminIdentity();
  if (!isAdmin(identity)) {
    return NextResponse.json(
      { error: "Admin access required. Sign in with an admin account." },
      { status: 401 },
    );
  }
  const db = resolveRightsDb();
  if (!db) {
    return NextResponse.json(
      { error: "Review queue is not connected yet (no database on the server)." },
      { status: 503 },
    );
  }
  const { id } = await params;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = reviewSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid review action.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const headers = {
    apikey: db.serviceKey,
    Authorization: `Bearer ${db.serviceKey}`,
  };
  try {
    const currentRes = await fetch(
      `${db.url}/rest/v1/clipper_strikes?id=eq.${encodeURIComponent(id)}&select=*`,
      { headers },
    );
    if (!currentRes.ok) {
      return NextResponse.json(
        { error: "Strike lookup failed." },
        { status: 502 },
      );
    }
    const rows = (await currentRes.json()) as {
      status: StrikeStatus;
      accused_user_id: string | null;
    }[];
    const current = rows[0];
    if (!current) {
      return NextResponse.json({ error: "Strike not found." }, { status: 404 });
    }
    if (!canTransitionStrike(current.status, parsed.data.to)) {
      return NextResponse.json(
        {
          error: `Cannot move a strike from ${current.status} to ${parsed.data.to}.`,
        },
        { status: 400 },
      );
    }
    const patchRes = await fetch(
      `${db.url}/rest/v1/clipper_strikes?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          status: parsed.data.to,
          admin_note: parsed.data.adminNote,
        }),
      },
    );
    if (!patchRes.ok) {
      return NextResponse.json(
        { error: "Strike update failed." },
        { status: 502 },
      );
    }
    let paused: boolean | null = null;
    if (current.accused_user_id) {
      const countRes = await fetch(
        `${db.url}/rest/v1/clipper_strikes?accused_user_id=eq.${encodeURIComponent(current.accused_user_id)}&status=eq.upheld&select=id`,
        { headers },
      );
      if (countRes.ok) {
        const upheld = (await countRes.json()) as unknown[];
        paused = shouldAutoPause(upheld.length);
        await setPublishingPaused(db, current.accused_user_id, paused);
      }
    }
    return NextResponse.json({
      updated: true,
      to: parsed.data.to,
      publishingPaused: paused,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Review failed";
    return NextResponse.json(
      { error: `Strike review failed: ${message}` },
      { status: 502 },
    );
  }
}
