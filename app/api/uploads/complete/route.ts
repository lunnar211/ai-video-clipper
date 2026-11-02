import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveStorage,
  STORAGE_NOT_CONFIGURED,
} from "@/lib/storage/r2";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({
  key: z.string().min(1).max(1024),
  uploadId: z.string().min(1).max(255),
  parts: z
    .array(
      z.object({
        partNumber: z.number().int().positive().max(10000),
        etag: z.string().min(1).max(128),
      }),
    )
    .min(1)
    .max(10000),
});

/** Complete a multipart upload from the client's part ETags. */
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
    return NextResponse.json({ error: "Invalid completion request." }, { status: 400 });
  }
  if (!parsed.data.key.startsWith("uploads/")) {
    return NextResponse.json(
      { error: "That key is not an upload key." },
      { status: 400 },
    );
  }
  const storage = resolveStorage();
  if (!storage) {
    return NextResponse.json({ error: STORAGE_NOT_CONFIGURED }, { status: 503 });
  }
  try {
    const done = await storage.complete(
      parsed.data.key,
      parsed.data.uploadId,
      parsed.data.parts,
    );
    return NextResponse.json({
      key: done.key,
      status: "uploaded",
      note: "Server-side content verification runs in the ffmpeg worker; until then, the browser upload flow remains the verified path for direct uploads.",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Completion failed";
    return NextResponse.json(
      { error: `Upload completion failed: ${message}` },
      { status: 502 },
    );
  }
}
