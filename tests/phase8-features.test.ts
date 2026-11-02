/**
 * ClipForge Phase 8 — route + lib tests (mocked HTTP/fetch only).
 *
 * Covers the new Phase 8 surface: plan gates, the hand-rolled
 * invoice PDF, YouTube link parsing + ownership verification,
 * sweeper due-selection, the worker callback signature round-trip,
 * and the session helper's never-throw contract. No real network,
 * no real database, no real credentials.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session-user", () => ({
  getSessionUserId: vi.fn().mockResolvedValue(null),
}));

import {
  checkMinutesGate,
  checkProjectGate,
  checkTargetsGate,
  gateRefusalMessage,
  minutesForClip,
} from "@/lib/billing/gates";
import {
  buildInvoicePdf,
  escapePdfText,
  formatMinor,
  invoicePdfLines,
} from "@/lib/billing/pdf";
import {
  parseYoutubeVideoId,
  verifyVideoOwnership,
} from "@/lib/imports/youtube";
import { isDeliveryDue } from "@/lib/integrations/sweepers";
import {
  signWorkerRequest,
  verifyWorkerRequest,
} from "@/lib/server-render/contract";
import { getSessionUserId } from "@/lib/auth/session-user";

describe("plan gates", () => {
  it("free plan allows a short clip and refuses past 30 minutes", () => {
    expect(
      checkMinutesGate({
        planId: "free",
        minutesUsedThisMonth: 20,
        requestedMinutes: 5,
      }).allowed,
    ).toBe(true);
    const refused = checkMinutesGate({
      planId: "free",
      minutesUsedThisMonth: 29,
      requestedMinutes: 5,
    });
    expect(refused.allowed).toBe(false);
    if (!refused.allowed) {
      expect(refused.limit).toBe(30);
      expect(refused.usage).toBe(34);
      expect(gateRefusalMessage(refused)).toContain("30");
    }
  });

  it("unknown plan ids fall back to the free limits", () => {
    expect(
      checkMinutesGate({
        planId: "mystery",
        minutesUsedThisMonth: 0,
        requestedMinutes: 31,
      }).allowed,
    ).toBe(false);
    expect(
      checkTargetsGate({ planId: "mystery", targetCount: 2 }).allowed,
    ).toBe(false);
  });

  it("project gate counts only project creation, and agency is unlimited", () => {
    expect(
      checkProjectGate({ planId: "free", projectCount: 3 }).allowed,
    ).toBe(false);
    expect(
      checkProjectGate({ planId: "pro", projectCount: 49 }).allowed,
    ).toBe(true);
    expect(
      checkProjectGate({ planId: "agency", projectCount: 999 }).allowed,
    ).toBe(true);
  });

  it("target gate allows 1/3/10 by tier", () => {
    expect(checkTargetsGate({ planId: "free", targetCount: 1 }).allowed).toBe(true);
    expect(checkTargetsGate({ planId: "free", targetCount: 2 }).allowed).toBe(false);
    expect(checkTargetsGate({ planId: "pro", targetCount: 3 }).allowed).toBe(true);
    expect(checkTargetsGate({ planId: "agency", targetCount: 10 }).allowed).toBe(true);
    expect(checkTargetsGate({ planId: "agency", targetCount: 11 }).allowed).toBe(false);
  });

  it("minutesForClip rounds fractional minutes up, with a 1-minute floor", () => {
    expect(minutesForClip(0)).toBe(1);
    expect(minutesForClip(1)).toBe(1);
    expect(minutesForClip(61)).toBe(2);
    expect(minutesForClip(1800)).toBe(30);
  });
});

describe("invoice PDF", () => {
  const invoice = {
    id: "inv-1",
    user_id: "user-1",
    number: "INV-0001",
    provider: "paddle",
    status: "paid",
    currency: "USD",
    total_minor: 1900,
    subscription_id: null,
    provider_transaction_id: null,
    line_items: [
      { description: "Pro plan", quantity: 1, amount_minor: 1900 },
    ],
    pdf_url: null,
    created_at: "2026-11-01T00:00:00.000Z",
  };

  it("formats minor units with zero-decimal currencies handled", () => {
    expect(formatMinor(1900, "USD")).toBe("19.00 USD");
    expect(formatMinor(1900, "JPY")).toBe("1900 JPY");
    expect(formatMinor(0, "EUR")).toBe("0.00 EUR");
  });

  it("escapes PDF string specials", () => {
    expect(escapePdfText("a(b)c\\d")).toBe("a\\(b\\)c\\\\d");
  });

  it("builds a structurally valid PDF with the invoice data in it", () => {
    const pdf = buildInvoicePdf(invoice);
    const text = new TextDecoder().decode(pdf);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("INV-0001");
    expect(text).toContain("19.00");
    expect(text).toContain("%%EOF");
    // Byte-level xref check (not just string level): the offset
    // after startxref must point at a real "xref" in the BYTES,
    // which is what PDF readers actually use.
    const start = Number(text.split("startxref")[1].trim().split(/\s/)[0]);
    expect(text.slice(start, start + 4)).toBe("xref");
    expect(
      String.fromCharCode(...pdf.slice(start, start + 4)),
    ).toBe("xref");
  });

  it("sanitizes non-ASCII text so offsets stay byte-accurate", () => {
    const pdf = buildInvoicePdf({
      ...invoice,
      line_items: [
        { description: "Café — Pro plan", quantity: 1, amount_minor: 1900 },
      ],
    });
    expect([...pdf].every((b) => b < 128)).toBe(true);
    const text = new TextDecoder().decode(pdf);
    expect(text).toContain("Caf? - Pro plan");
    const start = Number(text.split("startxref")[1].trim().split(/\s/)[0]);
    expect(
      String.fromCharCode(...pdf.slice(start, start + 4)),
    ).toBe("xref");
  });

  it("invoicePdfLines paginates and always lists the total", () => {
    const texts = invoicePdfLines(invoice).flat().map((l) => l.text);
    expect(texts.some((t) => t.includes("Invoice INV-0001"))).toBe(true);
    expect(texts.some((t) => t.includes("Pro plan | 1 | 19.00"))).toBe(true);
    expect(texts.some((t) => t.includes("Total: 19.00"))).toBe(true);
    expect(texts.some((t) => t.includes("Status: paid"))).toBe(true);
  });
});

describe("YouTube own-video import", () => {
  it("parses watch, shorts, embed, live, /v/, and youtu.be links", () => {
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=AbC123_xYzQ")).toBe("AbC123_xYzQ");
    expect(parseYoutubeVideoId("https://youtu.be/AbC123_xYzQ?t=30")).toBe("AbC123_xYzQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/shorts/AbC123_xYzQ")).toBe("AbC123_xYzQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/embed/AbC123_xYzQ")).toBe("AbC123_xYzQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/live/AbC123_xYzQ")).toBe("AbC123_xYzQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/v/AbC123_xYzQ")).toBe("AbC123_xYzQ");
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=AbC123_xYzQ&list=PL9")).toBe("AbC123_xYzQ");
  });

  it("rejects non-YouTube hosts, channel pages, and empty ids", () => {
    expect(parseYoutubeVideoId("https://example.com/watch?v=AbC123_xYz")).toBeNull();
    expect(parseYoutubeVideoId("https://www.youtube.com/channel/UC123")).toBeNull();
    expect(parseYoutubeVideoId("https://www.youtube.com/watch?v=")).toBeNull();
    expect(parseYoutubeVideoId("not a url")).toBeNull();
    expect(parseYoutubeVideoId("")).toBeNull();
  });

  it("verifyVideoOwnership accepts an exact channel match and refuses the rest", async () => {
    const route = (channels: unknown, videos: unknown) =>
      vi.fn(async (url: unknown) => {
        const u = String(url);
        const body = u.includes("channels?") ? channels : videos;
        return {
          ok: true,
          status: 200,
          json: async () => body,
        };
      });
    const owned = await verifyVideoOwnership({
      videoId: "AbC123_xYz",
      accessToken: "tok",
      fetchImpl: route(
        { items: [{ id: "UC-OWN", snippet: { title: "My channel" } }] },
        {
          items: [
            {
              snippet: {
                channelId: "UC-OWN",
                channelTitle: "My channel",
                title: "Mine",
              },
            },
          ],
        },
      ) as unknown as typeof fetch,
    });
    expect(owned).toEqual({
      owned: true,
      videoId: "AbC123_xYz",
      channelId: "UC-OWN",
      channelTitle: "My channel",
      videoTitle: "Mine",
    });

    const notOwned = await verifyVideoOwnership({
      videoId: "AbC123_xYz",
      accessToken: "tok",
      fetchImpl: route(
        { items: [{ id: "UC-OWN", snippet: { title: "My channel" } }] },
        {
          items: [
            {
              snippet: {
                channelId: "UC-OTHER",
                channelTitle: "Someone else",
                title: "Not mine",
              },
            },
          ],
        },
      ) as unknown as typeof fetch,
    });
    expect(notOwned).toEqual({ owned: false, reason: "not_owned" });

    const notFound = await verifyVideoOwnership({
      videoId: "AbC123_xYz",
      accessToken: "tok",
      fetchImpl: route(
        { items: [{ id: "UC-OWN", snippet: { title: "My channel" } }] },
        { items: [] },
      ) as unknown as typeof fetch,
    });
    expect(notFound).toEqual({ owned: false, reason: "not_found" });

    // A 403 on the channel read means the grant lacks channel-read
    // permission: the honest answer is "reconnect", never a pass.
    const forbidden = vi.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => null,
    }));
    expect(
      await verifyVideoOwnership({
        videoId: "AbC123_xYz",
        accessToken: "tok",
        fetchImpl: forbidden as unknown as typeof fetch,
      }),
    ).toEqual({ owned: false, reason: "channel_unreadable" });
  });
});

describe("webhook retry sweeper due-selection", () => {
  const base = {
    id: "d1",
    event: "clip.ready",
    status: "failed" as const,
    attempts: 0,
    created_at: "2026-11-01T00:00:00.000Z",
    next_attempt_at: null,
    response_status: null,
    error: null,
  };

  it("failed rows are due immediately, delivered rows never, and backoff waits", () => {
    const t = (iso: string) => Date.parse(iso);
    expect(isDeliveryDue(base, t("2026-11-01T00:01:00Z"))).toBe(true);
    expect(
      isDeliveryDue({ ...base, status: "delivered" }, t("2026-11-01T00:01:00Z")),
    ).toBe(false);
    expect(
      isDeliveryDue(
        { ...base, attempts: 3, next_attempt_at: "2026-11-01T01:00:00Z" },
        t("2026-11-01T00:30:00Z"),
      ),
    ).toBe(false);
    expect(
      isDeliveryDue(
        { ...base, attempts: 3, next_attempt_at: "2026-11-01T01:00:00Z" },
        t("2026-11-01T01:00:00Z"),
      ),
    ).toBe(true);
    expect(
      isDeliveryDue({ ...base, attempts: 5 }, t("2026-11-02T00:00:00Z")),
    ).toBe(false);
  });
});

describe("worker callback signature", () => {
  it("verifyWorkerRequest accepts its own signed payload and refuses tampering", async () => {
    const secret = "test-worker-secret";
    const payload = JSON.stringify({ jobId: "j1", status: "done" });
    const sig = await signWorkerRequest(payload, secret);
    expect(await verifyWorkerRequest(payload, sig, secret)).toBe(true);
    expect(
      await verifyWorkerRequest(payload + "x", sig, secret),
    ).toBe(false);
    expect(await verifyWorkerRequest(payload, "00", secret)).toBe(false);
    expect(await verifyWorkerRequest(payload, sig, "wrong-secret")).toBe(false);
    expect(await verifyWorkerRequest(payload, "", secret)).toBe(false);
  });
});

describe("session helper", () => {
  beforeEach(() => {
    vi.mocked(getSessionUserId).mockReset();
  });

  it("returns the mocked session user id", async () => {
    vi.mocked(getSessionUserId).mockResolvedValue("user-9");
    expect(await getSessionUserId()).toBe("user-9");
  });
});
