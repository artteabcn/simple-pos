import { useEffect, useState, type ReactNode } from "react";
import { clsx } from "clsx";

const TOKEN_KEY = "spos:v1:admin";

type RequestStatus = "new" | "in_progress" | "done";
const STATUSES: RequestStatus[] = ["new", "in_progress", "done"];
const STATUS_LABEL: Record<RequestStatus, string> = { new: "New", in_progress: "In progress", done: "Done" };

type AdminRequest = {
  id: string;
  name: string;
  email: string;
  shopName: string;
  contact: string;
  needs: string[];
  details: string;
  locale: string;
  status: RequestStatus;
  hasShop: boolean;
  createdAt: string;
};

const NEED_LABEL: Record<string, string> = {
  menu: "Set up menu",
  receipt: "Logo and receipt look",
  languages: "Languages and wording",
  import: "Move items from a spreadsheet",
  training: "Staff training",
  other: "Something else",
};

function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(t: string | null): void {
  try {
    if (t) sessionStorage.setItem(TOKEN_KEY, t);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* private mode: the tab just asks again next time */
  }
}

export default function AdminApp(): ReactNode {
  const [token, setTokenState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setTokenState(getToken());
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!token) return <TokenGate onToken={(t) => { setToken(t); setTokenState(t); }} />;
  return <RequestsList token={token} onSignOut={() => { setToken(null); setTokenState(null); }} />;
}

function TokenGate({ onToken }: { onToken: (t: string) => void }): ReactNode {
  const [value, setValue] = useState("");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const submit = async (): Promise<void> => {
    if (!value.trim()) return;
    setChecking(true);
    setError("");
    try {
      const res = await fetch("/api/admin/requests/list", { headers: { Authorization: `Bearer ${value.trim()}` } });
      if (res.ok) onToken(value.trim());
      else setError(res.status === 401 ? "Wrong token." : "Admin screen is not set up on this environment.");
    } catch {
      setError("Could not reach the server. Check your connection.");
    }
    setChecking(false);
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
      <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">Admin</h1>
      <p className="text-base text-stone-600 dark:text-stone-400">Enter the admin token to see customisation requests.</p>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          type="password"
          autoFocus
          autoComplete="off"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Admin token"
          className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 text-base text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        />
        {error && <p role="alert" className="text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={checking || !value.trim()}
          className="min-h-12 w-full cursor-pointer rounded-xl bg-brand font-semibold text-white disabled:opacity-50"
        >
          {checking ? "Checking…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

function RequestsList({ token, onSignOut }: { token: string; onSignOut: () => void }): ReactNode {
  const [filter, setFilter] = useState<RequestStatus | "all">("new");
  const [rows, setRows] = useState<AdminRequest[] | null>(null);
  const [error, setError] = useState("");

  const load = (): void => {
    setRows(null);
    setError("");
    const q = filter === "all" ? "" : `?status=${filter}`;
    fetch(`/api/admin/requests/list${q}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (res.status === 401) {
          onSignOut();
          throw new Error("unauthorized");
        }
        return res.json() as Promise<{ requests: AdminRequest[] }>;
      })
      .then((b) => setRows(b.requests))
      .catch((e) => { if (e.message !== "unauthorized") setError("Could not load requests."); });
  };
  useEffect(load, [filter, token]);

  const setStatus = async (id: string, status: RequestStatus): Promise<void> => {
    setRows((cur) => cur?.map((r) => (r.id === id ? { ...r, status } : r)) ?? cur);
    const res = await fetch("/api/admin/requests/status", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ id, status }),
    });
    if (!res.ok) load(); // out of sync with the server: just reload this filter
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold text-stone-900 dark:text-stone-50">Customisation requests</h1>
        <button type="button" onClick={onSignOut} className="cursor-pointer text-sm font-semibold text-stone-600 hover:underline dark:text-stone-400">
          Sign out
        </button>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["new", "in_progress", "done", "all"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={clsx(
              "min-h-10 shrink-0 cursor-pointer rounded-full border px-4 text-sm font-semibold",
              filter === f ? "border-brand bg-brand text-white" : "border-stone-300 text-stone-700 dark:border-stone-700 dark:text-stone-300",
            )}
          >
            {f === "all" ? "All" : STATUS_LABEL[f]}
          </button>
        ))}
      </div>

      {error && <p role="alert" className="text-base text-rose-700 dark:text-rose-300">{error}</p>}
      {!error && rows === null && <p className="text-base text-stone-600 dark:text-stone-400">Loading…</p>}
      {rows !== null && rows.length === 0 && <p className="text-base text-stone-600 dark:text-stone-400">No requests here.</p>}

      <ul className="flex flex-col gap-3">
        {rows?.map((r) => (
          <li key={r.id} className="rounded-2xl border border-stone-200 p-4 dark:border-stone-800">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-lg font-bold text-stone-900 dark:text-stone-50">{r.shopName || r.name}</p>
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  {r.name} · {r.email}
                  {r.contact ? ` · ${r.contact}` : ""} · {r.locale}
                  {r.hasShop ? " · paying customer" : " · not yet a customer"}
                </p>
              </div>
              <time dateTime={r.createdAt} className="shrink-0 text-sm text-stone-500 dark:text-stone-500">
                {new Date(r.createdAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}
              </time>
            </div>
            {r.needs.length > 0 && (
              <p className="mt-2 text-base text-stone-800 dark:text-stone-200">{r.needs.map((n) => NEED_LABEL[n] ?? n).join(", ")}</p>
            )}
            {r.details && <p className="mt-1 text-base whitespace-pre-wrap text-stone-700 dark:text-stone-300">{r.details}</p>}
            <div className="mt-3 flex gap-2">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void setStatus(r.id, s)}
                  disabled={r.status === s}
                  className={clsx(
                    "min-h-9 cursor-pointer rounded-full border px-3 text-sm font-semibold disabled:cursor-default",
                    r.status === s ? "border-brand bg-brand/10 text-brand dark:text-teal-300" : "border-stone-300 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800",
                  )}
                >
                  {STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
