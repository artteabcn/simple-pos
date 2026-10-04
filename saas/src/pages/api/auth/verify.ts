import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { z } from "zod";
import { BodyError, json, readJson } from "../../../lib/api";
import { liveClock, makeDb } from "../../../lib/db";
import { redeemLoginLink } from "../../../lib/db/login";

export const prerender = false;

const Schema = z.object({ token: z.string().min(10).max(100), deviceName: z.string().max(60).optional() });

/** The sign-in page trades the emailed token for this device's own key (shown once). */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: unknown;
  try {
    body = await readJson(request, 2_000);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = Schema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid_or_expired" }, 400);
  const r = await redeemLoginLink(makeDb(env.DB), parsed.data.token, parsed.data.deviceName ?? "Signed-in device", liveClock());
  return r ? json(r) : json({ error: "invalid_or_expired" }, 400);
};
