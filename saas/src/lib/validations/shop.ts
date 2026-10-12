import { z } from "zod";

/** Shop address on the web: letters, numbers and hyphens only (used in URLs and database keys). */
export const SlugSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9-]{1,63}$/);

/** Only absolute http(s) or site-relative image URLs are accepted for logos. */
export const LogoUrlSchema = z
  .string()
  .regex(/^(https?:\/\/|\/)[^\s"'<>`\\]*$/)
  .or(z.literal(""));

export const VatModeSchema = z.enum(["inclusive", "exclusive", "none"]);

export const MenuItemSchema = z.object({
  id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
  nameEN: z.string().max(120),
  nameTH: z.string().max(120),
  price: z.number().min(0).max(1_000_000),
  category: z.string().max(60).optional(),
});

export const ShopProfileSchema = z.object({
  name: z.string().min(1).max(80),
  taxId: z.string().max(40).default(""),
  tel: z.string().max(40).default(""),
  address: z.string().max(160).default(""),
  currency: z.string().min(1).max(4).default("฿"),
  logo: LogoUrlSchema.default(""),
  promptpay: z.string().regex(/^\d{0,13}$/).default(""),
  vatMode: VatModeSchema.default("inclusive"),
});

export type ShopProfile = z.infer<typeof ShopProfileSchema>;
export type MenuItem = z.infer<typeof MenuItemSchema>;
