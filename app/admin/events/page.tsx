"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live admin event feed (ClipForge Phase 4). Streams recent audit
 * entries over server-sent events. The feed is a snapshot of
 * already-recorded rows (new entries appear on the next connection),
 * closes after the configured stream lifetime, and reconnects only
 * when the admin reloads — it never invents events.
 */
export default function AdminEvents() {
  const [frames, setFrames] = useState<string[]>([]);
  const [status, setStatus] = useState("Connecting…");
  const sourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const source = new EventSource("/api/admin/events");
    sourceRef.current = source;
    source.onopen = () => setStatus("Connected — showing recent audit entries.");
    source.onmessage = (e) => {
      setFrames((prev) => [...prev, e.data].slice(-100));
    };
    source.onerror = () => {
      setStatus("Feed closed or unavailable. Reload to reconnect.");
    };
    return () => source.close();
  }, []);

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight text-foreground">Live event feed</h1>
      <p className="mt-2 text-sm text-muted-foreground">{status}</p>
      <ul className="mt-4 space-y-2">
        {frames.map((f, i) => (
          <li key={i} className="rounded border border-border p-3 text-sm">
            <pre className="overflow-auto text-xs text-muted-foreground">{f}</pre>
          </li>
        ))}
        {frames.length === 0 && (
          <li className="text-sm text-muted-foreground">
            No events yet — entries appear here as they are recorded.
          </li>
        )}
      </ul>
    </div>
  );
}
