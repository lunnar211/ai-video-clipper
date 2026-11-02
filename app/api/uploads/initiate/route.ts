import { NextResponse } from "next/server";
import { z } from "zod";
import {
  resolveStorage,
  STORAGE_NOT_CONFIGURED,
} from "@/lib/storage/r2";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { scheduleAudit } from "@/lib/admin/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

const CHUNK_BYTES = 8 * 1024 * 1024;
const BROWSER_LIMIT = 500 * 1024 * 1024;
const PAID_LIMIT = 5 * 1024 * 1024 * 1024;

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(100),
  sizeBytes: z.number().int().positive(),
});

function safeName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "video";
}

/**
 * Start a resumable multipart upload. The browser uploads each 8 MB
 * chunk straight to R2 with the returned presigned URLs — large files
 * never pass through this function. Without R2 config, 503 + setup
 * instructions. 5 GB is allowed only when the owner opts in with
 * R2_LARGE_UPLOADS_ENABLED=true (the paid-tier gate placeholder until
 * billing tier resolution lands); otherwise the 500 MB browser limit
 * applies here too.
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
    return NextResponse.json({ error: "Invalid upload request." }, { status: 400 });
  }
  const { filename, mime, sizeBytes } = parsed.data;
  if (!mime.startsWith("video/")) {
    return NextResponse.json(
      { error: "Only video files can be uploaded." },
      { status: 400 },
    );
  }
  const largeAllowed = process.env.R2_LARGE_UPLOADS_ENABLED === "true";
  const limit = largeAllowed ? PAID_LIMIT : BROWSER_LIMIT;
  if (sizeBytes > limit) {
    return NextResponse.json(
      {
        error: largeAllowed
          ? "That file is over 5 GB, the paid-tier cap."
          : "That file is over 500 MB. Larger uploads need the paid tier (set R2_LARGE_UPLOADS_ENABLED=true once billing tier resolution lands).",
      },
      { status: 413 },
    );
  }
  const storage = resolveStorage();
  if (!storage) {
    return NextResponse.json({ error: STORAGE_NOT_CONFIGURED }, { status: 503 });
  }
  const partCount = Math.min(
    10000,
    Math.max(1, Math.ceil(sizeBytes / CHUNK_BYTES)),
  );
  const key = `uploads/${crypto.randomUUID()}/${safeName(filename)}`;
  try {
    const init = await storage.initiate(key, partCount);
    // Audit only: uploads are guest-capable, so the actor is "guest".
    // The filename is never logged (it may contain personal info).
    scheduleAudit({
      actor: "guest",
      action: "upload.created",
      target: init.key,
      metadata: { sizeBytes, mime },
      ip: getClientIp(req),
      user_agent: req.headers.get("user-agent"),
    });
    return NextResponse.json({
      uploadId: init.uploadId,
      key: init.key,
      chunkBytes: CHUNK_BYTES,
      partUrls: init.partUrls,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json(
      { error: `Upload start failed: ${message}` },
      { status: 502 },
    );
  }
}
