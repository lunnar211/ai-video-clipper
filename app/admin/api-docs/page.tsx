"use client";

import { useEffect, useState } from "react";

/**
 * API docs page (ClipForge Phase 5). Renders the live OpenAPI spec
 * from /api/v1/openapi: paths, scopes, and auth. The spec is the
 * documentation — if an endpoint is not in the spec, it is not
 * public.
 */
export default function AdminApiDocs() {
  const [spec, setSpec] = useState<{
    info?: { title?: string; version?: string; description?: string };
    paths?: Record<string, Record<string, { summary?: string }>>;
  } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/v1/openapi")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setMessage("API docs could not be loaded.");
          return;
        }
        setSpec(data);
      })
      .catch(() => setMessage("API docs could not be loaded."));
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">API docs</h1>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      {spec && (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            {spec.info?.title} v{spec.info?.version} —{" "}
            {spec.info?.description}
          </p>
          <p className="mt-2 text-sm">
            Authenticate with X-ClipForge-Key or Authorization: Bearer
            (key created on the API keys page). Default limit: 120
            requests/minute per key.
          </p>
          <ul className="mt-4 space-y-3">
            {Object.entries(spec.paths ?? {}).map(([path, methods]) => (
              <li key={path} className="rounded border border-border p-4">
                <p className="font-mono text-sm font-semibold">
                  GET /api/v1{path}
                </p>
                <p className="text-sm text-muted-foreground">
                  {Object.values(methods)[0]?.summary ?? ""}
                </p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            Write endpoints (clip creation, rendering, publishing) are
            deliberately absent from v1: those operations carry
            rights-gate, quota, and cost side effects the console UI
            enforces interactively. See docs/PHASE5.md.
          </p>
        </>
      )}
    </div>
  );
}
