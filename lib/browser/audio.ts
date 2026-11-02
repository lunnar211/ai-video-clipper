/**
 * Browser audio extraction. The video file itself never leaves the
 * browser: only this resampled audio is sent to the transcription route.
 * 16 kHz mono keeps a 10-minute video at ~19 MB, under Groq's 25 MB cap.
 */

/** Pure function: Float32 samples -> 16-bit PCM WAV bytes. */
export function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeString = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([view], { type: "audio/wav" });
}

/** Downmix to mono + linear resample to `targetRate`. Pure function. */
export function resampleMono(
  channels: Float32Array[],
  sourceRate: number,
  targetRate: number,
): Float32Array {
  const frames = channels[0]?.length ?? 0;
  if (frames === 0) return new Float32Array(0);
  const mono = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i] ?? 0;
    mono[i] = sum / channels.length;
  }
  if (sourceRate === targetRate) return mono;
  const outLen = Math.floor((frames * targetRate) / sourceRate);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = (i * sourceRate) / targetRate;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = mono[idx] ?? 0;
    const b = mono[Math.min(idx + 1, frames - 1)] ?? 0;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

/** Decode a video file's audio and return a 16 kHz mono WAV blob. */
export async function extractAudioWav(file: File): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const arrayBuffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(arrayBuffer);
    const channels: Float32Array[] = [];
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      channels.push(decoded.getChannelData(c));
    }
    const mono = resampleMono(channels, decoded.sampleRate, 16000);
    return encodeWav(mono, 16000);
  } finally {
    await ctx.close().catch(() => undefined);
  }
}
