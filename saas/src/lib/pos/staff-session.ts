import { useSyncExternalStore } from "react";
import { authHeaders } from "./manager";
import type { Link } from "./sync-client";

const KEY = "spos:v1:staff";

export type StaffSession = { token: string; expiresAt: string; staffId: string; staffName: string };

/** Who is currently signed in to sell on this device, if anyone. Lives in the tab only (sessionStorage). */
function read(): StaffSession | null {
  try {
    const s = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as StaffSession | null;
    return s && typeof s.token === "string" && Date.parse(s.expiresAt) > Date.now() ? s : null;
  } catch {
    return null;
  }
}

const listeners = new Set<() => void>();
let timer: number | undefined;
let current: StaffSession | null = null;
let loaded = false;

function publish(): void {
  listeners.forEach((l) => l());
}

function schedule(s: StaffSession | null): void {
  window.clearTimeout(timer);
  if (s) timer = window.setTimeout(() => setStaffSession(null), Math.max(0, Date.parse(s.expiresAt) - Date.now()) + 50);
}

export function getStaffSession(): StaffSession | null {
  if (!loaded) {
    loaded = true;
    current = read();
    schedule(current);
  }
  if (current && Date.parse(current.expiresAt) <= Date.now()) current = null;
  return current;
}

export function setStaffSession(s: StaffSession | null): void {
  loaded = true;
  current = s;
  try {
    if (s) sessionStorage.setItem(KEY, JSON.stringify(s));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the session then lives in memory only */
  }
  schedule(s);
  publish();
}

export function useStaffSession(): StaffSession | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getStaffSession,
    () => null,
  );
}

export type StaffUnlockOutcome = { ok: true } | { ok: false; reason: "wrong" | "locked"; retryAfterSec?: number } | { ok: false; reason: "error" };

/** "Who's selling?" — checks a PIN against every staff member of the shop; the PIN alone says who it is. */
export async function unlockStaff(link: Link, pin: string, fetchFn: typeof fetch = fetch): Promise<StaffUnlockOutcome> {
  try {
    const res = await fetchFn("/api/till/staff/unlock", { method: "POST", headers: authHeaders(link), body: JSON.stringify({ pin }) });
    const b = (await res.json().catch(() => ({}))) as { token?: string; expiresAt?: string; staffId?: string; staffName?: string; retryAfterSec?: number };
    if (res.ok && b.token && b.expiresAt && b.staffId && b.staffName) {
      setStaffSession({ token: b.token, expiresAt: b.expiresAt, staffId: b.staffId, staffName: b.staffName });
      return { ok: true };
    }
    if (res.status === 429) return { ok: false, reason: "locked", retryAfterSec: b.retryAfterSec ?? 900 };
    if (res.status === 401) return { ok: false, reason: "wrong" };
  } catch {
    /* network */
  }
  return { ok: false, reason: "error" };
}
