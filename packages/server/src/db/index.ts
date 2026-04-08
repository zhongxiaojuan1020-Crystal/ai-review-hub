import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { getConfig } from '../config.js';
import { DEFAULT_DIMENSION_WEIGHTS, DEFAULT_SUPERVISOR_WEIGHT, DEFAULT_GUEST_TOKEN_EXPIRY_HOURS } from '@ai-review/shared';

let db: ReturnType<typeof createDb>;

function runMigrations(sqlite: InstanceType<typeof Database>) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      avatar_url TEXT,
      dingtalk_userid TEXT NOT NULL UNIQUE,
      role TEXT NOT NULL DEFAULT 'member' CHECK(role IN ('member', 'supervisor')),
      is_active INTEGER NOT NULL DEFAULT 1,
      domain_weights TEXT,
      password_hash TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id),
      company TEXT NOT NULL,
      description TEXT NOT NULL,
      sections TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      sources TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK(status IN ('in_progress', 'completed')),
      heat_score REAL,
      distributed INTEGER NOT NULL DEFAULT 0,
      distributed_at TEXT,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS scores (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      scorer_id TEXT NOT NULL REFERENCES users(id),
      relevance REAL NOT NULL CHECK(relevance >= 0 AND relevance <= 5),
      necessity REAL NOT NULL CHECK(necessity >= 0 AND necessity <= 5),
      importance REAL NOT NULL CHECK(importance >= 0 AND importance <= 5),
      urgency REAL NOT NULL CHECK(urgency >= 0 AND urgency <= 5),
      logic REAL NOT NULL CHECK(logic >= 0 AND logic <= 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(review_id, scorer_id)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      author_id TEXT REFERENCES users(id),
      guest_name TEXT,
      content TEXT NOT NULL,
      is_like INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS guest_tokens (
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_scores_review_id ON scores(review_id);
    CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
    CREATE INDEX IF NOT EXISTS idx_reviews_created_at ON reviews(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_comments_review_id ON comments(review_id);
    CREATE INDEX IF NOT EXISTS idx_guest_tokens_token ON guest_tokens(token);
  `);

  // Seed default config
  const insertConfig = sqlite.prepare(
    `INSERT OR IGNORE INTO config (key, value, updated_at) VALUES (?, ?, datetime('now'))`
  );
  insertConfig.run('dimension_weights', JSON.stringify(DEFAULT_DIMENSION_WEIGHTS));
  insertConfig.run('supervisor_weight', JSON.stringify(DEFAULT_SUPERVISOR_WEIGHT));
  insertConfig.run('guest_token_expiry_hours', JSON.stringify(DEFAULT_GUEST_TOKEN_EXPIRY_HOURS));

  // Seed initial team members if users table is empty
  const userCount = (sqlite.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (userCount === 0) {
    const seedUsers = [
      { id: 'user_supervisor', name: '方文',    role: 'supervisor', hash: '$2b$10$7dgzlI4N6gscxMyq/QNZJOjHwQh3ZPYG3vdT9LVRyXtSi24BX0rGK' },
      { id: 'user_xianmu',     name: '衔木',    role: 'member',     hash: '$2b$10$UPD5VneEX09v0eF1nNYMvebRgTx1qGruJ1eNujTZ5YHqkgi/kY.qS' },
      { id: 'user_situlj',     name: '司徒琳璟', role: 'member',     hash: '$2b$10$fC/rkn6xHc5giafbiXfZRuZLrPD84tA5qnl94uhDr.Jfpkjq6qv9.' },
      { id: 'user_lifeihong',  name: '李飞宏',  role: 'member',     hash: '$2b$10$VheXUZWp7ztoPSeTOhHfWuPo2qE1hcj2PWw0RhTQzdGCprZKRFgEK' },
      { id: 'user_ali',        name: '阿离',    role: 'member',     hash: '$2b$10$yRSAkx1z2dct4FJdzwHGRetD1tLi.RmgVrkXrKRMxN1PC09EjoBiS' },
    ];
    const insertUser = sqlite.prepare(
      `INSERT OR IGNORE INTO users (id, name, role, dingtalk_userid, password_hash) VALUES (?, ?, ?, ?, ?)`
    );
    for (const u of seedUsers) {
      insertUser.run(u.id, u.name, u.role, u.id, u.hash);
    }
    console.log('Seeded 5 initial team members.');
  }

  console.log('Database ready at:', getConfig().databasePath);
}

function createDb() {
  const config = getConfig();
  const sqlite = new Database(config.databasePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  runMigrations(sqlite);
  return drizzle(sqlite, { schema });
}

export function getDb() {
  if (!db) {
    db = createDb();
  }
  return db;
}

export type AppDb = ReturnType<typeof getDb>;
