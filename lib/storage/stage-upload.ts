/**
 * Optional server staging for a picked video (ClipForge Phase 10).
 *
 * This is the FIRST UI caller of the Phase 7 chunked-upload client:
 * the browser PUTs each 8 MB chunk straight to R2 and the server only
 * orchestrates (initiate / complete). It exists so a finished clip can
 * later be published or shared from a server copy.
 *
 * PRIVACY RULE — why this is opt-in, never automatic: the homepage
 * promises the video never leaves the browser (only the audio track
 * goes out for transcription). Auto-staging on file pick would break
 * that promise. So the tool only stages when the user presses the
 * "Stage a server copy" button, after reading that it uploads the
 * full video to server storage.
 *
 * Fallback semantics (honest, tested with mocked fetch):
 * - R2 configured + chunks succeed → { staged: true, key, uploadId }.
 * - R2 NOT configured (initiate answers 503 with the shared
 *   STORAGE_NOT_CONFIGURED message) → { staged: false, reason:
 *   "not-configured" }. The caller reports this plainly and the
 *   browser flow stays the live path — nothing is pretended.
 * - Any other failure (network, part upload, completion) → throws.
 *   A failed staging is never reported as success, and never
 *   silently downgraded to a browser copy the user did not ask for.
 */

import { uploadFileChunked, type UploadProgress } from "./chunked-upload";
import { STORAGE_NOT_CONFIGURED } from "./not-configured";

export type StageResult =
  | { staged: true; key: string; uploadId: string }
  | { staged: false; reason: "not-configured" };

export async function stageServerCopy(
  file: File,
  opts: {
    fetchImpl?: typeof fetch;
    onProgress?: UploadProgress;
  } = {},
): Promise<StageResult> {
  try {
    const result = await uploadFileChunked(file, opts);
    return { staged: true, key: result.key, uploadId: result.uploadId };
  } catch (error) {
    if (error instanceof Error && error.message === STORAGE_NOT_CONFIGURED) {
      return { staged: false, reason: "not-configured" };
    }
    throw error;
  }
}
