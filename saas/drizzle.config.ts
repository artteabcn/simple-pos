import { defineConfig } from "drizzle-kit";

// `npm run db:generate` writes SQL into ./migrations; Cloudflare applies it with
// `wrangler d1 migrations apply DB` (--local for development, --remote for production).
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/db/schema.ts",
  out: "./migrations",
});
