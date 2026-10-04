import { z } from "zod";

/** Addresses that would clash with pages or look official. */
export const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "assets", "billing", "blog", "dashboard", "help", "login", "logout", "mail", "pay",
  "pricing", "root", "settings", "shop", "shops", "signup", "start", "static", "status", "support", "welcome", "www",
  "en", "th", "fr", "de",
]);

/** New shops: lower-case letters, numbers and hyphens, 3-40 characters. */
export const NewSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9](?:[a-z0-9-]{1,38})[a-z0-9]$/)
  .refine((s) => !RESERVED_SLUGS.has(s) && !s.includes("--"));

export const SignupInputSchema = z.object({
  shopName: z.string().trim().min(1).max(80),
  slug: NewSlugSchema,
  email: z.string().trim().toLowerCase().max(120).pipe(z.email()),
  customisation: z.boolean().default(false),
  locale: z.enum(["en", "th", "fr", "de"]).default("en"),
});
export type SignupInput = z.infer<typeof SignupInputSchema>;

/** Suggests a web address from a shop name; falls back to a neutral word for non-Latin names. */
export function suggestSlug(name: string): string {
  const base = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/, "");
  return base.length >= 3 ? base : "";
}
