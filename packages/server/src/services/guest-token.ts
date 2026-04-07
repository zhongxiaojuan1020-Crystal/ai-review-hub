import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { guestTokens, config } from '../db/schema.js';
import { DEFAULT_GUEST_TOKEN_EXPIRY_HOURS } from '@ai-review/shared';

export function generateGuestToken(reviewId: string): string {
  const db = getDb();

  const expiryRow = db.select().from(config).where(eq(config.key, 'guest_token_expiry_hours')).get();
  const expiryHours = expiryRow ? (expiryRow.value as number) : DEFAULT_GUEST_TOKEN_EXPIRY_HOURS;

  const token = nanoid(32);
  const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();

  db.insert(guestTokens).values({
    id: nanoid(),
    reviewId,
    token,
    expiresAt,
  }).run();

  return token;
}

export function validateGuestToken(token: string): string | null {
  const db = getDb();
  const row = db.select().from(guestTokens).where(eq(guestTokens.token, token)).get();
  if (!row) return null;
  if (new Date(row.expiresAt) < new Date()) return null;
  return row.reviewId;
}
