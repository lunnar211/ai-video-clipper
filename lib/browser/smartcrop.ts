/**
 * Content-aware crop via smartcrop (MIT). Samples one frame (the clip
 * midpoint), asks smartcrop for the best 9:16 window, and returns its
 * centre x as a fraction of the frame width. Any failure returns null
 * and the caller falls back to centre crop.
 */

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener("seeked", done);
      resolve();
    };
    video.addEventListener("seeked", done);
    video.currentTime = Math.min(time, video.duration - 0.05);
    setTimeout(done, 1500);
  });
}

export async function sampleSmartCropCenterX(
  video: HTMLVideoElement,
  time: number,
): Promise<number | null> {
  try {
    video.pause();
    await seekTo(video, time);
    const probe = document.createElement("canvas");
    probe.width = 480;
    probe.height = Math.max(
      1,
      Math.round(480 * (video.videoHeight / Math.max(1, video.videoWidth))),
    );
    const pctx = probe.getContext("2d", { willReadFrequently: true });
    if (!pctx) return null;
    pctx.drawImage(video, 0, 0, probe.width, probe.height);
    const smartcrop = (await import("smartcrop")).default;
    const result = await smartcrop.crop(probe, { width: 90, height: 160 });
    const crop = result.topCrop;
    if (!crop || crop.width <= 0) return null;
    return (crop.x + crop.width / 2) / probe.width;
  } catch {
    return null;
  }
}
