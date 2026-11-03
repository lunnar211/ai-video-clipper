"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type UserRow = {
  id: string;
  email: string;
  plan: string;
  role: string;
  status: string;
  publishing_paused: boolean;
  created_at: string;
};

/** Admin user list (ClipForge Phase 4). Status fields only. */
export default function AdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/users")
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as {
          users?: UserRow[];
          error?: string;
        };
        if (!res.ok) {
          setMessage(data.error ?? "Users could not be loaded.");
          return;
        }
        setUsers(data.users ?? []);
      })
      .catch(() => setMessage("Users could not be loaded."));
  }, []);

  return (
    <main>
      <h1 className="text-xl font-bold text-foreground">Users</h1>
      {message && (
        <p className="mt-4 rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          {message}
        </p>
      )}
      <ul className="mt-4 space-y-2">
        {users.map((u) => (
          <li key={u.id} className="rounded border border-border p-3 text-sm">
            <Link href={`/admin/users/${u.id}`} className="font-semibold text-primary underline">
              {u.email}
            </Link>{" "}
            · {u.plan} · {u.role} · {u.status}
            {u.publishing_paused ? " · publishing paused" : ""}
          </li>
        ))}
        {users.length === 0 && !message && (
          <li className="text-sm text-muted-foreground">No users yet.</li>
        )}
      </ul>
    </main>
  );
}
