import { describe, expect, it, vi } from "vitest";
import { isYoutubeLink } from "@/lib/imports/youtube-link";
import {
  classifyYoutubeOwnedResponse,
  verifyYoutubeOwned,
} from "@/lib/imports/youtube-owned-client";

/**
 * Phase 14 — own-YouTube paste UI pins.
 *
 * The routing predicate decides whether a pasted link reaches the
 * own-YouTube flow at all, and the response mapping decides which
 * fix the UI shows (sign in vs connect vs reconnect vs refused).
 * If either is wrong, the user lands on the wrong fix or back at a
 * dead end — fix the code, never the test.
 */

describe("phase 14: youtube link routing", () => {
  it("routes youtube.com video shapes to the own-YouTube flow", () => {
    expect(isYoutubeLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYoutubeLink("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe(true);
    expect(isYoutubeLink("https://www.youtube.com/embed/dQw4w9WgXcQ")).toBe(true);
    expect(isYoutubeLink("https://www.youtube.com/live/dQw4w9WgXcQ")).toBe(true);
    expect(isYoutubeLink("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
    expect(isYoutubeLink("https://music.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(true);
  });

  it("routes youtu.be short links (the reported case) to the flow", () => {
    expect(isYoutubeLink("https://youtu.be/gml6derYB2k?si=TT9-XKca8S")).toBe(true);
  });

  it("routes any YouTube host link, even shapes the server then refuses", () => {
    // Playlists/channels are not video links, but they must still
    // reach the YouTube flow — where the server refuses them
    // specifically — instead of dead-ending in the CC box.
    expect(isYoutubeLink("https://www.youtube.com/playlist?list=PL123")).toBe(true);
    expect(isYoutubeLink("https://www.youtube.com/@somechannel")).toBe(true);
  });

  it("does not route other hosts or garbage to the YouTube flow", () => {
    expect(isYoutubeLink("https://commons.wikimedia.org/wiki/File:Example_video.mp4")).toBe(false);
    expect(isYoutubeLink("https://archive.org/details/example")).toBe(false);
    expect(isYoutubeLink("https://www.tiktok.com/@someone/video/123")).toBe(false);
    expect(isYoutubeLink("not a url")).toBe(false);
    expect(isYoutubeLink("")).toBe(false);
  });
});

describe("phase 14: youtube-owned response mapping", () => {
  const verifiedBody = {
    status: "verified",
    videoId: "dQw4w9WgXcQ",
    channelId: "UC123",
    channelTitle: "My Channel",
    videoTitle: "My Video",
    accountId: "acc-1",
  };

  it("maps a verified body to ok + meta", () => {
    const res = classifyYoutubeOwnedResponse(200, verifiedBody);
    expect(res).toEqual({
      ok: true,
      meta: {
        videoId: "dQw4w9WgXcQ",
        channelId: "UC123",
        channelTitle: "My Channel",
        videoTitle: "My Video",
        accountId: "acc-1",
      },
    });
  });

  it("maps no-session 401 to signin, stale-grant 401 to reconnect", () => {
    expect(
      classifyYoutubeOwnedResponse(401, {
        error: "Sign in to import from your own YouTube channel.",
      }),
    ).toMatchObject({ ok: false, kind: "signin" });
    expect(
      classifyYoutubeOwnedResponse(401, {
        error:
          "Your YouTube connection expired and could not be refreshed — reconnect your YouTube account, then retry.",
      }),
    ).toMatchObject({ ok: false, kind: "reconnect" });
  });

  it("maps not-connected 400, mismatch 403, reconnect 403, not-found 404", () => {
    expect(
      classifyYoutubeOwnedResponse(400, {
        error:
          "No YouTube account is connected for this user — connect it from the account page while signed in, then retry.",
      }),
    ).toMatchObject({ ok: false, kind: "not_connected" });
    expect(
      classifyYoutubeOwnedResponse(400, {
        error: "That link is not a YouTube video link (watch, shorts, embed, live, or youtu.be).",
      }),
    ).toMatchObject({ ok: false, kind: "invalid" });
    expect(
      classifyYoutubeOwnedResponse(403, {
        error:
          "That video is not on your connected YouTube channel — only your own videos can be imported.",
      }),
    ).toMatchObject({ ok: false, kind: "mismatch" });
    expect(
      classifyYoutubeOwnedResponse(403, {
        error:
          "Your YouTube connection predates channel-read permission — reconnect your YouTube account to grant it, then retry.",
      }),
    ).toMatchObject({ ok: false, kind: "reconnect" });
    expect(
      classifyYoutubeOwnedResponse(404, {
        error: "That video was not found or is not visible.",
      }),
    ).toMatchObject({ ok: false, kind: "not_found" });
  });

  it("maps server failures to server and passes the message through", () => {
    expect(
      classifyYoutubeOwnedResponse(502, {
        error: "YouTube verification failed — try again in a minute.",
      }),
    ).toMatchObject({
      ok: false,
      kind: "server",
      message: "YouTube verification failed — try again in a minute.",
    });
    expect(
      classifyYoutubeOwnedResponse(503, { error: "Publishing needs database setup." }),
    ).toMatchObject({ ok: false, kind: "server" });
  });

  it("verifyYoutubeOwned posts only {url} and maps a network failure", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => verifiedBody,
    }));
    const res = await verifyYoutubeOwned(
      "https://youtu.be/dQw4w9WgXcQ",
      fetchMock as never,
    );
    expect(res.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/imports/youtube-owned",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ url: "https://youtu.be/dQw4w9WgXcQ" }),
      }),
    );
    const down = await verifyYoutubeOwned(
      "https://youtu.be/dQw4w9WgXcQ",
      (async () => {
        throw new Error("offline");
      }) as never,
    );
    expect(down).toMatchObject({ ok: false, kind: "unavailable" });
  });
});
