import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, testClock } from "../../test/d1";
import type { Db } from "../db";
import { claimShop, provisionPaidSession, shopByToken } from "../db/provision";
import { attachStripeSession, reserveSignup } from "../db/signups";
import { syncShop } from "../db/sync";
import { SyncRequestSchema } from "../validations/sync";
import { addToOrder, deleteRecord, liveBills, patchProfile, payOrder, setShop, upsertItem } from "./state";
import { createStore, type PosStore } from "./store";
import { createSyncEngine, saveLink, type SyncEngine } from "./sync-client";

let db: Db;
let clock: ReturnType<typeof testClock>;
let token: string;
let requests: number;
let serverMode: "ok" | "error" | "unauthorized";

beforeEach(async () => {
  db = createTestDb().db;
  clock = testClock();
  requests = 0;
  serverMode = "ok";
  const r = await reserveSignup(db, { shopName: "Baan Mali", slug: "baan-mali", email: "m@x.co", customisation: false, locale: "en" }, clock);
  if (!r.ok) throw new Error("reserve");
  await attachStripeSession(db, r.signupId, "cs_1", clock.now);
  await provisionPaidSession(db, { sessionId: "cs_1", paymentIntent: null, amountTotal: 49_900, currency: "thb" }, clock);
  const c = await claimShop(db, "cs_1", clock);
  if (c.status !== "ok") throw new Error("claim");
  token = c.token;
});

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
};

/** The server as the till sees it: the real auth, validation and merge code, no HTTP in between. */
const fakeFetch = (async (_url: string, init: RequestInit): Promise<Response> => {
  requests++;
  if (serverMode === "error") return new Response("{}", { status: 500 });
  const auth = (init.headers as Record<string, string>).Authorization ?? "";
  const shop = serverMode === "unauthorized" ? null : await shopByToken(db, auth.replace("Bearer ", ""));
  if (!shop) return new Response("{}", { status: 401 });
  const parsed = SyncRequestSchema.safeParse(JSON.parse(String(init.body)));
  if (!parsed.success) return new Response("{}", { status: 400 });
  return Response.json(await syncShop(db, shop, parsed.data, clock));
}) as unknown as typeof fetch;

function device(opts: { linked?: boolean; online?: () => boolean } = {}) {
  const storage = memory();
  if (opts.linked !== false) saveLink(storage, { slug: "baan-mali", token, name: "Baan Mali" });
  const store = createStore(storage);
  const timers: (() => void)[] = [];
  let wake: () => void = () => undefined;
  const engine = createSyncEngine(store, {
    fetch: fakeFetch,
    storage,
    now: () => clock.now,
    setTimeout: (fn) => timers.push(fn) - 1,
    clearTimeout: () => undefined, // pending callbacks are run explicitly by the tests
    isOnline: opts.online ?? (() => true),
    onWake: (fn) => ((wake = fn), () => undefined),
    debounceMs: 2000,
    pollMs: 30_000,
  });
  const pollFn = timers[0]; // the engine arms its 30 s poll first; tests never run it (it would re-arm forever)
  /** Runs whatever else the engine has scheduled (debounce, retry), the way the clock would. */
  const settle = async (): Promise<void> => {
    for (let i = 0; i < 5; i++) {
      const batch = timers.splice(0).filter((fn) => fn !== pollFn);
      if (!batch.length) break;
      for (const fn of batch) fn();
      await new Promise((r) => setTimeout(r, 30));
    }
  };
  return { storage, store, engine, settle, wake: () => wake() };
}

const shopConfig = {
  profile: { name: "Baan Mali", taxId: "", tel: "", address: "", currency: "฿", logo: "", promptpay: "0812345678", vatMode: "inclusive" as const },
  menu: [{ id: "m1", nameEN: "Pad Thai", nameTH: "ผัดไทย", price: 80 }],
};

function sell(store: PosStore, at: number): string {
  let id = "";
  store.set((s) => addToOrder(s, shopConfig.menu[0]!));
  clock.advance(1000); // one clock for devices and server, so "later" really is later
  store.set((s) => {
    const r = payOrder(s, { now: clock.now, id: () => `bill${at}` }, "cash", 100);
    id = r?.bill.id ?? "";
    return r ? r.state : s;
  });
  return id;
}

describe("a till that is not linked to an account", () => {
  it("stays local and never calls the server", async () => {
    const d = device({ linked: false });
    sell(d.store, 1);
    await d.settle();
    await d.engine.syncNow();
    expect(requests).toBe(0);
    expect(d.engine.getStatus().phase).toBe("local");
  });
});

