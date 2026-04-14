import { sqliteTable, text, integer, real, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  dingtalkUserId: text('dingtalk_userid').notNull().unique(),
  role: text('role', { enum: ['member', 'supervisor'] }).notNull().default('member'),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  // Domain expertise weights: { '基础模型': 1.0, '具身智能': 0.8, 'AI Coding': 0.4, 'AI应用': 0.4 }
  domainWeights: text('domain_weights', { mode: 'json' }).$type<Record<string, number>>(),
  passwordHash: text('password_hash'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey(),
  authorId: text('author_id').notNull().references(() => users.id),
  company: text('company').notNull(),
  description: text('description').notNull(),
  /** Rich-text HTML body (new unified editor). When present, renderers prefer this over `sections`. */
  body: text('body'),
  sections: text('sections', { mode: 'json' }).notNull().$type<{ title: string; content: string; images?: string[] }[]>(),
  tags: text('tags', { mode: 'json' }).notNull().$type<string[]>(),
  sources: text('sources', { mode: 'json' }).notNull().$type<string[]>().default([]),
  status: text('status', { enum: ['in_progress', 'completed'] }).notNull().default('in_progress'),
  heatScore: real('heat_score'),
  distributed: integer('distributed', { mode: 'boolean' }).notNull().default(false),
  distributedAt: text('distributed_at'),
  completedAt: text('completed_at'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const scores = sqliteTable('scores', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  scorerId: text('scorer_id').notNull().references(() => users.id),
  // Legacy 5-dimension scoring (0-5 each). Kept for backward compat.
  relevance: real('relevance').notNull().default(0),
  necessity: real('necessity').notNull().default(0),
  importance: real('importance').notNull().default(0),
  urgency: real('urgency').notNull().default(0),
  logic: real('logic').notNull().default(0),
  // New simplified 2-dimension scoring (0-3 stars each). When non-null, heat uses these.
  qualityScore: real('quality_score'),
  importanceScore: real('importance_score'),
  // Revision request
  needsRevision: integer('needs_revision', { mode: 'boolean' }).notNull().default(false),
  revisionNote: text('revision_note'),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex('scores_review_scorer_idx').on(table.reviewId, table.scorerId),
]);

export const comments = sqliteTable('comments', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  authorId: text('author_id').references(() => users.id),
  guestName: text('guest_name'),
  content: text('content').notNull(),
  isLike: integer('is_like', { mode: 'boolean' }).notNull().default(false),
  /** True when this comment is a revision request from a scorer. */
  isRevisionRequest: integer('is_revision_request', { mode: 'boolean' }).notNull().default(false),
  /** True when the review author has marked this revision request as resolved. */
  isResolved: integer('is_resolved', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const guestTokens = sqliteTable('guest_tokens', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const drafts = sqliteTable('drafts', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  draftKey: text('draft_key').notNull(), // 'publish' | 'edit:{reviewId}'
  company: text('company'),
  body: text('body'),
  tags: text('tags', { mode: 'json' }).$type<string[]>(),
  sources: text('sources', { mode: 'json' }).$type<string[]>(),
  savedAt: text('saved_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex('drafts_user_key_idx').on(table.userId, table.draftKey),
]);

export const favorites = sqliteTable('favorites', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  reviewId: text('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
}, (table) => [
  uniqueIndex('favorites_user_review_idx').on(table.userId, table.reviewId),
]);

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
