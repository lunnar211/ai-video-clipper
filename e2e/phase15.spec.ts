import { expect, test } from "@playwright/test";

/**
 * Phase 15 — "AI clean" render option specs.
 *
 * The clean-audio toggle and the pre-export rights panel live in an
 * always-visible section on /create (unlike the render buttons,
 * which need clips), so these specs run signed out with no video
 * file. A real muted render (output blob carrying no audio track)
 * cannot run without a video file in this environment — the mix
 * logic is pinned in vitest (audio-plan) and the manual QA
 * checklist in docs/PHASE15.md covers the end-to-end render.
 */

test("create page shows the clean-audio toggle and rights panel", async ({
  page,
}) => {
  await page.goto("/create");
  await expect(
    page.getByRole("heading", { name: "Clean audio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Keep original audio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("radio", { name: "Mute original audio" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Before you export — rights check" }),
  ).toBeVisible();
  await expect(
    page.getByText("Source not recorded — unverified"),
  ).toBeVisible();
  await expect(
    page.getByText("Not scanned — no music check has run"),
  ).toBeVisible();
});

test("replace stays hidden without a licensed track", async ({ page }) => {
  await page.goto("/create");
  await expect(
    page.getByRole("radio", { name: /Replace original audio/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("To replace the audio instead of muting it"),
  ).toBeVisible();
});

test("muting updates the rights panel", async ({ page }) => {
  await page.goto("/create");
  await page.getByRole("radio", { name: "Mute original audio" }).click();
  await expect(
    page.getByText("Original audio muted — renders carry no original audio track."),
  ).toBeVisible();
});

test("no banned copyright promise appears on /create", async ({ page }) => {
  await page.goto("/create");
  await expect(
    page.getByText(/copyright-free|copyright removed|no copyright strikes/i),
  ).toHaveCount(0);
});
