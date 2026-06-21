import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import path from 'path';

// ── Table ─────────────────────────────────────────────────────────────────────

export const installers = sqliteTable('installers', {
  id:               text('id').primaryKey(),
  fullName:         text('full_name').notNull(),
  email:            text('email').unique().notNull(),
  phone:            text('phone').unique().notNull(),
  companyName:      text('company_name').notNull(),
  role:             text('role').notNull().default('installer'),  // installer | sales_rep | manager
  sessionToken:     text('session_token'),
  sessionExpiresAt: integer('session_expires_at'),               // unix seconds
  createdAt:        integer('created_at'),
  updatedAt:        integer('updated_at'),
});

// ── DB client ─────────────────────────────────────────────────────────────────

const DB_PATH = path.join(process.cwd(), 'data', 'installers.db');

let _sqlite: ReturnType<typeof Database> | null = null;

function getSqlite() {
  if (!_sqlite) {
    _sqlite = new Database(DB_PATH);
    _sqlite.pragma('journal_mode = WAL');

    // Auto-create table on first use — no migration tooling needed
    _sqlite.exec(`
      CREATE TABLE IF NOT EXISTS installers (
        id               TEXT PRIMARY KEY,
        full_name        TEXT NOT NULL,
        email            TEXT UNIQUE NOT NULL,
        phone            TEXT UNIQUE NOT NULL,
        company_name     TEXT NOT NULL,
        role             TEXT NOT NULL DEFAULT 'installer',
        session_token    TEXT,
        session_expires_at INTEGER,
        created_at       INTEGER,
        updated_at       INTEGER
      )
    `);
  }
  return _sqlite;
}

export function getInstallerDb() {
  return drizzle(getSqlite(), { schema: { installers } });
}
