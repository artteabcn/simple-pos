import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { json, requireDevice } from "../../../../lib/api";
import { liveClock } from "../../../../lib/db";
import { listDevices } from "../../../../lib/db/devices";
import { isManager } from "../../../../lib/db/pin";

export const prerender = false;

/** Lists this shop's active devices so the owner can spot and revoke a lost phone. Manager only (once a PIN exists). */
export const GET: APIRoute = async ({ request }): Promise<Response> => {
  const who = await requireDevice(request, env);
  if (who instanceof Response) return who;

  const clock = liveClock();
  const { shop, device } = who.auth;
  if (shop.pinHash) {
    const unlocked = await isManager(who.db, device, request.headers.get("x-manager-token"), clock.now);
    if (!unlocked) return json({ error: "manager_required" }, 403);
  }

  const rows = await listDevices(who.db, shop.id);
  return json({
    devices: rows.map((d) => ({ id: d.id, name: d.name, lastSeenAt: d.lastSeenAt, createdAt: d.createdAt, isCurrent: d.id === device.id })),
  });
};
