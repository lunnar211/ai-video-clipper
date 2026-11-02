import { describe, expect, it } from "vitest";
import { median, windowForCenterX, windowForMode } from "@/lib/crop";

describe("windowForCenterX", () => {
  it("uses full height on a wide frame", () => {
    const w = windowForCenterX(1920, 1080, 0.5);
    expect(w.sh).toBe(1080);
    expect(w.sw).toBeCloseTo(1080 * (9 / 16));
    expect(w.sx).toBeCloseTo((1920 - w.sw) / 2);
    expect(w.sy).toBe(0);
  });

  it("clamps the window inside a narrow frame", () => {
    const w = windowForCenterX(720, 1280, 0.99);
    expect(w.sw).toBe(720);
    expect(w.sx).toBe(0);
    expect(w.sy).toBe(0);
  });

  it("uses full width on a vertical frame", () => {
    const w = windowForCenterX(720, 1280, 0.5);
    expect(w.sw).toBe(720);
    expect(w.sh).toBe(1280);
  });

  it("returns an empty window for bad input", () => {
    expect(windowForCenterX(0, 1080, 0.5)).toEqual({
      sx: 0,
      sy: 0,
      sw: 0,
      sh: 0,
    });
  });
});

describe("windowForMode", () => {
  it("left/centre/right map to edges and middle", () => {
    expect(windowForMode(1920, 1080, "left").sx).toBe(0);
    const right = windowForMode(1920, 1080, "right");
    expect(right.sx + right.sw).toBe(1920);
    const center = windowForMode(1920, 1080, "center");
    expect(center.sx).toBeCloseTo((1920 - center.sw) / 2);
  });
});

describe("median", () => {
  it("handles empty, odd and even lists", () => {
    expect(median([])).toBe(0);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
});
