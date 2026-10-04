import { z } from "zod";
import { IsoSchema, RecordSchema, type BillRecord } from "./pos";
import { MenuItemSchema, ShopProfileSchema } from "./shop";

/** Shop settings as the till sends them. The newest `updatedAt` wins. */
export const SyncConfigSchema = z.object({
  profile: ShopProfileSchema,
  menu: z.array(MenuItemSchema).max(1000),
  updatedAt: IsoSchema,
});
export type SyncConfig = z.infer<typeof SyncConfigSchema>;

/** What a till sends: its own changes plus where it got to last time. */
export const SyncRequestSchema = z.object({
  config: SyncConfigSchema.optional(),
  saved: z.array(RecordSchema).max(500),
  paid: z.array(RecordSchema).max(500),
  /** Server time of the previous sync, or null the first time (then everything is returned). */
  since: IsoSchema.nullable(),
});
export type SyncRequest = z.infer<typeof SyncRequestSchema>;

export type SyncResponse = {
  serverTime: string;
  /** Whether the shop has a manager PIN (the till then asks for it before My shop). */
  pinSet: boolean;
  /** The settings in this request were not saved because the manager PIN was not entered. */
  configRejected?: boolean;
  /** Present only when the server has newer settings than the till sent. */
  config?: SyncConfig;
  saved: BillRecord[];
  paid: BillRecord[];
};

/** The till does not trust the network either: the reply is validated before it touches local data. */
export const SyncResponseSchema = z.object({
  serverTime: IsoSchema,
  pinSet: z.boolean(),
  configRejected: z.boolean().optional(),
  config: SyncConfigSchema.optional(),
  saved: z.array(RecordSchema),
  paid: z.array(RecordSchema),
});

export const MAX_SYNC_BODY_BYTES = 1_000_000;
