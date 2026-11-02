import { NextResponse } from "next/server";
import {
  getFingerprintProvider,
  NOT_SCANNED,
} from "@/lib/rights/fingerprint";
import { evaluatePolicy } from "@/lib/rights/policy";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Fingerprint scan for one audio sample (ClipForge Phase 2).
 *
 * Unlike the older /api/clips/music route (which 503s without a key),
 * this route always answers with a verdict object — because the
 * pre-publish flow must distinguish "not scanned" from "clean".
 * Without a provider the verdict is not_scanned, never clean. A
 * provider error is a 502, never a silent pass.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected a multipart audio upload." },
      { status: 400 },
    );
  }
  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0 || audio.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Expected a non-empty audio sample under 10 MB." },
      { status: 400 },
    );
  }
  const licenceProofRaw = form.get("licenceProof");
  const licenceProof =
    typeof licenceProofRaw === "string" && licenceProofRaw.trim().length > 0
      ? licenceProofRaw.trim().slice(0, 1000)
      : null;
  const provider = getFingerprintProvider();
  if (!provider) {
    const policy = evaluatePolicy({
      scanned: false,
      detected: false,
      licenceProof,
    });
    return NextResponse.json({ ...NOT_SCANNED, policy });
  }
  try {
    const result = await provider.scan(audio, "sample.wav");
    const policy = evaluatePolicy({
      scanned: result.scanned,
      detected: result.detected,
      licenceProof,
    });
    return NextResponse.json({ ...result, policy });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Scan failed";
    return NextResponse.json(
      { error: `Fingerprint scan failed: ${message}` },
      { status: 502 },
    );
  }
}
