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
  relevance: real('relevance').notNull(),
  necessity: real('necessity').notNull(),
  importance: real('importance').notNull(),
  urgency: real('urgency').notNull(),
  logic: real('logic').notNull(),
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
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const guestTokens = sqliteTable('guest_tokens', {
  id: text('id').primaryKey(),
  reviewId: text('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().$defaultFn(() => new Date().toISOString()),
});

export const config = sqliteTable('config', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
  updatedAt: text('updated_at').notNull().$defaultFn(() => new Date().toISOString()),
});
