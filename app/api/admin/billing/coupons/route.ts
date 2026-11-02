import { NextResponse } from "next/server";
import { adminGate } from "@/lib/admin/guard";
import { ACTION_ROLES, CONSOLE_ROLES } from "@/lib/admin/roles";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";
import {
  createCoupon,
  listCoupons,
  resolveBillingDb,
} from "@/lib/billing/store";
import { couponCreateSchema } from "@/lib/billing/coupons";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /api/admin/billing/coupons — console list.
 * POST /api/admin/billing/coupons — create a coupon (owner/admin,
 * audited). Codes are uppercased on creation; percent values over
 * 100 are refused (a coupon must never discount more than 100%).
 */
export async function GET(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const { errorResponse } = await adminGate(req, CONSOLE_ROLES);
  if (errorResponse) return errorResponse;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  try {
    const coupons = await listCoupons(db);
    return NextResponse.json({ coupons });
  } catch {
    return NextResponse.json(
      { error: "Coupon list failed." },
      { status: 500 },
    );
  }
}

export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  const gate = await adminGate(req, ACTION_ROLES);
  if (gate.errorResponse) return gate.errorResponse;
  const db = resolveBillingDb();
  if (!db) {
    return NextResponse.json(
      { error: "Billing needs database setup." },
      { status: 503 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = couponCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid coupon.", details: parsed.error.issues },
      { status: 400 },
    );
  }
  if (parsed.data.kind === "percent" && parsed.data.value > 100) {
    return NextResponse.json(
      { error: "Percent coupons cannot exceed 100." },
      { status: 400 },
    );
  }
  const created = await createCoupon(db, {
    code: parsed.data.code,
    kind: parsed.data.kind,
    value: parsed.data.value,
    max_uses: parsed.data.maxUses ?? null,
    per_user_once: parsed.data.perUserOnce ?? true,
    plan: parsed.data.plan ?? null,
    expires_at: parsed.data.expiresAt ?? null,
    created_by: gate.session?.userId ?? null,
  }).catch(() => null);
  if (!created) {
    return NextResponse.json(
      { error: "Coupon could not be created (is the code already used?)." },
      { status: 500 },
    );
  }
  scheduleAudit({
    actor: gate.session?.userId ?? "admin",
    action: "billing.coupon_created",
    target: created.id,
    metadata: { code: created.code, kind: created.kind },
    ip: getClientIp(req),
    user_agent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ coupon: created }, { status: 201 });
}
