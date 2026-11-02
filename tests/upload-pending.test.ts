import { describe, expect, it } from "vitest";
import {
  hasPendingUpload,
  setPendingUpload,
  takePendingUpload,
} from "@/lib/upload-pending";

function fakeVideo(name = "clip.mp4"): File {
  return new File(["x"], name, { type: "video/mp4" });
}

describe("hero → tool file handoff", () => {
  it("starts empty", () => {
    expect(takePendingUpload()).toBeNull();
    expect(hasPendingUpload()).toBe(false);
  });

  it("is consumed exactly once", () => {
    const file = fakeVideo();
    setPendingUpload(file);
    expect(hasPendingUpload()).toBe(true);
    expect(takePendingUpload()).toBe(file);
    expect(takePendingUpload()).toBeNull();
    expect(hasPendingUpload()).toBe(false);
  });

  it("a newer file replaces an unconsumed one", () => {
    setPendingUpload(fakeVideo("old.mp4"));
    const next = fakeVideo("new.mp4");
    setPendingUpload(next);
    expect(takePendingUpload()).toBe(next);
  });
});
