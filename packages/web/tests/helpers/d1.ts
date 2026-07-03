// In-memory D1 stand-in for handler tests, backed by node:sqlite (which ships
// SQLite with FTS5, so the real schema + trigram search run unmodified).
// Implements only the D1 surface the app uses: prepare/bind/first/all/batch.

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

class TestStatement {
  private params: unknown[] = [];

  constructor(
    private db: DatabaseSync,
    private sql: string
  ) {}

  bind(...params: unknown[]): this {
    this.params = params;
    return this;
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params);
    return (row as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ results: T[]; success: true; meta: object }> {
    const rows = this.db.prepare(this.sql).all(...this.params);
    return { results: rows as T[], success: true, meta: {} };
  }
}

/** Create an in-memory database loaded with db/schema.sql + the seed fixture,
 *  wrapped in a D1Database-compatible adapter. */
export function createTestDB(): D1Database {
  const db = new DatabaseSync(":memory:");
  db.exec(
    readFileSync(new URL("../../../../db/schema.sql", import.meta.url), "utf-8")
  );
  db.exec(
    readFileSync(new URL("../fixtures/seed.sql", import.meta.url), "utf-8")
  );

  const adapter = {
    prepare: (sql: string) => new TestStatement(db, sql),
    batch: (statements: TestStatement[]) =>
      Promise.all(statements.map((s) => s.all())),
  };
  return adapter as unknown as D1Database;
}
