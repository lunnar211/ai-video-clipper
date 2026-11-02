import { describe, it, expect } from "vitest";
import { sniffHeader, sniffVideoFile } from "@/lib/browser/filetype";

describe("file-type sniffing", () => {
  it("recognises MP4/MOV ftyp headers", () => {
    const bytes = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
    ]);
    expect(sniffHeader(bytes)).toBe("video");
  });
  it("recognises WebM EBML headers", () => {
    expect(sniffHeader(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 1, 2]))).toBe(
      "video",
    );
  });
  it("recognises AVI headers", () => {
    const bytes = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20,
    ]);
    expect(sniffHeader(bytes)).toBe("video");
  });
  it("rejects non-video headers and calls short input unknown", () => {
    expect(
      sniffHeader(new TextEncoder().encode("%PDF-1.7 fake pdf header")),
    ).toBe("not-video");
    expect(sniffHeader(new Uint8Array([1, 2]))).toBe("unknown");
  });
  it("sniffs a File object end to end", async () => {
    const mp4 = new File(
      [
        new Uint8Array([
          0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
        ]),
      ],
      "clip.mp4",
      { type: "video/mp4" },
    );
    expect(await sniffVideoFile(mp4)).toBe("video");
    const pdf = new File(["%PDF-1.7 not a video at all"], "doc.pdf");
    expect(await sniffVideoFile(pdf)).toBe("not-video");
  });
});
