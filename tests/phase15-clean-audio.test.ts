import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveAudioPlan,
  availableTreatments,
} from "@/lib/browser/audio-plan";
import {
  sourceLicenceLine,
  summarizeMusicChecks,
  buildPanelAttribution,
} from "@/lib/rights/panel";

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Phase 15 — "AI clean" render option.
 *
 * Pins the audio plan (what a render's mix actually contains), the
 * rights-panel wording (a check that never ran reads as not
 * scanned, never as clear), and the copy ban: no new UI copy may
 * promise that copyright is gone. The ban is scoped to the files
 * this phase writes — older pages that merely discuss the ban in
 * words (e.g. the acceptable-use denial) are out of scope.
 */
describe("resolveAudioPlan", () => {
  it("original connects the video audio and mixes a track quietly", () => {
    expect(
      resolveAudioPlan("original", { hasMusic: true, hasVoiceover: false }),
    ).toEqual({
      treatment: "original",
      connectOriginal: true,
      musicGain: 0.15,
      hasAudioTrack: true,
    });
  });

  it("muted disconnects the original and leaves no audio track alone", () => {
    expect(
      resolveAudioPlan("muted", { hasMusic: false, hasVoiceover: false }),
    ).toEqual({
      treatment: "muted",
      connectOriginal: false,
      musicGain: null,
      hasAudioTrack: false,
    });
  });

  it("muted still carries voiceover narration when enabled", () => {
    const plan = resolveAudioPlan("muted", {
      hasMusic: false,
      hasVoiceover: true,
    });
    expect(plan.connectOriginal).toBe(false);
    expect(plan.hasAudioTrack).toBe(true);
  });

  it("muted still mixes a picked track as background", () => {
    const plan = resolveAudioPlan("muted", {
      hasMusic: true,
      hasVoiceover: false,
    });
    expect(plan.connectOriginal).toBe(false);
    expect(plan.musicGain).toBe(0.15);
    expect(plan.hasAudioTrack).toBe(true);
  });

  it("replaced disconnects the original and plays the track full-volume", () => {
    expect(
      resolveAudioPlan("replaced", { hasMusic: true, hasVoiceover: false }),
    ).toEqual({
      treatment: "replaced",
      connectOriginal: false,
      musicGain: 1.0,
      hasAudioTrack: true,
    });
  });

  it("replaced without a track falls back to muted, never invents one", () => {
    expect(
      resolveAudioPlan("replaced", { hasMusic: false, hasVoiceover: false }),
    ).toEqual({
      treatment: "muted",
      connectOriginal: false,
      musicGain: null,
      hasAudioTrack: false,
    });
  });
});

describe("availableTreatments", () => {
  it("hides replace when no licensed track is picked", () => {
    expect(availableTreatments(false)).toEqual(["original", "muted"]);
  });

  it("offers replace when a licensed track is picked", () => {
    expect(availableTreatments(true)).toEqual([
      "original",
      "muted",
      "replaced",
    ]);
  });
});

describe("sourceLicenceLine", () => {
  it("prefers verified CC facts with author and source", () => {
    expect(
      sourceLicenceLine({
        ccImport: {
          license: "CC-BY",
          author: "Example Author",
          title: "Example Clip",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Example",
          attribution: "Example attribution",
        },
        ytImport: null,
        rightsOk: true,
      }),
    ).toContain("CC-BY");
    expect(
      sourceLicenceLine({
        ccImport: {
          license: "CC-BY",
          author: "Example Author",
          title: "Example Clip",
          sourceUrl: "https://commons.wikimedia.org/wiki/File:Example",
          attribution: "Example attribution",
        },
        ytImport: null,
        rightsOk: true,
      }),
    ).toContain("Example Author");
  });

  it("reports verified own-YouTube ownership", () => {
    expect(
      sourceLicenceLine({
        ccImport: null,
        ytImport: {
          videoId: "abc123",
          channelId: "chan1",
          channelTitle: "My Channel",
          videoTitle: "My Video",
          accountId: "acc1",
        },
        rightsOk: true,
      }),
    ).toContain("ownership verified");
  });

  it("falls back to the declaration, then to unverified", () => {
    expect(
      sourceLicenceLine({ ccImport: null, ytImport: null, rightsOk: true }),
    ).toContain("you declared");
    expect(
      sourceLicenceLine({ ccImport: null, ytImport: null, rightsOk: false }),
    ).toContain("unverified");
  });
});

describe("summarizeMusicChecks", () => {
  it("reads no checks at all as not scanned", () => {
    const lines = summarizeMusicChecks({});
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Not scanned");
  });

  it("reads an unconnected service as not scanned, never clear", () => {
    const lines = summarizeMusicChecks({
      c1: { status: "unavailable" },
    });
    expect(lines.join(" ")).toContain("Not scanned");
    expect(lines.join(" ")).not.toMatch(/\bclean\b/i);
  });

  it("words a no-match result without calling it clear", () => {
    const lines = summarizeMusicChecks({ c1: { status: "clear" } });
    expect(lines.join(" ")).toContain("no known recorded music");
    expect(lines.join(" ")).not.toMatch(/\bclean\b/i);
    expect(lines.join(" ")).toContain("not proof of clearance");
  });

  it("reports a detected match with artist and title", () => {
    const lines = summarizeMusicChecks({
      c1: {
        status: "detected",
        match: {
          artist: "Some Artist",
          title: "Some Song",
          album: null,
          label: null,
          timecode: null,
        },
      },
    });
    expect(lines.join(" ")).toContain("Some Artist — Some Song");
  });

  it("counts mixed outcomes in one summary", () => {
    const lines = summarizeMusicChecks({
      c1: { status: "clear" },
      c2: { status: "unavailable" },
      c3: { status: "checking" },
    });
    expect(lines).toHaveLength(3);
  });
});

describe("buildPanelAttribution", () => {
  it("joins the track credit and the CC credit", () => {
    const text = buildPanelAttribution({
      musicTrack: {
        name: "My Track",
        licence: "CC-BY (attribution required)",
        url: "blob:track",
      },
      ccImport: {
        license: "CC-BY",
        author: "Example Author",
        title: "Example Clip",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Example",
        attribution: "CC credit line",
      },
    });
    expect(text).toContain("My Track");
    expect(text).toContain("CC credit line");
  });

  it("returns null when no credit applies", () => {
    expect(
      buildPanelAttribution({ musicTrack: null, ccImport: null }),
    ).toBeNull();
  });
});

describe("Phase 15 copy ban", () => {
  const banned = /copyright-free|copyright removed|no copyright strikes/i;
  const files = [
    "components/RightsPanel.tsx",
    "components/ClipperTool.tsx",
    "lib/browser/audio-plan.ts",
    "lib/rights/panel.ts",
  ];
  it.each(files)("no banned promise in %s", (file) => {
    expect(read(file)).not.toMatch(banned);
  });

  it("keeps the standing sentence about AI editing", () => {
    const flat = read("components/RightsPanel.tsx").replace(/\s+/g, " ");
    expect(flat).toContain("AI editing does not remove copyright");
  });
});
