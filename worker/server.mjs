/**
 * ClipForge ffmpeg worker skeleton (Phase 1).
 *
 * Minimal HTTP server: POST /jobs accepts a signed RenderJobRequest
 * (see lib/server-render/contract.ts), verifies the HMAC-SHA256
 * signature in X-ClipForge-Signature, and queues the job. GET
 * /jobs/:id returns status. The actual ffmpeg invocation is the next
 * slice: this skeleton proves the contract (auth + shape + status)
 * without pretending renders complete.
 *
 * Run with: WORKER_AUTH_SECRET=... node server.mjs
 * (Dockerfile in this directory installs ffmpeg for the real runner.)
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 8080);
const SECRET = process.env.WORKER_AUTH_SECRET ?? "";

const jobs = new Map();

function sign(body) {
  return createHmac("sha256", SECRET).update(body).digest("hex");
}

function verify(body, signature) {
  if (!SECRET || !signature) return false;
  const expected = Buffer.from(sign(body), "utf8");
  const actual = Buffer.from(signature, "utf8");
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST" && req.url === "/jobs") {
      const body = await readBody(req);
      if (!verify(body, req.headers["x-clipforge-signature"])) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Bad signature" }));
        return;
      }
      const job = JSON.parse(body);
      jobs.set(job.jobId, { ...job, status: "queued", progress: 0 });
      res.writeHead(202, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jobId: job.jobId,
          status: "queued",
          note: "Worker skeleton: job accepted and signature verified. ffmpeg execution lands in the next worker slice.",
        }),
      );
      return;
    }
    const match = req.url?.match(/^\/jobs\/([A-Za-z0-9-]+)$/);
    if (req.method === "GET" && match) {
      const job = jobs.get(match[1]);
      if (!job) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Job not found" }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jobId: job.jobId,
          status: job.status,
          progress: job.progress,
        }),
      );
      return;
    }
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message ?? "Bad request" }));
  }
});

server.listen(PORT, () => {
  console.log(`clipforge worker skeleton listening on :${PORT}`);
});
