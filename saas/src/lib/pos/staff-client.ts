import { authHeaders } from "./manager";
import type { Link } from "./sync-client";

export type StaffInfo = { id: string; name: string };

export async function listStaff(link: Link, fetchFn: typeof fetch = fetch): Promise<StaffInfo[] | null> {
  try {
    const res = await fetchFn("/api/till/staff/list", { headers: authHeaders(link, true) });
    if (!res.ok) return null;
    const b = (await res.json().catch(() => null)) as { staff?: StaffInfo[] } | null;
    return b?.staff ?? null;
  } catch {
    return null;
  }
}

export type StaffWriteOutcome = { ok: true } | { ok: false; reason: "invalid" | "duplicate" | "limit" | "manager_required" | "not_found" | "error" };

async function post(path: string, link: Link, body: unknown, fetchFn: typeof fetch): Promise<StaffWriteOutcome> {
  try {
    const res = await fetchFn(path, { method: "POST", headers: authHeaders(link, true), body: JSON.stringify(body) });
    if (res.ok) return { ok: true };
    if (res.status === 403) return { ok: false, reason: "manager_required" };
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (res.status === 409) return { ok: false, reason: "limit" };
    const b = (await res.json().catch(() => ({}))) as { error?: string };
    if (b.error === "duplicate" || b.error === "invalid") return { ok: false, reason: b.error };
  } catch {
    /* network */
  }
  return { ok: false, reason: "error" };
}

export const createStaff = (link: Link, name: string, pin: string, fetchFn: typeof fetch = fetch): Promise<StaffWriteOutcome> =>
  post("/api/till/staff/create", link, { name, pin }, fetchFn);

export const renameStaff = (link: Link, staffId: string, name: string, fetchFn: typeof fetch = fetch): Promise<StaffWriteOutcome> =>
  post("/api/till/staff/rename", link, { staffId, name }, fetchFn);

export const setStaffPin = (link: Link, staffId: string, pin: string, fetchFn: typeof fetch = fetch): Promise<StaffWriteOutcome> =>
  post("/api/till/staff/pin", link, { staffId, pin }, fetchFn);

export const deactivateStaff = (link: Link, staffId: string, fetchFn: typeof fetch = fetch): Promise<StaffWriteOutcome> =>
  post("/api/till/staff/deactivate", link, { staffId }, fetchFn);
