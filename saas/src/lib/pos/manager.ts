import { useSyncExternalStore } from "react";
import type { Link } from "./sync-client";

const KEY = "spos:v1:mgr";

export type Manager = { token: string; expiresAt: string };

/** The proof that the manager PIN was entered lives in the tab only (sessionStorage), never on disk for long. */
function read(): Manager | null {
  try {
    const m = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as Manager | null;
    return m && typeof m.token === "string" && Date.parse(m.expiresAt) > Date.now() ? m : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
let timer: number | undefined;
let current: Manager | null = null;
let loaded = false;

function publish(): void {
  listeners.forEach((l) => l());
}

function schedule(m: Manager | null): void {
  window.clearTimeout(timer);
  if (m) timer = window.setTimeout(() => setManager(null), Math.max(0, Date.parse(m.expiresAt) - Date.now()) + 50);
}

export function getManager(): Manager | null {
  if (!loaded) {
    loaded = true;
    current = read();
    schedule(current);
  }
  if (current && Date.parse(current.expiresAt) <= Date.now()) current = null;
  return current;
}

export function setManager(m: Manager | null): void {
  loaded = true;
  current = m;
  try {
    if (m) sessionStorage.setItem(KEY, JSON.stringify(m));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the proof then lives in memory only */
  }
  schedule(m);
  publish();
}

export function useManager(): Manager | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getManager,
    () => null,
  );
}

export type UnlockOutcome =
  | { ok: true }
  | { ok: false; reason: "wrong"; attemptsLeft: number }
  | { ok: false; reason: "locked"; retryAfterSec: number }
  | { ok: false; reason: "error" };

const authHeaders = (link: Link, withManager = false): Record<string, string> => ({
  Authorization: `Bearer ${link.token}`,
  "Content-Type": "application/json",
  ...(withManager && getManager() ? { "X-Manager-Token": getManager()!.token } : {}),
});

export async function unlockManager(link: Link, pin: string, fetchFn: typeof fetch = fetch): Promise<UnlockOutcome> {
  try {
    const res = await fetchFn("/api/till/pin/unlock", { method: "POST", headers: authHeaders(link), body: JSON.stringify({ pin }) });
    const b = (await res.json().catch(() => ({}))) as { token?: string; expiresAt?: string; attemptsLeft?: number; retryAfterSec?: number };
    if (res.ok && b.token && b.expiresAt) {
      setManager({ token: b.token, expiresAt: b.expiresAt });
      return { ok: true };
    }
    if (res.status === 429) return { ok: false, reason: "locked", retryAfterSec: b.retryAfterSec ?? 900 };
    if (res.status === 401) return { ok: false, reason: "wrong", attemptsLeft: b.attemptsLeft ?? 0 };
  } catch {
    /* network */
  }
  return { ok: false, reason: "error" };
}

export type SavePinOutcome = { ok: true } | { ok: false; reason: "invalid" | "forbidden" | "locked" | "error" };

export async function savePin(link: Link, pin: string, fetchFn: typeof fetch = fetch): Promise<SavePinOutcome> {
  try {
    const res = await fetchFn("/api/till/pin/set", { method: "POST", headers: authHeaders(link, true), body: JSON.stringify({ pin }) });
    if (res.ok) return { ok: true };
    if (res.status === 400) return { ok: false, reason: "invalid" };
    if (res.status === 403) return { ok: false, reason: "forbidden" };
    if (res.status === 429) return { ok: false, reason: "locked" };
  } catch {
    /* network */
  }
  return { ok: false, reason: "error" };
}
