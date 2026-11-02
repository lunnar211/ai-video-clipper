import { NextResponse } from "next/server";
import { z } from "zod";
import { generateMetadata } from "@/lib/ai/metadata";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const segmentSchema = z.object({
  start: z.number().finite().min(0),
  end: z.number().finite().positive(),
  text: z.string().min(1).max(1000),
});

const bodySchema = z.object({
  transcript: z.array(segmentSchema).max(2000),
  clip: z.object({
    start: z.number().finite().min(0),
    end: z.number().finite().positive(),
    title: z.string().min(1).max(200),
  }),
});

/**
 * Viral metadata for one clip. Rate-limited like the other AI routes.
 * Never 503s: when no AI key is configured (or every provider fails),
 * the response is the honestly-labelled template fallback
 * (source: "template") — never fake AI scores.
 */
export async function POST(req: Request): Promise<Response> {
  if (!checkRateLimit(getClientIp(req))) {
    return NextResponse.json(
      { error: "Too many requests — try again in a minute." },
      { status: 429 },
    );
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body." }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid transcript or clip." },
      { status: 400 },
    );
  }
  const { metadata, source, provider } = await generateMetadata(
    parsed.data.transcript,
    parsed.data.clip,
  );
  return NextResponse.json({ metadata, source, provider });
}
