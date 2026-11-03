/**
 * S3-compatible storage (Cloudflare R2) via SigV4.
 *
 * Large files NEVER pass through Vercel functions: the browser uploads
 * chunks straight to R2 with presigned URLs (multipart upload), and the
 * server only orchestrates (initiate / complete). All signing uses
 * WebCrypto (available in the Node runtime); every network call takes
 * an injectable fetch so tests never touch real R2.
 */

import { type FetchImpl } from "@/lib/ai/providers";

export { STORAGE_NOT_CONFIGURED } from "./not-configured";

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Public hostname for presigned GETs, e.g. https://pub-xxx.r2.dev */
  publicHost?: string;
};

/** Resolve R2 config from env, or null when storage is not configured. */
export function resolveR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }
  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    publicHost: process.env.R2_PUBLIC_HOST || undefined,
  };
}

export function r2Endpoint(cfg: R2Config): string {
  return `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}`;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(
  key: ArrayBuffer | string,
  data: string,
): Promise<ArrayBuffer> {
  const keyBuf =
    typeof key === "string"
      ? new TextEncoder().encode(key).buffer as ArrayBuffer
      : key;
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyBuf,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
}

async function sha256Hex(data: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  );
  return toHex(digest);
}

function amzDates(now: Date): { amzDate: string; dateStamp: string } {
  const iso = now.toISOString().replace(/[:-]/g, "").replace(/\.\d+/, "");
  return { amzDate: `${iso}Z`, dateStamp: iso.slice(0, 8) };
}

/**
 * Presigned URL for one S3 operation (PUT part, GET object, or DELETE
 * object). `expiresSec` is capped at 7 days by SigV4. Testable: the
 * URL always carries X-Amz-Algorithm, X-Amz-Credential, X-Amz-Signature.
 */
export async function presignR2(
  cfg: R2Config,
  method: "PUT" | "GET" | "DELETE",
  key: string,
  opts: { expiresSec?: number; now?: Date; uploadId?: string; partNumber?: number } = {},
): Promise<string> {
  const { amzDate, dateStamp } = amzDates(opts.now ?? new Date());
  const region = "auto";
  const service = "s3";
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const expires = Math.min(opts.expiresSec ?? 3600, 7 * 24 * 3600);
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${cfg.accessKeyId}/${dateStamp}/${region}/${service}/aws4_request`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(expires),
    "X-Amz-SignedHeaders": "host",
  };
  if (opts.uploadId) query["uploadId"] = opts.uploadId;
  if (opts.partNumber) query["partNumber"] = String(opts.partNumber);
  const sorted = Object.keys(query).sort();
  const canonicalQuery = sorted
    .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(query[k])}`)
    .join("&");
  const encodedKey = key.split("/").map(encodeURIComponent).join("/");
  const canonicalRequest = [
    method,
    `/${cfg.bucket}/${encodedKey}`,
    canonicalQuery,
    `host:${host}\n`,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const kDate = await hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
  const kRegion = await hmac(kDate, region);
  const kService = await hmac(kRegion, service);
  const kSigning = await hmac(kService, "aws4_request");
  const signature = toHex(await hmac(kSigning, stringToSign));
  return `https://${host}/${cfg.bucket}/${encodedKey}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export type MultipartInit = {
  uploadId: string;
  key: string;
  partUrls: string[];
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Parse the UploadId out of a CreateMultipartUpload XML response. */
export function parseUploadId(xml: string): string | null {
  const m = xml.match(/<UploadId>([^<]+)<\/UploadId>/);
  return m ? m[1] : null;
}

/** Build the CompleteMultipartUpload XML body from part ETags. */
export function buildCompleteXml(
  parts: Array<{ partNumber: number; etag: string }>,
): string {
  const inner = [...parts]
    .sort((a, b) => a.partNumber - b.partNumber)
    .map((p) => {
      const etag = p.etag.startsWith('"') ? p.etag : `"${p.etag}"`;
      return `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(etag)}</ETag></Part>`;
    })
    .join("");
  return `<CompleteMultipartUpload>${inner}</CompleteMultipartUpload>`;
}

function signedHeaders(
  cfg: R2Config,
  method: string,
  key: string,
  query: string,
  body: string,
  now: Date,
): Promise<{ url: string; headers: Record<string, string> }> {
  return (async () => {
    const { amzDate, dateStamp } = amzDates(now);
    const region = "auto";
    const service = "s3";
    const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
    const encodedKey = key.split("/").map(encodeURIComponent).join("/");
    const payloadHash = await sha256Hex(body);
    const canonicalRequest = [
      method,
      `/${cfg.bucket}/${encodedKey}`,
      query,
      `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`,
      "host;x-amz-content-sha256;x-amz-date",
      payloadHash,
    ].join("\n");
    const scope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amzDate,
      scope,
      await sha256Hex(canonicalRequest),
    ].join("\n");
    const kDate = await hmac(`AWS4${cfg.secretAccessKey}`, dateStamp);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    const kSigning = await hmac(kService, "aws4_request");
    const signature = toHex(await hmac(kSigning, stringToSign));
    const auth =
      `AWS4-HMAC-SHA256 Credential=${cfg.accessKeyId}/${scope}, ` +
      `SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=${signature}`;
    const qs = query ? `?${query}` : "";
    return {
      url: `https://${host}/${cfg.bucket}/${encodedKey}${qs}`,
      headers: {
        Authorization: auth,
        "x-amz-date": amzDate,
        "x-amz-content-sha256": payloadHash,
      },
    };
  })();
}

