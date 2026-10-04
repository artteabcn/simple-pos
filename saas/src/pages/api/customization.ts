import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { BodyError, json, readJson } from "../../lib/api";
import { liveClock, makeDb } from "../../lib/db";
import { createRequest } from "../../lib/db/requests";
import { requestConfirmMail, sendMail, teamMail } from "../../lib/email";
import { DEFAULT_TEAM_EMAIL, LINE_URL } from "../../lib/site";
import { CustomizationSchema } from "../../lib/validations/customization";

export const prerender = false;

/**
 * The customisation request form. Saves the request, tells the team (reply goes straight to the
 * customer) and sends the customer a confirmation with our LINE link.
 */
export const POST: APIRoute = async ({ request }): Promise<Response> => {
  let body: unknown;
  try {
    body = await readJson(request, 8_000);
  } catch (e) {
    return json({ error: "bad_request" }, e instanceof BodyError ? e.status : 400);
  }
  const parsed = CustomizationSchema.safeParse(body);
  if (!parsed.success) return json({ error: "invalid", fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0] ?? "")))] }, 400);
  const input = parsed.data;

  // The hidden "website" box is filled only by bots: look successful, save nothing, send nothing.
  if (input.website) return json({ ok: true });

  const created = await createRequest(makeDb(env.DB), input, liveClock());
  if (!created.ok) return json({ error: "rate_limited" }, 429);

  const NEEDS: Record<string, string> = {
    menu: "Set up my menu", receipt: "Logo and receipt look", languages: "Languages and wording",
    import: "Move items from a spreadsheet or old system", training: "Show my staff how to use it", other: "Something else",
  };
  await sendMail(
    env,
    teamMail(env.TEAM_EMAIL || DEFAULT_TEAM_EMAIL, `Customisation request: ${input.shopName || input.name}`, [
      ["Name", input.name],
      ["Shop", created.shopName],
      ["Email", input.email],
      ["Phone / LINE", input.contact],
      ["Needs", input.needs.map((n) => NEEDS[n] ?? n).join(", ")],
      ["Details", input.details],
      ["Paying customer", created.hasShop ? "yes (email matches a shop)" : "not (yet) a customer"],
      ["Language", input.locale],
    ], input.email),
  );
  await sendMail(env, requestConfirmMail(input.email, input.locale, LINE_URL));
  return json({ ok: true });
};
