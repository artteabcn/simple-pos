// Used by the deploy workflow (and runnable by hand): fills wrangler.jsonc with the things that are only
// known at deploy time (the D1 database id, the public domain, the email sender) and writes plain JSON back.
//   DB_ID=... DOMAIN=pos.example.com node scripts/configure-wrangler.mjs
import { readFileSync, writeFileSync } from "node:fs";

export function configure(text, { dbId, domain, emailFrom, replyTo, teamEmail }) {
  // wrangler.jsonc only has whole-line comments; drop them and read the rest as JSON
  const config = JSON.parse(text.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"));
  if (dbId) config.d1_databases[0].database_id = dbId;
  if (domain) {
    config.routes = [{ pattern: domain, custom_domain: true }];
    config.vars = { ...config.vars, PUBLIC_SITE_URL: `https://${domain}` };
  }
  if (emailFrom) config.vars = { ...config.vars, EMAIL_FROM: emailFrom };
  if (replyTo) config.vars = { ...config.vars, EMAIL_REPLY_TO: replyTo };
  if (teamEmail) config.vars = { ...config.vars, TEAM_EMAIL: teamEmail };
  return config;
}

if ((process.argv[1] ?? "").endsWith("configure-wrangler.mjs")) {
  const file = "wrangler.jsonc";
  const out = configure(readFileSync(file, "utf8"), {
    dbId: process.env.DB_ID,
    domain: process.env.DOMAIN,
    emailFrom: process.env.EMAIL_FROM,
    replyTo: process.env.EMAIL_REPLY_TO,
    teamEmail: process.env.TEAM_EMAIL,
  });
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n");
  console.log("wrangler.jsonc updated:", JSON.stringify({ db: out.d1_databases[0].database_id ?? "(auto)", routes: out.routes, vars: Object.keys(out.vars ?? {}) }));
}
