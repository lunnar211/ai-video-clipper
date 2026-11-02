import { NextResponse } from "next/server";
import {
  resolveDiarization,
  DIARIZATION_NOT_CONFIGURED,
} from "@/lib/ai/diarization";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Speaker diarization. No provider exists yet, so this route honestly
 * 503s until the owner picks a provider and sets DIARIZATION_PROVIDER
 * + DIARIZATION_API_KEY. It never approximates speakers from the
 * transcript — that would be a fake result.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  void req;
  const provider = resolveDiarization();
  if (!provider) {
    return NextResponse.json(
      { error: DIARIZATION_NOT_CONFIGURED },
      { status: 503 },
    );
  }
  return NextResponse.json(
    { error: "Diarization provider registered but no adapter is implemented yet." },
    { status: 501 },
  );
}
