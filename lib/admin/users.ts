/**
 * User drill-down assembly (ClipForge Phase 4).
 *
 * Pure assembly over rows the routes already fetched. The drill-down
 * shows profile, plan, usage minutes (summed clip durations), projects,
 * connected accounts (STATUS ONLY — token columns are never selected
 * by the store layer), posts timeline, compliance record, and support
 * notes. It never contains video bytes, transcripts, or token
 * material — those fields are never selected in the first place.
 */

import type { PublishAccountPublic } from "@/lib/publish/store";
import type {
  AdminUserRow,
  CreditAdjustmentRow,
  DrillClipRow,
  DrillPostRow,
  DrillProjectRow,
  SupportNoteRow,
} from "./store";
import { creditBalance } from "./store";

export type ComplianceRecord = {
  declarationCount: number;
  fingerprintScanCount: number;
  strikeCount: number;
  upheldStrikeCount: number;
  publishingPaused: boolean;
};

export type UserDrilldown = {
  user: AdminUserRow;
  usageMinutes: number;
  clipCount: number;
  projects: DrillProjectRow[];
  clips: DrillClipRow[];
  posts: DrillPostRow[];
  accounts: PublishAccountPublic[];
  compliance: ComplianceRecord;
  supportNotes: SupportNoteRow[];
  creditAdjustments: CreditAdjustmentRow[];
  creditBalanceClips: number;
};

export function assembleDrilldown(input: {
  user: AdminUserRow;
  projects: DrillProjectRow[];
  clips: DrillClipRow[];
  posts: DrillPostRow[];
  accounts: PublishAccountPublic[];
  declarationCount: number;
  fingerprintScanCount: number;
  strikeCount: number;
  upheldStrikeCount: number;
  supportNotes: SupportNoteRow[];
  creditAdjustments: CreditAdjustmentRow[];
}): UserDrilldown {
  const usageSeconds = input.clips.reduce(
    (sum, clip) =>
      sum + Math.max(0, clip.end_seconds - clip.start_seconds),
    0,
  );
  return {
    user: input.user,
    usageMinutes: Math.round((usageSeconds / 60) * 100) / 100,
    clipCount: input.clips.length,
    projects: input.projects,
    clips: input.clips,
    posts: input.posts,
    accounts: input.accounts,
    compliance: {
      declarationCount: input.declarationCount,
      fingerprintScanCount: input.fingerprintScanCount,
      strikeCount: input.strikeCount,
      upheldStrikeCount: input.upheldStrikeCount,
      publishingPaused: input.user.publishing_paused,
    },
    supportNotes: input.supportNotes,
    creditAdjustments: input.creditAdjustments,
    creditBalanceClips: creditBalance(input.creditAdjustments),
  };
}
