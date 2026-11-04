import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

/**
 * Phase 18 — CSP blob-fetch fix, proved end to end.
 *
 * The site's CSP connect-src does not list blob:, so the older
 * clip tool's fetch-back of its own rendered clip URL was refused
 * for ZIP export and post-panel sharing. Phase 18 keeps the
 * rendered bytes in state instead. This spec drives the real
 * tool with a real 2s fixture clip (ffmpeg-generated, committed
 * under e2e/fixtures): manual cut → browser render → ZIP
 * download → share-sheet post, while a fetch wrapper records
 * every blob: fetch attempt. No AI calls, no test accounts, no
 * secrets: the manual path needs no transcript or highlights.
 */

const INIT_SCRIPT = `
window.__blobFetchCalls = [];
const __origFetch = window.fetch.bind(window);
window.fetch = async (...args) => {
  const first = args[0];
  const url = typeof first === "string" ? first : first && first.url;
  if (typeof url === "string" && url.startsWith("blob:")) {
    window.__blobFetchCalls.push(url);
  }
  return __origFetch(...args);
};
window.__sharedFiles = [];
try {
  Object.defineProperty(navigator, "canShare", {
    value: () => true,
    configurable: true,
  });
  Object.defineProperty(navigator, "share", {
    value: async (data) => {
      for (const f of data.files ?? []) {
        window.__sharedFiles.push({
          name: f.name,
          type: f.type,
          size: f.size,
        });
      }
    },
    configurable: true,
  });
} catch {}
`;

async function renderOneClip(page: Page): Promise<void> {
  await page.goto("/create");
  await page
    .getByLabel("I own or have licensed this video and its music")
    .check();
  await page.locator('#upload-dropzone input[type="file"]').setInputFiles({
    name: "test-clip.mp4",
    mimeType: "video/mp4",
    buffer: readFileSync("e2e/fixtures/test-clip.mp4"),
  });
  // Duration > 0 unlocks the manual-cut section.
  await expect(page.getByText("2. Cut a clip by hand")).toBeVisible();
  await page.getByLabel("Start (seconds)").fill("0");
  await page.getByLabel("End (seconds)").fill("1");
  await page.getByRole("button", { name: "Add clip" }).click();
  await expect(page.getByText("3. Render vertical clips")).toBeVisible();
  // Center crop avoids on-device face detection entirely.
  await page.getByLabel("Crop").selectOption("center");
  await page.getByRole("button", { name: "Render clip" }).click();
}

test("tool ZIP export + post share use state bytes, never fetch(blob:)", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.addInitScript(INIT_SCRIPT);
  await renderOneClip(page);

  // Render finished: the per-clip download link appears.
  await expect(page.getByRole("link", { name: "Download clip" })).toBeVisible({
    timeout: 30_000,
  });

  // 1. ZIP export fires with the right name and real ZIP bytes.
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download all clips + captions (ZIP)" })
    .click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("clips.zip");
  const zipPath = await download.path();
  const zipBytes = readFileSync(zipPath as string);
  expect(zipBytes.subarray(0, 2).toString("ascii")).toBe("PK");
  expect(zipBytes.length).toBeGreaterThan(100);
  // Stored (uncompressed) entries keep their names readable.
  expect(/\.mp4|\.webm/.test(zipBytes.toString("latin1"))).toBe(true);

  // 2. Post-panel share receives the real blob, not a fetch-back.
  await page
    .getByRole("button", { name: "Post clip (share sheet)" })
    .click();
  await expect(
    page.getByText("Shared through your device's share sheet"),
  ).toBeVisible();
  const shared = (await page.evaluate(
    () => (window as unknown as { __sharedFiles: unknown }).__sharedFiles,
  )) as Array<{ name: string; type: string; size: number }>;
  expect(shared).toHaveLength(1);
  expect(shared[0].name).toMatch(/\.(mp4|webm)$/);
  expect(shared[0].size).toBeGreaterThan(0);

  // 3. No fetch(blob:) call happened anywhere in the flow.
  const blobFetches = (await page.evaluate(
    () =>
      (window as unknown as { __blobFetchCalls: unknown }).__blobFetchCalls,
  )) as string[];
  expect(blobFetches).toEqual([]);
});
