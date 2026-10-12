import { authHeaders } from "./manager";
import type { Link } from "./sync-client";

export type DeviceInfo = { id: string; name: string; lastSeenAt: string | null; createdAt: string; isCurrent: boolean };

export async function listDevices(link: Link, fetchFn: typeof fetch = fetch): Promise<DeviceInfo[] | null> {
  try {
    const res = await fetchFn("/api/till/devices/list", { headers: authHeaders(link, true) });
    if (!res.ok) return null;
    const b = (await res.json().catch(() => null)) as { devices?: DeviceInfo[] } | null;
    return b?.devices ?? null;
  } catch {
    return null;
  }
}

export type RevokeDeviceOutcome = { ok: true } | { ok: false; reason: "manager_required" | "not_found" | "self" | "error" };

export async function revokeDevice(link: Link, deviceId: string, fetchFn: typeof fetch = fetch): Promise<RevokeDeviceOutcome> {
  try {
    const res = await fetchFn("/api/till/devices/revoke", {
      method: "POST",
      headers: authHeaders(link, true),
      body: JSON.stringify({ deviceId }),
    });
    if (res.ok) return { ok: true };
    if (res.status === 403) return { ok: false, reason: "manager_required" };
    if (res.status === 404) return { ok: false, reason: "not_found" };
    if (res.status === 400) return { ok: false, reason: "self" };
  } catch {
    /* network */
  }
  return { ok: false, reason: "error" };
}
