// A minimal D1-compatible database on top of node:sqlite, so the REAL Worker
// modules (which use db.prepare().bind().run()/first()/all() and db.batch())
// can be tested in Node with a simulated clock and no wrangler process.
//
// It applies the real migration files in order, with foreign keys ON (as D1
// does), so schema mistakes show up here.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

class Statement {
  constructor(db, sql, params = []) {
    this.db = db;
    this.sql = sql;
    this.params = params;
  }
  bind(...params) {
    return new Statement(this.db, this.sql, params);
  }
  _run() {
    const st = this.db.sqlite.prepare(this.sql);
    if (/^\s*(select|with|pragma)/i.test(this.sql)) {
      const rows = st.all(...this.params).map((r) => ({ ...r }));
      return { success: true, results: rows, meta: { changes: 0 } };
    }
    const info = st.run(...this.params);
    return { success: true, results: [], meta: { changes: Number(info.changes) } };
  }
  async run() {
    return this._run();
  }
  async all() {
    return this._run();
  }
  async first(col) {
    const { results } = this._run();
    const row = results[0] ?? null;
    return row && col ? row[col] : row;
  }
}

export class ShimDb {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
  }
  prepare(sql) {
    return new Statement(this, sql);
  }
  /** Atomic like D1's batch(): all statements or none. */
  async batch(stmts) {
    this.sqlite.exec('BEGIN');
    try {
      const out = stmts.map((s) => s._run());
      this.sqlite.exec('COMMIT');
      return out;
    } catch (err) {
      this.sqlite.exec('ROLLBACK');
      throw err;
    }
  }
  exec(sql) {
    this.sqlite.exec(sql);
  }
  // convenience for assertions
  rows(sql, ...params) {
    return this.sqlite.prepare(sql).all(...params).map((r) => ({ ...r }));
  }
  one(sql, ...params) {
    return this.rows(sql, ...params)[0];
  }
  run(sql, ...params) {
    return this.sqlite.prepare(sql).run(...params);
  }
}

/** A fresh database with every migration applied (0001, 0002, 0003...). */
export function freshDb() {
  const db = new ShimDb();
  for (const f of readdirSync(MIGRATIONS).filter((x) => x.endsWith('.sql')).sort()) {
    db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'));
  }
  return db;
}