/**
 * Start a multipart upload. Returns the upload id + one presigned PUT
 * URL per part. Throws on R2 errors. Never called without config —
 * callers check resolveR2Config() first.
 */
export async function initiateMultipartUpload(
  cfg: R2Config,
  key: string,
  partCount: number,
  fetchImpl: FetchImpl = fetch,
): Promise<MultipartInit> {
  const { url, headers } = await signedHeaders(
    cfg,
    "POST",
    key,
    "uploads",
    "",
    new Date(),
  );
  const res = await fetchImpl(url, { method: "POST", headers });
  if (!res.ok) throw new Error(`R2 initiate failed (HTTP ${res.status})`);
  const uploadId = parseUploadId(await res.text());
  if (!uploadId) throw new Error("R2 did not return an upload id");
  const partUrls: string[] = [];
  for (let i = 1; i <= partCount; i++) {
    partUrls.push(
      await presignR2(cfg, "PUT", key, { uploadId, partNumber: i }),
    );
  }
  return { uploadId, key, partUrls };
}

/** Complete a multipart upload from the client's reported part ETags. */
export async function completeMultipartUpload(
  cfg: R2Config,
  key: string,
  uploadId: string,
  parts: Array<{ partNumber: number; etag: string }>,
  fetchImpl: FetchImpl = fetch,
): Promise<{ key: string }> {
  const body = buildCompleteXml(parts);
  const { url, headers } = await signedHeaders(
    cfg,
    "POST",
    key,
    `uploadId=${encodeURIComponent(uploadId)}`,
    body,
    new Date(),
  );
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/xml" },
    body,
  });
  if (!res.ok) throw new Error(`R2 complete failed (HTTP ${res.status})`);
  return { key };
}

/** Storage provider interface — R2 today, swappable tomorrow. */
export type StorageProvider = {
  name: string;
  initiate: (
    key: string,
    partCount: number,
    fetchImpl?: FetchImpl,
  ) => Promise<MultipartInit>;
  complete: (
    key: string,
    uploadId: string,
    parts: Array<{ partNumber: number; etag: string }>,
    fetchImpl?: FetchImpl,
  ) => Promise<{ key: string }>;
  presignedGet: (key: string) => Promise<string>;
  /** Best-effort delete (presigned DELETE). Added for Phase 3 temp media. */
  delete?: (key: string, fetchImpl?: FetchImpl) => Promise<void>;
};

/** Resolve the configured storage provider, or null when unset. */
export function resolveStorage(): StorageProvider | null {
  const cfg = resolveR2Config();
  if (!cfg) return null;
  return {
    name: "r2",
    initiate: (key, partCount, fetchImpl) =>
      initiateMultipartUpload(cfg, key, partCount, fetchImpl),
    complete: (key, uploadId, parts, fetchImpl) =>
      completeMultipartUpload(cfg, key, uploadId, parts, fetchImpl),
    presignedGet: (key) => presignR2(cfg, "GET", key),
    delete: async (key, fetchImpl = fetch) => {
      const url = await presignR2(cfg, "DELETE", key);
      const res = await fetchImpl(url, { method: "DELETE" });
      if (!res.ok) {
        throw new Error(`R2 delete failed (HTTP ${res.status})`);
      }
    },
  };
}
