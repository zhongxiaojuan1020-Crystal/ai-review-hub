import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import { getConfig } from '../config.js';
import { DEFAULT_DIMENSION_WEIGHTS, DEFAULT_SUPERVISOR_WEIGHT, DEFAULT_GUEST_TOKEN_EXPIRY_HOURS } from '@ai-review/shared';
import { migrateReviewsToUnifiedBody } from './migrate-reviews-to-body.js';

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

  // Patch existing review titles to include 【短评】 prefix
  try {
    const reviewsWithoutPrefix = sqlite.prepare(
      `SELECT id, company FROM reviews WHERE company NOT LIKE '【短评】%'`
    ).all() as Array<{ id: string; company: string }>;
    if (reviewsWithoutPrefix.length > 0) {
      const update = sqlite.prepare(`UPDATE reviews SET company = '【短评】' || company WHERE id = ?`);
      for (const r of reviewsWithoutPrefix) {
        update.run(r.id);
      }
      console.log(`[migration] added 【短评】 prefix to ${reviewsWithoutPrefix.length} review(s)`);
    }
  } catch (err) {
    console.error('[migration] 【短评】 prefix patch failed:', err);
  }

  // Inline migrations for columns added after v1
  // reviews.body — rich-text HTML for the unified editor
  try {
    const cols = sqlite.prepare(`PRAGMA table_info(reviews)`).all() as Array<{ name: string }>;
    if (!cols.some(c => c.name === 'body')) {
      sqlite.exec(`ALTER TABLE reviews ADD COLUMN body TEXT`);
      console.log('[migration] added reviews.body column');
    }
  } catch (err) {
    console.error('[migration] reviews.body failed:', err);
  }

  // scores — new 2-dim scoring columns + revision request
  try {
    const scoreCols = sqlite.prepare(`PRAGMA table_info(scores)`).all() as Array<{ name: string }>;
    const scoreColNames = scoreCols.map(c => c.name);
    if (!scoreColNames.includes('quality_score')) {
      sqlite.exec(`ALTER TABLE scores ADD COLUMN quality_score REAL`);
      console.log('[migration] added scores.quality_score');
    }
    if (!scoreColNames.includes('importance_score')) {
      sqlite.exec(`ALTER TABLE scores ADD COLUMN importance_score REAL`);
      console.log('[migration] added scores.importance_score');
    }
    if (!scoreColNames.includes('needs_revision')) {
      sqlite.exec(`ALTER TABLE scores ADD COLUMN needs_revision INTEGER NOT NULL DEFAULT 0`);
      console.log('[migration] added scores.needs_revision');
    }
    if (!scoreColNames.includes('revision_note')) {
      sqlite.exec(`ALTER TABLE scores ADD COLUMN revision_note TEXT`);
      console.log('[migration] added scores.revision_note');
    }
  } catch (err) {
    console.error('[migration] scores new columns failed:', err);
  }

  // comments — revision request tracking
  try {
    const commentCols = sqlite.prepare(`PRAGMA table_info(comments)`).all() as Array<{ name: string }>;
    const commentColNames = commentCols.map(c => c.name);
    if (!commentColNames.includes('is_revision_request')) {
      sqlite.exec(`ALTER TABLE comments ADD COLUMN is_revision_request INTEGER NOT NULL DEFAULT 0`);
      console.log('[migration] added comments.is_revision_request');
    }
    if (!commentColNames.includes('is_resolved')) {
      sqlite.exec(`ALTER TABLE comments ADD COLUMN is_resolved INTEGER NOT NULL DEFAULT 0`);
      console.log('[migration] added comments.is_resolved');
    }
  } catch (err) {
    console.error('[migration] comments new columns failed:', err);
  }

  // drafts table
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS drafts (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        draft_key TEXT NOT NULL,
        company TEXT,
        body TEXT,
        tags TEXT DEFAULT '[]',
        sources TEXT DEFAULT '[]',
        saved_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, draft_key)
      );
      CREATE INDEX IF NOT EXISTS idx_drafts_user_id ON drafts(user_id);
    `);
  } catch (err) {
    console.error('[migration] drafts table failed:', err);
  }

  // favorites table
  try {
    sqlite.exec(`
      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(user_id, review_id)
      );
      CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);
    `);
  } catch (err) {
    console.error('[migration] favorites table failed:', err);
  }

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

  // Normalize any legacy reviews to the unified `body` HTML format, so every
  // renderer / editor only has to speak one shape. Idempotent — rows already
  // migrated are skipped.
  try {
    migrateReviewsToUnifiedBody(sqlite);
  } catch (err) {
    console.error('[migration] reviews → unified body failed:', err);
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
