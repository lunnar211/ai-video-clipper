import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * Phase 19 — parity slice 2 specs.
 *
 * Script rewrite (original + rewrite side by side, pickable),
 * multi-language script requests, subtitle style controls that
 * change the rendered short's caption line, real 16:9 + 1:1
 * output sizes (asserted on the preview video's own dimensions,
 * not on a label alone), and generation history that lists and
 * reopens a render. All AI + visual responses are intercepted —
 * no real AI calls, no test accounts, no secrets. Renders are
 * REAL: the spec records a tiny animated-canvas video in the
 * page and serves it as the "verified visual", exactly like the
 * Phase 17 specs.
 */

const SCRIPT_BODY = {
  title: "Morning Routines",
  hashtags: ["#morning"],
  segments: [
    { text: "Start your day with water.", visualKeyword: "glass of water" },
    { text: "Stretch for two minutes.", visualKeyword: "morning stretch" },
  ],
  provider: "groq",
  language: "en",
};

const REWRITE_BODY = {
  title: "Mornings, Reworded",
  hashtags: ["#morning"],
  segments: [
    {
      text: "Begin the morning by drinking water.",
      visualKeyword: "drinking water",
    },
    {
      text: "Spend two minutes stretching.",
      visualKeyword: "stretching routine",
    },
  ],
  provider: "groq",
  language: "en",
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

async function makeTestVideoUrl(page: Page): Promise<string> {
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

async function generateScriptOnly(page: Page) {
  await page.route("**/api/generate/script", async (route: Route) => {
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
}

async function attachVisualsAndFind(page: Page, videoUrl: string) {
  await page.route("**/api/generate/visuals", async (route: Route) => {
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
}

async function previewSize(page: Page): Promise<{ w: number; h: number }> {
  await page.waitForFunction(() => {
    const v = document.querySelector("video") as HTMLVideoElement | null;
    return !!v && v.videoWidth > 0;
  });
  return page.locator("video").evaluate((v: HTMLVideoElement) => ({
    w: v.videoWidth,
    h: v.videoHeight,
  }));
}

test("rewrite keeps both versions and the pick switches segments", async ({
  page,
}) => {
  await page.route("**/api/generate/script", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SCRIPT_BODY),
    });
  });
  await page.route("**/api/generate/rewrite", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(REWRITE_BODY),
    });
  });
  await page.goto("/generate");
  await page.getByLabel("Topic").fill("morning routines");
  await page.getByRole("button", { name: "Generate script" }).click();
  await expect(page.getByText("Script versions")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Rewrite script" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Rewrite script" }).click();
  await expect(page.getByText("Mornings, Reworded").first()).toBeVisible();
  await expect(
    page.getByText("Begin the morning by drinking water."),
  ).toBeVisible();
  // The original is still there, pickable.
  await expect(
    page.getByRole("button", { name: "Use original version" }),
  ).toBeVisible();
  // A fresh rewrite is already active, so its caption is live now.
  await expect(page.locator("#generate-caption-0")).toHaveValue(
    "Begin the morning by drinking water.",
  );

  await page.getByRole("button", { name: "Use original version" }).click();
  await expect(page.locator("#generate-caption-0")).toHaveValue(
    "Start your day with water.",
  );
  await page
    .getByRole("button", { name: "Use rewritten version" })
    .click();
  await expect(page.locator("#generate-caption-0")).toHaveValue(
    "Begin the morning by drinking water.",
  );
});

test("rewrite 503 degrades to the honest not-connected message", async ({
  page,
}) => {
  await page.route("**/api/generate/script", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(SCRIPT_BODY),
    });
  });
  await page.route("**/api/generate/rewrite", async (route) => {
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
  await page.getByRole("button", { name: "Rewrite script" }).click();
  await expect(page.getByText("AI is not connected yet")).toBeVisible();
});

test("language picker sends the chosen language to the script route", async ({
  page,
}) => {
  let sentLanguage = "";
  await page.route("**/api/generate/script", async (route) => {
    try {
      const body = (await route.request().postDataJSON()) as {
        language?: string;
      };
      sentLanguage = body.language ?? "";
    } catch {
      // No JSON body — the assertion below will fail honestly.
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ...SCRIPT_BODY, language: "es" }),
    });
  });
  await page.goto("/generate");
  await page.getByLabel("Script language").selectOption("es");
  await page.getByLabel("Topic").fill("morning routines");
  await page.getByRole("button", { name: "Generate script" }).click();
  await expect(page.getByText("Segment 1")).toBeVisible();
  expect(sentLanguage).toBe("es");
});

test("subtitle controls + 16:9 change the rendered short", async ({
  page,
}) => {
  await generateScriptOnly(page);
  const videoUrl = await makeTestVideoUrl(page);
  await attachVisualsAndFind(page, videoUrl);

  await page.getByRole("button", { name: "Wide 16:9" }).click();
  await page.getByLabel("Subtitle font").selectOption("Georgia, serif");
  await page.getByLabel("Subtitle position").selectOption("top");
  await page
    .getByRole("button", { name: "Subtitle color Yellow" })
    .click();
  await page.getByLabel("Subtitle size").evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    setter.call(input, "54");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(page.getByText("Size: 54px")).toBeVisible();

  await page.getByRole("button", { name: "Render short" }).click();
  await expect(
    page.getByRole("heading", { name: "Your generated short" }),
  ).toBeVisible();
  await expect(
    page.getByText("Rendered in Wide 16:9 (1280×720)."),
  ).toBeVisible();
  await expect(
    page.getByText("Captions: Serif, top, Yellow, 54px, Dark box."),
  ).toBeVisible();
  expect(await previewSize(page)).toEqual({ w: 1280, h: 720 });
});

test("1:1 renders a square short", async ({ page }) => {
  await generateScriptOnly(page);
  const videoUrl = await makeTestVideoUrl(page);
  await attachVisualsAndFind(page, videoUrl);

  await page.getByRole("button", { name: "Square 1:1" }).click();
  await page.getByRole("button", { name: "Render short" }).click();
  await expect(
    page.getByRole("heading", { name: "Your generated short" }),
  ).toBeVisible();
  await expect(
    page.getByText("Rendered in Square 1:1 (720×720)."),
  ).toBeVisible();
  expect(await previewSize(page)).toEqual({ w: 720, h: 720 });
});

test("history lists a render and reopens it", async ({ page }) => {
  await generateScriptOnly(page);
  const videoUrl = await makeTestVideoUrl(page);
  await attachVisualsAndFind(page, videoUrl);

  await page.getByRole("button", { name: "Render short" }).click();
  await expect(
    page.getByRole("heading", { name: "Your generated short" }),
  ).toBeVisible();
  await expect(page.getByText("Generation history")).toBeVisible();
  const historySection = page
    .locator("section")
    .filter({ hasText: "Generation history" });
  await expect(
    historySection.getByText("Morning Routines"),
  ).toBeVisible();
  await expect(
    historySection.getByText(/Ocean waves \(CC-BY\)/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Reopen" }).first().click();
  await expect(page.getByLabel("Topic")).toHaveValue("morning routines");
  await expect(page.locator("#generate-caption-0")).toHaveValue(
    "Start your day with water.",
  );
  await expect(page.getByText("Selected visual:").first()).toBeVisible();
});