describe("two tills of one shop", () => {
  it("a sale on one appears on the other, with the shop settings", async () => {
    const a = device();
    a.store.set((s) => setShop(s, { ...shopConfig }));
    sell(a.store, 1);
    await a.settle();
    expect(a.engine.getStatus().phase).toBe("idle");

    const b = device();
    await b.engine.syncNow();
    expect(liveBills(b.store.get().paid).map((x) => x.id)).toEqual(["bill1"]);
    expect(b.store.get().shop?.profile.promptpay).toBe("0812345678"); // no setup wizard on the second till
    expect(b.store.get().shop?.menu).toHaveLength(1);
  });

  it("a delete on one reaches the other", async () => {
    const a = device();
    a.store.set((s) => setShop(s, { ...shopConfig }));
    const id = sell(a.store, 1);
    await a.settle();
    const b = device();
    await b.engine.syncNow();
    expect(liveBills(b.store.get().paid)).toHaveLength(1);

    clock.advance(60_000);
    a.store.set((s) => deleteRecord(s, "paid", id, { now: clock.now, id: () => "x" }));
    await a.settle();
    clock.advance(60_000);
    await b.engine.syncNow();
    expect(liveBills(b.store.get().paid)).toHaveLength(0);
  });

  it("the newest settings edit wins", async () => {
    const a = device();
    a.store.set((s) => setShop(s, { ...shopConfig }));
    await a.settle();
    const b = device();
    await b.engine.syncNow();
    clock.advance(60_000);
    // device clocks are real time in the store; make A's edit clearly newer than B's copy
    await new Promise((r) => setTimeout(r, 5));
    a.store.set((s) => upsertItem(s, { id: "m2", nameEN: "Tea", nameTH: "ชา", price: 35 }));
    await a.settle();
    await b.engine.syncNow();
    expect(b.store.get().shop?.menu.map((m) => m.id)).toEqual(["m1", "m2"]);
    // and a rename on B is pushed back to A
    await new Promise((r) => setTimeout(r, 5));
    b.store.set((s) => patchProfile(s, { name: "Baan Mali 2" }));
    await b.settle();
    await a.engine.syncNow();
    expect(a.store.get().shop?.profile.name).toBe("Baan Mali 2");
  });

  it("merging what the server sent does not trigger endless syncing", async () => {
    const a = device();
    a.store.set((s) => setShop(s, { ...shopConfig }));
    sell(a.store, 1);
    await a.settle();
    const b = device();
    await b.engine.syncNow();
    await b.settle();
    const before = requests;
    await b.settle();
    await a.settle();
    expect(requests).toBe(before);
  });

  it("many taps become few requests (debounce)", async () => {
    const a = device();
    a.store.set((s) => setShop(s, { ...shopConfig }));
    for (let i = 1; i <= 5; i++) sell(a.store, i);
    const before = requests;
    await a.settle();
    expect(requests - before).toBeLessThanOrEqual(2);
    expect(liveBills((await db.select().from((await import("../db")).schema.records)).map((r) => JSON.parse(r.data)))).toHaveLength(5);
  });
});

describe("trouble on the way", () => {
  it("offline: keeps working, then catches up when back online", async () => {
    let online = false;
    const a = device({ online: () => online });
    a.store.set((s) => setShop(s, { ...shopConfig }));
    sell(a.store, 1);
    await a.settle();
    expect(requests).toBe(0);
    expect(a.engine.getStatus().phase).toBe("offline");
    online = true;
    a.wake();
    await new Promise((r) => setTimeout(r, 50));
    expect(a.engine.getStatus().phase).toBe("idle");
    expect((await db.select().from((await import("../db")).schema.records)).length).toBe(1);
  });

  it("server error: reports it, keeps the sale, retries and recovers", async () => {
    const a = device();
    a.store.set((s) => setShop(s, { ...shopConfig }));
    serverMode = "error";
    sell(a.store, 1);
    await a.settle();
    expect(a.engine.getStatus().phase).toBe("error");
    expect(liveBills(a.store.get().paid)).toHaveLength(1); // nothing lost locally
    serverMode = "ok";
    await a.settle(); // the scheduled retry
    await a.engine.syncNow();
    expect(a.engine.getStatus().phase).toBe("idle");
    expect((await db.select().from((await import("../db")).schema.records)).length).toBe(1);
  });

  it("a revoked or wrong key is reported as needing a reconnect", async () => {
    const a = device();
    serverMode = "unauthorized";
    await a.engine.syncNow();
    expect(a.engine.getStatus().phase).toBe("unauthorized");
  });
});
