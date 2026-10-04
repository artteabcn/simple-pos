import { useSyncExternalStore } from "react";
import type { BillRecord, PosState } from "../validations/pos";
import { SyncResponseSchema, type SyncRequest, type SyncResponse } from "../validations/sync";
import { mergeLists } from "./merge";
import { PAID_CAP, SAVED_CAP } from "./state";
import { getStore, type PosStore } from "./store";

const LINK_KEY = "spos:v1:link";
const META_KEY = "spos:v1:sync";
/** Settings without an edit time (from before syncing existed) beat an empty server but lose to any real edit. */
const LEGACY_CONFIG_TIME = "1970-01-01T00:00:00.001Z";

export type Link = { slug: string; token: string; name: string };
type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function loadLink(storage: StorageLike | null): Link | null {
  try {
    const v = JSON.parse(storage?.getItem(LINK_KEY) ?? "null") as Partial<Link> | null;
    return v && typeof v.token === "string" && typeof v.slug === "string" ? { slug: v.slug, token: v.token, name: String(v.name ?? "") } : null;
  } catch {
    return null;
  }
}

export function saveLink(storage: StorageLike, link: Link): void {
  storage.setItem(LINK_KEY, JSON.stringify(link));
  storage.removeItem(META_KEY); // a new key means a fresh start: send everything once
}

export type SyncPhase = "local" | "idle" | "syncing" | "offline" | "error" | "unauthorized";
export type SyncStatus = { phase: SyncPhase; lastSyncedAt?: string };

type Meta = { cursor: string | null; pushedAt: string | null };

function loadMeta(storage: StorageLike | null): Meta {
  try {
    const v = JSON.parse(storage?.getItem(META_KEY) ?? "null") as Partial<Meta> | null;
    return { cursor: v?.cursor ?? null, pushedAt: v?.pushedAt ?? null };
  } catch {
    return { cursor: null, pushedAt: null };
  }
}

/** What to send: settings, plus every bill edited since the last successful sync (everything the first time). */
export function buildRequest(s: PosState, meta: Meta): SyncRequest {
  const after = meta.pushedAt ? Date.parse(meta.pushedAt) - 60_000 : Number.NEGATIVE_INFINITY;
  const pick = (list: BillRecord[]): BillRecord[] => list.filter((r) => Date.parse(r.updatedAt) > after).slice(0, 500);
  return {
    ...(s.shop ? { config: { profile: s.shop.profile, menu: s.shop.menu, updatedAt: s.shop.updatedAt ?? LEGACY_CONFIG_TIME } } : {}),
    saved: pick(s.saved),
    paid: pick(s.paid),
    since: meta.cursor,
  };
}

/** Folds the server's reply into local data. Nothing is ever dropped: records merge, newest edit wins. */
export function applyResponse(s: PosState, r: SyncResponse): PosState {
  const next: PosState = {
    ...s,
    saved: mergeLists(s.saved, r.saved, SAVED_CAP) as BillRecord[],
    paid: mergeLists(s.paid, r.paid, PAID_CAP) as BillRecord[],
  };
  if (r.config) next.shop = { profile: r.config.profile, menu: r.config.menu, updatedAt: r.config.updatedAt };
  return next;
}

export type EngineDeps = {
  fetch: typeof fetch;
  storage: StorageLike | null;
  now: () => Date;
  /** Timer functions, injectable for tests. */
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (id: unknown) => void;
  isOnline: () => boolean;
  /** Subscribes to "came back online / tab visible / page focus"; returns an unsubscribe. */
  onWake: (fn: () => void) => () => void;
  debounceMs: number;
  pollMs: number;
};

export type SyncEngine = {
  getStatus: () => SyncStatus;
  subscribe: (cb: () => void) => () => void;
  /** Sync now (also called after the till gets linked). */
  syncNow: () => Promise<void>;
  stop: () => void;
};

const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];

