import { useSyncExternalStore } from "react";
import { PosStateSchema, type PosState } from "../validations/pos";
import { initialState, type Ctx } from "./state";

const KEY = "spos:v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

/** Reads saved state. Anything missing or corrupt falls back to an empty shop instead of crashing. */
export function loadState(storage: StorageLike | null): PosState {
  if (!storage) return initialState();
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return initialState();
    const parsed = PosStateSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : initialState();
  } catch {
    return initialState();
  }
}

export function newId(): string {
  const rand = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().replace(/-/g, "").slice(0, 10) : Math.random().toString(36).slice(2, 12);
  return Date.now().toString(36) + rand;
}

export const liveCtx = (): Ctx => ({ now: new Date(), id: newId });

/** `remote: true` marks a change that came from the server, so it keeps the server's edit time. */
export type SetOptions = { remote?: boolean };

export type PosStore = {
  get: () => PosState;
  set: (fn: (s: PosState) => PosState, opts?: SetOptions) => void;
  subscribe: (cb: () => void) => () => void;
  flush: () => void;
};

export function createStore(storage: StorageLike | null): PosStore {
  let state = loadState(storage);
  const listeners = new Set<() => void>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const write = (): void => {
    timer = undefined;
    try {
      storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      /* storage full or blocked: the app keeps working in memory */
    }
  };

  return {
    get: () => state,
    set: (fn, opts) => {
      let next = fn(state);
      if (next === state) return;
      // Any local edit to the shop settings (name, menu, VAT...) gets a fresh edit time for syncing.
      if (!opts?.remote && next.shop && next.shop !== state.shop) {
        next = { ...next, shop: { ...next.shop, updatedAt: new Date().toISOString() } };
      }
      state = next;
      listeners.forEach((l) => l());
      if (timer === undefined) timer = setTimeout(write, 150);
    },
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    flush: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
        write();
      }
    },
  };
}

let single: PosStore | null = null;

/** One store per page, created on first use in the browser. */
export function getStore(): PosStore {
  if (!single) {
    let storage: StorageLike | null = null;
    try {
      storage = typeof localStorage !== "undefined" ? localStorage : null;
    } catch {
      storage = null;
    }
    single = createStore(storage);
    if (typeof window !== "undefined") {
      window.addEventListener("pagehide", () => single?.flush());
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") single?.flush();
      });
    }
  }
  return single;
}

const SERVER_STATE = initialState();

export function usePos(): [PosState, PosStore["set"]] {
  const store = getStore();
  const state = useSyncExternalStore(store.subscribe, store.get, () => SERVER_STATE);
  return [state, store.set];
}
