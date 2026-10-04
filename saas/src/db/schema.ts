import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = (): string => new Date().toISOString();

/** A restaurant or shop that has paid and owns a till. */
export const shops = sqliteTable(
  "shops",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    ownerEmail: text("owner_email").notNull(),
    status: text("status", { enum: ["active", "suspended"] }).notNull().default("active"),
    customisation: integer("customisation", { mode: "boolean" }).notNull().default(false),
    lastSyncAt: text("last_sync_at"),
    /** Manager PIN: HMAC of the PIN with a server secret (never the PIN itself), plus the lockout state. */
    pinHash: text("pin_hash"),
    pinFailures: integer("pin_failures").notNull().default(0),
    pinLockedUntil: text("pin_locked_until"),
    /** Shop profile and menu as validated JSON; the newest edit wins (configUpdatedAt). */
    profileJson: text("profile_json").notNull().default("{}"),
    menuJson: text("menu_json").notNull().default("[]"),
    configUpdatedAt: text("config_updated_at").notNull().default("1970-01-01T00:00:00.000Z"),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [uniqueIndex("shops_slug_unique").on(t.slug), index("shops_email_idx").on(t.ownerEmail)],
);

/** A phone or tablet that may sync one shop. Each has its own key, so one lost device can be switched off alone. */
export const devices = sqliteTable(
  "devices",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    /** SHA-256 of the device key. The key itself is shown once and never stored. */
    tokenHash: text("token_hash").notNull(),
    name: text("name").notNull().default(""),
    lastSeenAt: text("last_seen_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [uniqueIndex("devices_token_unique").on(t.tokenHash), index("devices_shop_idx").on(t.shopId)],
);

/** A one-time sign-in link sent by email (one per shop of that owner). Only the hash of its token is kept. */
export const loginLinks = sqliteTable(
  "login_links",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    usedAt: text("used_at"),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [uniqueIndex("login_links_token_unique").on(t.tokenHash), index("login_links_email_idx").on(t.email, t.createdAt)],
);

/** Short-lived "the manager PIN was entered on this device" proof, needed to change prices, menu and settings. */
export const managerSessions = sqliteTable(
  "manager_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    deviceId: text("device_id").notNull().references(() => devices.id),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [index("manager_sessions_device_idx").on(t.deviceId)],
);

/** "Curated customisation" requests: what the owner needs, so the team can get back to them. */
export const customizationRequests = sqliteTable(
  "customization_requests",
  {
    id: text("id").primaryKey(),
    /** Linked automatically when the email belongs to a paying shop. */
    shopId: text("shop_id").references(() => shops.id),
    name: text("name").notNull(),
    email: text("email").notNull(),
    shopName: text("shop_name").notNull().default(""),
    /** Phone number or LINE id, whatever the owner prefers. */
    contact: text("contact").notNull().default(""),
    needsJson: text("needs_json").notNull().default("[]"),
    details: text("details").notNull().default(""),
    locale: text("locale").notNull().default("en"),
    status: text("status", { enum: ["new", "in_progress", "done"] }).notNull().default("new"),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [index("requests_email_idx").on(t.email, t.createdAt), index("requests_status_idx").on(t.status, t.createdAt)],
);

/** A started checkout. Reserves the web address for a while so two people cannot pay for the same one. */
export const signups = sqliteTable(
  "signups",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull(),
    shopName: text("shop_name").notNull(),
    email: text("email").notNull(),
    customisation: integer("customisation", { mode: "boolean" }).notNull().default(false),
    locale: text("locale").notNull().default("en"),
    amountExpected: integer("amount_expected").notNull(),
    /** When the customer ticked "I accept the Terms and Privacy Policy", and the version of the text they accepted. */
    termsAcceptedAt: text("terms_accepted_at"),
    termsVersion: text("terms_version"),
    stripeSessionId: text("stripe_session_id"),
    status: text("status", { enum: ["pending", "paid", "expired"] }).notNull().default("pending"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [uniqueIndex("signups_session_unique").on(t.stripeSessionId), index("signups_slug_idx").on(t.slug)],
);

/** One row per successful Stripe payment (the unique session id makes provisioning idempotent). */
export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    shopId: text("shop_id").notNull().references(() => shops.id),
    stripeSessionId: text("stripe_session_id").notNull(),
    stripePaymentIntent: text("stripe_payment_intent"),
    amountTotal: integer("amount_total").notNull(),
    currency: text("currency").notNull(),
    paidAt: text("paid_at").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [uniqueIndex("payments_session_unique").on(t.stripeSessionId), index("payments_shop_idx").on(t.shopId)],
);

/** Stripe event ids already handled, so a retried webhook does nothing twice. */
export const stripeEvents = sqliteTable("stripe_events", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: text("processed_at").notNull(),
  createdAt: text("created_at").notNull().$defaultFn(now),
  updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
});

/** Saved and paid bills (and delete markers) from every till of a shop. */
export const records = sqliteTable(
  "records",
  {
    shopId: text("shop_id").notNull().references(() => shops.id),
    kind: text("kind", { enum: ["saved", "paid"] }).notNull(),
    id: text("id").notNull(),
    /** Device clock time of the last edit: decides which version of a bill wins. */
    recordUpdatedAt: text("record_updated_at").notNull(),
    /** Server time of the last write: lets a till ask only for what changed. */
    syncedAt: text("synced_at").notNull(),
    deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
    /** When the bill was paid or saved (for reports). */
    eventAt: text("event_at"),
    total: real("total"),
    data: text("data").notNull(),
    createdAt: text("created_at").notNull().$defaultFn(now),
    updatedAt: text("updated_at").notNull().$defaultFn(now).$onUpdateFn(now),
  },
  (t) => [
    primaryKey({ columns: [t.shopId, t.kind, t.id] }),
    index("records_changes_idx").on(t.shopId, t.syncedAt),
    index("records_report_idx").on(t.shopId, t.kind, t.eventAt),
  ],
);

export type ShopRow = typeof shops.$inferSelect;
export type DeviceRow = typeof devices.$inferSelect;
export type CustomizationRequestRow = typeof customizationRequests.$inferSelect;
export type SignupRow = typeof signups.$inferSelect;
export type PaymentRow = typeof payments.$inferSelect;
export type RecordRow = typeof records.$inferSelect;
