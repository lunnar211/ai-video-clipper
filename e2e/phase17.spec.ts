import { expect, test } from "@playwright/test";

/**
 * Phase 17 — AI Generate Short specs.
 *
 * Topic in, original short out, no link anywhere: script from a
 * topic, licence-verified Commons visuals per segment, a browser
 * composer render, the same exports + post panel as the tool. All
 * AI + visual responses are intercepted — no real AI calls, no
 * test accounts, no secrets. The render itself is REAL: the spec
 * records a tiny animated-canvas video in the page and serves it
 * as the "verified visual", so the composer, export, and post
 * panel are exercised end to end without a real stock video.
 */

const SCRIPT_BODY = {
  title: "Morning Routines",
  hashtags: ["#morning"],
  segments: [
    { text: "Start your day with water.", visualKeyword: "glass of water" },
    { text: "Stretch for two minutes.", visualKeyword: "morning stretch" },
  ],
  provider: "groq",
};

function visualsBody(fileUrl: string) {
  return {
    visuals: [
      {
        title: "Ocean waves",
        author: "Some Author",
        license: "CC-BY",
        sourceUrl: "https://commons.wikimedia.org/wiki/File:Ocean_waves",
        attribution:
          '"Ocean waves" by Some Author is licensed under CC-BY. Source: https://commons.wikimedia.org/wiki/File:Ocean_waves',
        fileUrl,
        fileName: "Ocean waves.webm",
      },
    ],
    note: null,
  };
}

async function makeTestVideoUrl(page: {
  evaluate: (fn: () => Promise<string>) => Promise<string>;
}): Promise<string> {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    let frame = 0;
    const painter = window.setInterval(() => {
      ctx.fillStyle = frame % 2 === 0 ? "red" : "blue";
      ctx.fillRect(0, 0, 64, 64);
      frame += 1;
    }, 100);
    const stream = canvas.captureStream(30);
    const rec = new MediaRecorder(stream, { videoBitsPerSecond: 100_000 });
    const chunks: BlobPart[] = [];
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    const done = new Promise<void>((resolve) => {
      rec.onstop = () => resolve();
    });
    rec.start();
    await new Promise((r) => window.setTimeout(r, 900));
    rec.stop();
    window.clearInterval(painter);
    await done;
    return URL.createObjectURL(
      new Blob(chunks, { type: rec.mimeType || "video/webm" }),
    );
  });
}

test("nav bar shows AI Video Generation linking to /generate", async ({
  page,
}) => {
  await page.goto("/");
  const link = page.getByRole("link", { name: "AI Video Generation" });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", "/generate");
  await link.click();
  await expect(page).toHaveURL(/\/generate$/);
});

test("/generate renders signed out with no redirect", async ({ page }) => {
  await page.goto("/generate");
  await expect(page).toHaveURL(/\/generate$/);
  await expect(page.getByLabel("Topic")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate script" }),
  ).toBeVisible();
});

test("/create and homepage link to /generate", async ({ page }) => {
  await page.goto("/create");
  await expect(
    page.getByRole("link", { name: "Generate one from a topic" }),
  ).toBeVisible();
  await page.goto("/");
  await expect(
    page.getByRole("link", {
      name: "Or generate a short from a topic — no video needed",
    }),
  ).toBeVisible();
});

test("topic to rendered short with exports, attribution, and post panel", async ({
  page,
}) => {
  await page.route("**/api/generate/script", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SCRIPT_BODY),
    });
  });
  await page.goto("/generate");
  await page.getByLabel("Topic").fill("morning routines");
  await page.getByRole("button", { name: "Generate script" }).click();
  await expect(page.getByText("Segment 1")).toBeVisible();
  await expect(page.getByText("Segment 2")).toBeVisible();

  const videoUrl = await makeTestVideoUrl(page);
  await page.route("**/api/generate/visuals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(visualsBody(videoUrl)),
    });
  });
  await page
    .getByRole("button", { name: "Find visuals for all segments" })
    .click();
  await expect(page.getByText("Selected visual:").first()).toBeVisible();

  await page.getByRole("button", { name: "Render short" }).click();
  await expect(
    page.getByRole("heading", { name: "Your generated short" }),
  ).toBeVisible();
  await expect(page.locator("video")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download SRT" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Download VTT" }),
  ).toBeVisible();
  await expect(
    page.locator("#rights-panel").getByText(/Ocean waves.*CC-BY/),
  ).toBeVisible();
  await expect(
    page.getByText("Post clip — without connecting"),
  ).toBeVisible();
  await expect(
    page.getByText("Before you export — rights check"),
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download ZIP" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("generated-short.zip");
});

test("guest cap refuses a fourth render honestly", async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date();
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    window.localStorage.setItem(
      "clipper-usage",
      JSON.stringify({ [key]: 3 }),
    );
  });
  await page.route("**/api/generate/script", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SCRIPT_BODY),
    });
  });
  await page.route("**/api/generate/visuals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(visualsBody("https://example.test/clip.webm")),
    });
  });
  await page.goto("/generate");
  await page.getByLabel("Topic").fill("morning routines");
  await page.getByRole("button", { name: "Generate script" }).click();
  await expect(page.getByText("Segment 1")).toBeVisible();
  await expect(page.getByText("Free renders used today: 3 of 3.")).toBeVisible();
  await page
    .getByRole("button", { name: "Find visuals for all segments" })
    .click();
  await expect(page.getByText("Selected visual:").first()).toBeVisible();
  await page.getByRole("button", { name: "Render short" }).click();
  await expect(
    page.getByText("Daily free render limit reached"),
  ).toBeVisible();
});

test("voiceover 503 degrades to a notice and rendering continues", async ({
  page,
}) => {
  await page.route("**/api/generate/script", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SCRIPT_BODY),
    });
  });
  await page.route("**/api/clips/voiceover", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "AI is not connected yet" }),
    });
  });
  await page.goto("/generate");
  await page.getByLabel("Topic").fill("morning routines");
  await page.getByRole("button", { name: "Generate script" }).click();
  await expect(page.getByText("Segment 1")).toBeVisible();
  const videoUrl = await makeTestVideoUrl(page);
  await page.route("**/api/generate/visuals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(visualsBody(videoUrl)),
    });
  });
  await page
    .getByRole("button", { name: "Find visuals for all segments" })
    .click();
  await expect(page.getByText("Selected visual:").first()).toBeVisible();
  await page
    .getByLabel("Voiceover narration (when a voice key is connected)")
    .check();
  await page.getByRole("button", { name: "Render short" }).click();
  await expect(
    page.getByText("Voiceover is not connected yet"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Your generated short" }),
  ).toBeVisible();
});

test("unmatched keyword shows the honest empty message", async ({
  page,
}) => {
  await page.route("**/api/generate/script", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SCRIPT_BODY),
    });
  });
  await page.route("**/api/generate/visuals", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        visuals: [],
        note: 'No free-licence video was found on Wikimedia Commons for "zzzz" — try another keyword, or upload your own footage for this segment.',
      }),
    });
  });
  await page.goto("/generate");
  await page.getByLabel("Topic").fill("morning routines");
  await page.getByRole("button", { name: "Generate script" }).click();
  await expect(page.getByText("Segment 1")).toBeVisible();
  await page
    .getByRole("button", { name: "Find visuals for all segments" })
    .click();
  await expect(
    page.getByText(/No free-licence video was found/).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Render short" }),
  ).toBeDisabled();
});
