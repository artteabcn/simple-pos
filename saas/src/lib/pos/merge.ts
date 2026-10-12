/**
 * Merge rules shared by the browser and the Worker.
 * Every record has an id and updatedAt. A delete is a tombstone ({ deleted: true }) so it
 * reaches other devices instead of the record coming back. Newest updatedAt wins.
 */
export type SyncRecord = {
  id?: string;
  updatedAt?: string;
  deleted?: boolean;
  label?: string;
  total?: number;
  paidAt?: string;
  savedAt?: string;
  [key: string]: unknown;
};

export type StampedRecord = SyncRecord & { id: string; updatedAt: string };

export const TOMBSTONE_MS = 30 * 24 * 60 * 60 * 1000;

/** Gives legacy records (no id) a stable id derived from their content, and keeps ids URL/attribute-safe. */
export function stamp(r: SyncRecord): StampedRecord {
  let id = r.id ? String(r.id) : "";
  if (!id) {
    const s = `${r.label ?? ""}|${r.paidAt ?? r.savedAt ?? ""}|${r.total ?? 0}`;
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    id = "L" + (h >>> 0).toString(36);
  }
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, "");
  return {
    ...r,
    id: safeId,
    updatedAt: r.updatedAt ?? r.paidAt ?? r.savedAt ?? new Date(0).toISOString(),
  };
}

const sortKey = (r: StampedRecord): string => r.paidAt ?? r.savedAt ?? r.updatedAt;

export function mergeLists(
  a: SyncRecord[],
  b: SyncRecord[],
  cap: number,
  now: number = Date.now(),
): StampedRecord[] {
  const map = new Map<string, StampedRecord>();
  for (const raw of [...a, ...b]) {
    const x = stamp(raw);
    const o = map.get(x.id);
    if (!o || x.updatedAt > o.updatedAt) map.set(x.id, x);
  }
  const all = [...map.values()].sort((p, q) => sortKey(q).localeCompare(sortKey(p)));
  const live = all.filter((x) => !x.deleted).slice(0, cap);
  const dead = all.filter((x) => x.deleted && new Date(x.updatedAt).getTime() > now - TOMBSTONE_MS);
  return [...live, ...dead].sort((p, q) => sortKey(q).localeCompare(sortKey(p)));
}

export function tombstone(r: StampedRecord, now: Date = new Date()): StampedRecord {
  return { id: r.id, deleted: true, updatedAt: now.toISOString(), paidAt: r.paidAt, savedAt: r.savedAt };
}
