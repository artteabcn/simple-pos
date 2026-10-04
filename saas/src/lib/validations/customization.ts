import { z } from "zod";

export const NEED_KEYS = ["menu", "receipt", "languages", "import", "training", "other"] as const;
export type NeedKey = (typeof NEED_KEYS)[number];

/**
 * The customisation request form. `website` is a hidden field that people never see or fill in:
 * if it has text, a bot filled the form, and we pretend it worked without saving anything.
 */
export const CustomizationSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    email: z.string().trim().toLowerCase().max(120).pipe(z.email()),
    shopName: z.string().trim().max(80).default(""),
    contact: z.string().trim().max(80).default(""),
    needs: z.array(z.enum(NEED_KEYS)).max(NEED_KEYS.length).default([]),
    details: z.string().trim().max(1000).default(""),
    locale: z.enum(["en", "th", "fr", "de"]).default("en"),
    website: z.string().max(200).optional(),
  })
  // an empty request is no use to anyone: at least one box ticked or a few words written
  .refine((v) => v.needs.length > 0 || v.details.length > 0, { path: ["needs"], message: "choose_or_write" });

export type CustomizationInput = z.infer<typeof CustomizationSchema>;

/** At most this many requests per email address per hour. */
export const MAX_REQUESTS_PER_HOUR = 3;