export function createSyncEngine(store: PosStore, deps: EngineDeps): SyncEngine {
  const listeners = new Set<() => void>();
  let status: SyncStatus = { phase: loadLink(deps.storage) ? "idle" : "local" };
  let timer: unknown;
  let poll: unknown;
  let inFlight = false;
  let again = false;
  let suppress = false;
  let failures = 0;
  let stopped = false;

  const setStatus = (next: SyncStatus): void => {
    status = next;
    listeners.forEach((l) => l());
  };

  const schedule = (ms: number): void => {
    if (stopped) return;
    deps.clearTimeout(timer);
    timer = deps.setTimeout(() => void syncNow(), ms);
  };

  async function syncNow(): Promise<void> {
    if (stopped) return;
    const link = loadLink(deps.storage);
    if (!link) return setStatus({ phase: "local" });
    if (!deps.isOnline()) return setStatus({ phase: "offline", lastSyncedAt: status.lastSyncedAt });
    if (inFlight) {
      again = true;
      return;
    }
    inFlight = true;
    setStatus({ phase: "syncing", lastSyncedAt: status.lastSyncedAt });
    const started = deps.now(); // taken before the request is built: edits made while it runs are sent next time
    try {
      const body = buildRequest(store.get(), loadMeta(deps.storage));
      const res = await deps.fetch("/api/till/sync", {
        method: "POST",
        headers: { Authorization: `Bearer ${link.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        setStatus({ phase: "unauthorized", lastSyncedAt: status.lastSyncedAt });
        return;
      }
      if (!res.ok) throw new Error(`sync failed (${res.status})`);
      const parsed = SyncResponseSchema.safeParse(await res.json());
      if (!parsed.success) throw new Error("unexpected reply");
      suppress = true; // our own merge must not trigger another sync
      try {
        store.set((s) => applyResponse(s, parsed.data as SyncResponse), { remote: true });
      } finally {
        suppress = false;
      }
      deps.storage?.setItem(META_KEY, JSON.stringify({ cursor: parsed.data.serverTime, pushedAt: started.toISOString() } satisfies Meta));
      failures = 0;
      setStatus({ phase: "idle", lastSyncedAt: deps.now().toISOString() });
    } catch {
      failures++;
      setStatus({ phase: deps.isOnline() ? "error" : "offline", lastSyncedAt: status.lastSyncedAt });
      schedule(BACKOFF_MS[Math.min(failures - 1, BACKOFF_MS.length - 1)] ?? 300_000);
    } finally {
      inFlight = false;
      if (again) {
        again = false;
        schedule(500);
      }
    }
  }

  // Any local edit to bills or settings schedules a sync a moment later (one request for a burst of taps).
  let last = store.get();
  const unsubscribe = store.subscribe(() => {
    if (suppress) {
      last = store.get();
      return;
    }
    const s = store.get();
    if (s.saved !== last.saved || s.paid !== last.paid || s.shop !== last.shop) {
      last = s;
      if (loadLink(deps.storage)) schedule(deps.debounceMs);
    }
  });
  const unwake = deps.onWake(() => void syncNow());
  const tick = (): void => {
    if (stopped) return;
    void syncNow();
    poll = deps.setTimeout(tick, deps.pollMs);
  };
  poll = deps.setTimeout(tick, deps.pollMs);

  return {
    getStatus: () => status,
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    syncNow,
    stop: () => {
      stopped = true;
      unsubscribe();
      unwake();
      deps.clearTimeout(timer);
      deps.clearTimeout(poll);
    },
  };
}

// ---------- the browser's engine ----------

let engine: SyncEngine | null = null;

export function getSyncEngine(): SyncEngine {
  if (!engine) {
    let storage: StorageLike | null = null;
    try {
      storage = localStorage;
    } catch {
      storage = null;
    }
    engine = createSyncEngine(getStore(), {
      fetch: (...a) => fetch(...a),
      storage,
      now: () => new Date(),
      setTimeout: (fn, ms) => window.setTimeout(fn, ms),
      clearTimeout: (id) => window.clearTimeout(id as number),
      isOnline: () => navigator.onLine !== false,
      onWake: (fn) => {
        const vis = (): void => {
          if (document.visibilityState === "visible") fn();
        };
        window.addEventListener("online", fn);
        window.addEventListener("focus", fn);
        document.addEventListener("visibilitychange", vis);
        return () => {
          window.removeEventListener("online", fn);
          window.removeEventListener("focus", fn);
          document.removeEventListener("visibilitychange", vis);
        };
      },
      debounceMs: 2000,
      pollMs: 30_000,
    });
    void engine.syncNow();
  }
  return engine;
}

const SERVER_STATUS: SyncStatus = { phase: "local" };

export function useSyncStatus(): SyncStatus {
  const e = getSyncEngine();
  return useSyncExternalStore(e.subscribe, e.getStatus, () => SERVER_STATUS);
}
