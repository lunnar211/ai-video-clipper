import { expect, test } from "@playwright/test";

/**
 * ClipForge Phase 23 — professional redesign (round 2).
 *
 * The owner judged the site the worst-looking of its kind, so this
 * phase rebuilds the visual system around the existing Ink + Record
 * identity instead of another polish pass: a real tool panel for
 * the hero upload box, a distinct frame for the "See it work" live
 * entry, drawn icons on the feature grid, plan cards instead of a
 * squeezed table, a structured footer, styled file pickers, plain
 * words on the publish composer, and a readable queue. It also
 * fixes a real bug the audit found: /generate fired an
 * unauthenticated /api/projects fetch for every guest, logging a
 * 401 console error before the visitor did anything.
 *
 * Signed-out only — no test accounts, no secrets, no real AI calls.
 */

const REDESIGNED = ["/", "/create", "/generate", "/publish", "/pricing", "/signin"];

test.describe("Phase 23 viewports", () => {
  for (const [width, height] of [
    [390, 844],
    [1280, 800],
  ] as const) {
    test.describe(`${width}px viewport`, () => {
      test.use({ viewport: { width, height } });

      for (const route of REDESIGNED) {
        test(`no horizontal scroll on ${route}`, async ({ page }) => {
          await page.goto(route);
          await page.waitForLoadState("domcontentloaded");
          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          );
          expect(overflow).toBeLessThanOrEqual(1);
        });

        test(`no console or page errors on ${route}`, async ({ page }) => {
          const errors: string[] = [];
          page.on("console", (msg) => {
            if (msg.type() === "error") errors.push(msg.text());
          });
          page.on("pageerror", (err) => errors.push(err.message));
          await page.goto(route);
          await page.waitForLoadState("domcontentloaded");
          await page.waitForTimeout(1500);
          // The /publish queue fetch answers 503 in this sandbox
          // because no database is configured here — the page
          // handles it with the honest "needs database setup"
          // notice. On live the database is configured and the
          // same fetch returns 200, so no resource error is logged
          // there. A 429 is the same class of expected noise: the
          // full suite hammers the server and trips the per-IP
          // limiter, which the page also handles honestly. Same
          // filter precedent as Phase 20's 429.
          const real = errors.filter(
            (e) =>
              !e.includes("status of 503") && !e.includes("status of 429"),
          );
          expect(real).toEqual([]);
        });
      }

      test("homepage: hero is a tool panel with plan cards and icons", async ({
        page,
      }) => {
        await page.goto("/");
        await page.waitForLoadState("domcontentloaded");
        // The upload box is a named panel now, not a dashed box.
        // (Two instances live on the homepage — hero + See it work —
        // so assert the first.)
        await expect(
          page.getByText("Clipper — free in your browser").first(),
        ).toBeVisible();
        await expect(
          page.getByText("No account needed").first(),
        ).toBeVisible();
        // Format chips state the output on the panel itself.
        await expect(page.getByText("9:16 vertical").first()).toBeVisible();
        // The live entry is framed as the real tool, not a duplicate.
        await expect(
          page.getByText("Live tool — the real clipper, not a preview"),
        ).toBeVisible();
        // Feature cards carry a drawn icon each.
        const feature = page.locator("article", {
          hasText: "AI finds the moments",
        });
        await expect(feature.locator("svg").first()).toBeVisible();
        // Plans are cards, one per plan, not a squeezed table.
        for (const plan of ["free plan", "pro plan", "agency plan"]) {
          await expect(page.getByLabel(plan)).toBeVisible();
        }
        await expect(page.locator("table")).toHaveCount(0);
        // No generic gradient anywhere.
        await expect(page.locator('[class*="bg-gradient"]')).toHaveCount(0);
      });

      test("create: styled file picker, no raw browser input", async ({
        page,
      }) => {
        await page.goto("/create");
        await page.waitForLoadState("domcontentloaded");
        // The visible control is a real button label, not the
        // browser's "Choose File / No file chosen" text.
        await expect(
          page.getByText("Choose a video file").first(),
        ).toBeVisible();
        await expect(page.getByText("No file chosen")).toHaveCount(0);
        // The onboarding title fits its row (it wrapped around the
        // Dismiss button on a phone before this phase).
        const title = page.getByRole("heading", {
          name: "First time here? Four steps to your first clip",
        });
        await expect(title).toBeVisible();
        const box = await title.boundingBox();
        expect(box).not.toBeNull();
        expect(box!.width).toBeLessThanOrEqual(width);
      });

      test("generate: guests fire no /api/projects request", async ({
        page,
      }) => {
        const projectRequests: string[] = [];
        page.on("request", (req) => {
          if (req.url().includes("/api/projects")) {
            projectRequests.push(req.url());
          }
        });
        await page.goto("/generate");
        await page.waitForLoadState("domcontentloaded");
        await page.waitForTimeout(2000);
        expect(projectRequests).toEqual([]);
      });

      test("publish: plain words, grouped composer, readable queue", async ({
        page,
      }) => {
        await page.goto("/publish");
        await page.waitForLoadState("domcontentloaded");
        await expect(
          page.getByRole("heading", { name: "1. The clip" }),
        ).toBeVisible();
        await expect(
          page.getByRole("heading", { name: "3. Where to post" }),
        ).toBeVisible();
        // The select's wrapping label also carries its option
        // texts ("Public / Unlisted / Private"), so the accessible
        // name is longer than "Visibility" — substring match.
        await expect(page.getByLabel("Visibility")).toBeVisible();
        // No raw internal labels and no raw JSON dump.
        await expect(page.getByText("Staged media key")).toHaveCount(0);
        await expect(page.getByText("Clip ref")).toHaveCount(0);
        await expect(page.getByText("Checklist post ref")).toHaveCount(0);
        await expect(page.locator("section pre")).toHaveCount(0);
        // The queue is either grouped lists or one of the honest
        // notices — no database in this sandbox (503), or the
        // per-IP limiter tripped by a heavy suite run (429). Never
        // a JSON dump. Wait for one of the three states to settle
        // before asserting.
        const queueSection = page.locator("section", {
          has: page.getByRole("heading", { name: "Queue" }),
        });
        const noDbNotice = page.getByText(
          "Queue needs database setup on the server.",
        );
        const rateNotice = page.getByText(
          "Too many requests — try again in a minute.",
        );
        await expect(
          noDbNotice
            .or(rateNotice)
            .or(
              queueSection.getByRole("heading", { name: /Scheduled/ }),
            ),
        ).toBeVisible();
        const noDb = await noDbNotice.count();
        const limited = await rateNotice.count();
        if (noDb === 0 && limited === 0) {
          await expect(
            queueSection.getByRole("heading", { name: /Scheduled/ }),
          ).toBeVisible();
          await expect(
            queueSection.getByRole("heading", { name: /Drafts/ }),
          ).toBeVisible();
        } else if (noDb > 0) {
          await expect(noDbNotice).toBeVisible();
        } else {
          await expect(rateNotice).toBeVisible();
        }
      });

      test("pricing: plan cards, not text walls", async ({ page }) => {
        await page.goto("/pricing");
        await page.waitForLoadState("domcontentloaded");
        for (const plan of ["free plan", "pro plan", "agency plan"]) {
          await expect(page.getByLabel(plan)).toBeVisible();
        }
        await expect(
          page.getByRole("heading", { name: "Free — for now" }),
        ).toBeVisible();
      });
    });
  }
});
