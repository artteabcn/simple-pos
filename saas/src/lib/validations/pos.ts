import { z } from "zod";
import { MenuItemSchema, ShopProfileSchema, VatModeSchema } from "./shop";

export const PaymentMethodSchema = z.enum(["cash", "promptpay", "card"]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

const IdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,64}$/);
export const IsoSchema = z.string().min(10).max(40);

export const CartLineSchema = z.object({
  itemId: IdSchema,
  nameEN: z.string().max(120),
  nameTH: z.string().max(120),
  price: z.number().min(0).max(1_000_000),
  qty: z.number().int().min(1).max(999),
});
export type CartLine = z.infer<typeof CartLineSchema>;

export const OrderSchema = z.object({
  lines: z.array(CartLineSchema).max(200),
  discountPct: z.number().min(0).max(100),
  servicePct: z.number().min(0).max(100),
  label: z.string().max(60),
});
export type Order = z.infer<typeof OrderSchema>;

/** A saved ("kept for later") or paid bill. `total` is stored as a number, never parsed from text. */
export const BillSchema = z.object({
  id: IdSchema,
  updatedAt: IsoSchema,
  deleted: z.undefined().optional(),
  label: z.string().max(60),
  lines: z.array(CartLineSchema).max(200),
  discountPct: z.number(),
  servicePct: z.number(),
  vatMode: VatModeSchema,
  subtotal: z.number(),
  discount: z.number(),
  service: z.number(),
  vat: z.number(),
  total: z.number(),
  method: PaymentMethodSchema.optional(),
  received: z.number().optional(),
  savedAt: IsoSchema.optional(),
  paidAt: IsoSchema.optional(),
});
export type Bill = z.infer<typeof BillSchema>;

/** What a delete leaves behind so other devices learn about it. */
export const TombstoneSchema = z.object({
  id: IdSchema,
  updatedAt: IsoSchema,
  deleted: z.literal(true),
  savedAt: IsoSchema.optional(),
  paidAt: IsoSchema.optional(),
});
export type Tombstone = z.infer<typeof TombstoneSchema>;

export const RecordSchema = z.union([TombstoneSchema, BillSchema]);
export type BillRecord = Bill | Tombstone;

export const ShopConfigSchema = z.object({
  profile: ShopProfileSchema,
  menu: z.array(MenuItemSchema).max(1000),
  /** When the shop settings were last edited (any device); the newest edit wins when tills sync. */
  updatedAt: IsoSchema.optional(),
});
export type ShopConfig = z.infer<typeof ShopConfigSchema>;

export const PosStateSchema = z.object({
  shop: ShopConfigSchema.nullable(),
  order: OrderSchema,
  saved: z.array(RecordSchema),
  paid: z.array(RecordSchema),
});
export type PosState = z.infer<typeof PosStateSchema>;
