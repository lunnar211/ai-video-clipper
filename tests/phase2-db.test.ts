import { describe, it, expect, vi } from "vitest";
import {
  createDeclarationRow,
  getDeclarationRow,
} from "@/lib/rights/declarations";
import {
  createStrikeRow,
  updateStrikeRow,
  createAppealRow,
} from "@/lib/rights/strikes";
import { createChecklistRow } from "@/lib/rights/checklist";

const db = { url: "https://example.supabase.co", serviceKey: "srv" };

function mockFetch(body: unknown, ok = true, status = 200) {
  return vi.fn(async () => ({
    ok,
    status,
    json: async () => body,
  })) as unknown as typeof fetch;
}

describe("rights DB helpers (mocked PostgREST)", () => {
  it("creates and reads a declaration row", async () => {
    const created = {
      id: "d1",
      user_id: null,
      project_id: "proj-1",
      ip: "1.2.3.4",
      user_agent: "ua",
      declaration_text: "I own or have licensed this video and its music.",
      declaration_text_version: "2026-11-02-v1",
      accepted_at: "2026-11-02T00:00:00Z",
    };
    const post = mockFetch([created]);
    const row = await createDeclarationRow(
      db,
      {
        user_id: null,
        project_id: "proj-1",
        ip: "1.2.3.4",
        user_agent: "ua",
        declaration_text: created.declaration_text,
        declaration_text_version: created.declaration_text_version,
      },
      post,
    );
    expect(row.id).toBe("d1");
    const get = mockFetch([created]);
    expect((await getDeclarationRow(db, "proj-1", get))?.id).toBe("d1");
    const getEmpty = mockFetch([]);
    expect(await getDeclarationRow(db, "proj-2", getEmpty)).toBeNull();
  });
  it("creates a strike and moves it through review", async () => {
    const strike = {
      id: "s1",
      reporter_name: "Ann",
      reporter_email: "ann@example.com",
      work_description: "My song, released 2024.",
      infringing_ref: "https://example.com/post/1",
      accused_user_id: null,
      status: "submitted" as const,
      admin_note: null,
      created_at: "2026-11-02T00:00:00Z",
    };
    const post = mockFetch([strike]);
    const created = await createStrikeRow(
      db,
      {
        reporter_name: "Ann",
        reporter_email: "ann@example.com",
        work_description: "My song, released 2024.",
        infringing_ref: "https://example.com/post/1",
        accused_user_id: null,
      },
      post,
    );
    expect(created.status).toBe("submitted");
    const patch = mockFetch([{ ...strike, status: "under_review" }]);
    const updated = await updateStrikeRow(
      db,
      "s1",
      { status: "under_review", admin_note: null },
      patch,
    );
    expect(updated.status).toBe("under_review");
  });
  it("creates an appeal and a checklist record", async () => {
    const appeal = {
      id: "a1",
      strike_id: "00000000-0000-0000-0000-000000000000",
      appellant_name: "Bob",
      appellant_email: "bob@example.com",
      reason: "I own the licence for this music.",
      status: "submitted" as const,
      admin_note: null,
      created_at: "2026-11-02T00:00:00Z",
    };
    const post = mockFetch([appeal]);
    const created = await createAppealRow(
      db,
      {
        strike_id: appeal.strike_id,
        appellant_name: "Bob",
        appellant_email: "bob@example.com",
        reason: "I own the licence for this music.",
      },
      post,
    );
    expect(created.id).toBe("a1");
    const checklist = {
      id: "c1",
      postRef: "clip-1",
      projectId: "proj-1",
      ticks: {
        declaration: true,
        musicLicence: true,
        fingerprintReviewed: true,
        platformRules: true,
      },
      created_at: "2026-11-02T00:00:00Z",
    };
    const cpost = mockFetch([checklist]);
    const saved = await createChecklistRow(
      db,
      {
        postRef: "clip-1",
        projectId: "proj-1",
        ticks: {
          declaration: true,
          musicLicence: true,
          fingerprintReviewed: true,
          platformRules: true,
        },
      },
      cpost,
    );
    expect(saved.id).toBe("c1");
  });
  it("throws on a failed insert instead of inventing a row", async () => {
    const bad = mockFetch({ message: "nope" }, false, 500);
    await expect(
      createDeclarationRow(
        db,
        {
          user_id: null,
          project_id: "proj-1",
          ip: null,
          user_agent: null,
          declaration_text: "x",
          declaration_text_version: "v1",
        },
        bad,
      ),
    ).rejects.toThrow(/HTTP 500/);
  });
});
