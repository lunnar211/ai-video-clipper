/**
 * Client-safe types for the CC-verified paste import (ClipForge
 * Phase 11). This module imports nothing, so both the server
 * verification library and the browser paste component can use it
 * without pulling Node-only code (DNS, fetch guards) into the
 * browser bundle.
 */

export type CcLicense = "CC-BY" | "CC-BY-SA" | "CC0" | "public-domain";

/** One playable video file the source offers for this work. */
export type CcVerifiedFile = {
  name: string;
  url: string;
  size?: number;
};

/** The verified licence facts the UI shows and the ZIP export keeps. */
export type CcImportMeta = {
  license: CcLicense;
  author: string;
  title: string;
  sourceUrl: string;
  attribution: string;
};

/** A verified import: licence facts plus the file(s) to load. */
export type CcVerifiedImport = CcImportMeta & {
  files: CcVerifiedFile[];
};

/** One licence-verified stock visual for a generated short segment. */
export type GeneratedVisual = {
  title: string;
  author: string;
  license: CcLicense;
  sourceUrl: string;
  attribution: string;
  fileUrl: string;
  fileName: string;
};
