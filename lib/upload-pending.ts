/**
 * Hero → tool file handoff (ClipForge Phase 7).
 *
 * The marketing homepage hero has an upload box, but the clipper tool
 * lives on /create. A file chosen in the hero is carried in module
 * memory across the client-side navigation and consumed exactly once
 * by the tool on mount. A hard refresh loses it (by design — files
 * are never persisted); the tool then shows its normal empty state.
 * Nothing here touches disk, storage, or the network.
 */

let pending: File | null = null;

/** Stage a hero-chosen file for the tool to pick up. */
export function setPendingUpload(file: File): void {
  pending = file;
}

/** Take the staged file, clearing it so it is consumed exactly once. */
export function takePendingUpload(): File | null {
  const file = pending;
  pending = null;
  return file;
}

/** True when a hero-chosen file is waiting for the tool. */
export function hasPendingUpload(): boolean {
  return pending !== null;
}

let pendingCcUrl: string | null = null;

/** Stage a hero-pasted CC link for the tool to verify on arrival. */
export function setPendingCcUrl(url: string): void {
  pendingCcUrl = url;
}

/** Take the staged CC link, clearing it so it is consumed exactly once. */
export function takePendingCcUrl(): string | null {
  const url = pendingCcUrl;
  pendingCcUrl = null;
  return url;
}

let pendingYtUrl: string | null = null;

/**
 * Stage a hero-pasted own-YouTube link for the tool (Phase 16).
 * The YouTube flow used to drop this link — the user arrived at an
 * empty box and had to re-paste. Carried the same way as the CC
 * link so the journey starts where the hero left off.
 */
export function setPendingYtUrl(url: string): void {
  pendingYtUrl = url;
}

/** Take the staged YouTube link, clearing it so it is consumed exactly once. */
export function takePendingYtUrl(): string | null {
  const url = pendingYtUrl;
  pendingYtUrl = null;
  return url;
}
