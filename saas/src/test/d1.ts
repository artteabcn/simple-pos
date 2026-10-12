// Test helper only (never imported by the app): Node's built-in SQLite dressed up as a Cloudflare D1 database,
// so repository tests run the real migration SQL and the real Drizzle queries.
import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { join } from "node:path";
import type { D1Database } from "@cloudflare/workers-types";
import { makeDb, type Clock, type Db } from "../lib/db";

type Row = Record<string, unknown>;

class Stmt {
  constructor(
    readonly sqlite: DatabaseSync,
    readonly sql: string,
    readonly params: unknown[] = [],
  ) {}
  bind(...params: unknown[]): Stmt {
    return new Stmt(this.sqlite, this.sql, params);
  }
  private prepare(arrays: boolean): StatementSync {
    const st = this.sqlite.prepare(this.sql);
    st.setReturnArrays(arrays);
    return st;
  }
  private args(): (string | number | bigint | null)[] {
    return this.params.map((p) => (p === undefined ? null : typeof p === "boolean" ? (p ? 1 : 0) : (p as string | number | bigint | null)));
  }
  async all(): Promise<{ success: true; results: Row[]; meta: Row }> {
    return { success: true, results: this.prepare(false).all(...this.args()) as Row[], meta: {} };
  }
  async raw(): Promise<unknown[][]> {
    return this.prepare(true).all(...this.args()) as unknown as unknown[][];
  }
  async first(): Promise<Row | null> {
    return (this.prepare(false).get(...this.args()) as Row | undefined) ?? null;
  }
  async run(): Promise<{ success: true; results: never[]; meta: Row }> {
    const r = this.prepare(false).run(...this.args());
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}

class FakeD1 {
  constructor(readonly sqlite: DatabaseSync) {}
  prepare(sql: string): Stmt {
    return new Stmt(this.sqlite, sql);
  }
  /** Atomic like D1: all statements succeed or none do. */
  async batch(stmts: Stmt[]): Promise<{ success: true; results: Row[]; meta: Row }[]> {
    this.sqlite.exec("BEGIN");
    try {
      const out = [];
      for (const s of stmts) out.push(await s.all());
      this.sqlite.exec("COMMIT");
      return out;
    } catch (e) {
      this.sqlite.exec("ROLLBACK");
      throw e;
    }
  }
}

export function createTestDb(): { db: Db; sqlite: DatabaseSync } {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const dir = join(process.cwd(), "migrations");
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".sql")).sort()) {
    for (const part of readFileSync(join(dir, f), "utf8").split("--> statement-breakpoint")) sqlite.exec(part);
  }
  return { db: makeDb(new FakeD1(sqlite) as unknown as D1Database), sqlite };
}

/** A clock that tests can move forward, with predictable ids. */
export function testClock(start = "2026-10-04T10:00:00.000Z"): Clock & { advance: (ms: number) => void } {
  let t = Date.parse(start);
  let n = 0;
  return {
    get now() {
      return new Date(t);
    },
    id: () => `id${String(++n).padStart(4, "0")}`,
    advance: (ms: number) => {
      t += ms;
    },
  };
}
