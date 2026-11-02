import { describe, expect, it } from "vitest";
import { encodeWav, resampleMono } from "@/lib/browser/audio";

describe("encodeWav", () => {
  it("writes a valid 16-bit mono WAV header", async () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1, -1]);
    const blob = encodeWav(samples, 16000);
    expect(blob.type).toBe("audio/wav");
    const buf = new DataView(await blob.arrayBuffer());
    const text = (off: number, len: number) =>
      Array.from({ length: len }, (_, i) =>
        String.fromCharCode(buf.getUint8(off + i)),
      ).join("");
    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(buf.getUint16(22, true)).toBe(1); // mono
    expect(buf.getUint32(24, true)).toBe(16000);
    expect(buf.getUint16(34, true)).toBe(16);
    expect(buf.getInt16(44, true)).toBe(0);
    expect(buf.getInt16(46, true)).toBeGreaterThan(16000);
    expect(buf.getInt16(48, true)).toBeLessThan(-16000);
  });
});

describe("resampleMono", () => {
  it("downmixes stereo and resamples", () => {
    const left = new Float32Array([1, 1, 1, 1]);
    const right = new Float32Array([0, 0, 0, 0]);
    const out = resampleMono([left, right], 48000, 16000);
    // 4 frames at 48k -> ~1 frame at 16k, averaged to 0.5
    expect(out.length).toBe(1);
    expect(out[0]).toBeCloseTo(0.5);
  });

  it("returns empty for empty input", () => {
    expect(resampleMono([new Float32Array(0)], 48000, 16000).length).toBe(0);
  });
});
