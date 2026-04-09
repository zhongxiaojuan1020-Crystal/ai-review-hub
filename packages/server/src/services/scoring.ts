import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { scores, reviews, users, config } from '../db/schema.js';
import { SUPERVISOR_SCORE_SHARE } from '@ai-review/shared';

/**
 * Compute heat score from the new 2-dim (quality + importance) scores.
 * Each scorer contributes an average of their two stars (0-3 → normalised to 0-5).
 * Supervisor weight = SUPERVISOR_SCORE_SHARE (40%), members share the rest.
 */
export async function calculateHeatScore(reviewId: string): Promise<number | null> {
  const db = getDb();

  const reviewScores = db.select().from(scores).where(eq(scores.reviewId, reviewId)).all();
  if (reviewScores.length === 0) return null;

  const supShareRow = db.select().from(config).where(eq(config.key, 'supervisor_share')).get();
  const supervisorShare: number = supShareRow ? (supShareRow.value as number) : SUPERVISOR_SCORE_SHARE;

  const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();
  const userMap = new Map(allUsers.map(u => [u.id, u]));

  // Compute each scorer's combined score (0–5 scale)
  const entries: { isSupervisor: boolean; score: number }[] = [];

  for (const s of reviewScores) {
    const user = userMap.get(s.scorerId);
    if (!user) continue;

    let combined: number;
    if (s.qualityScore != null && s.importanceScore != null) {
      // New system: avg of two 0-3 stars, scaled to 0-5
      combined = ((s.qualityScore + s.importanceScore) / 2) * (5 / 3);
    } else {
      // Legacy fallback: avg of 5 dims
      combined = (s.relevance + s.necessity + s.importance + s.urgency + s.logic) / 5;
    }

    entries.push({ isSupervisor: user.role === 'supervisor', score: combined });
  }

  const supEntries = entries.filter(e => e.isSupervisor);
  const memberEntries = entries.filter(e => !e.isSupervisor);

  let totalScore = 0;

  if (supEntries.length > 0 && memberEntries.length > 0) {
    const supScore = supEntries[0].score;
    totalScore += supervisorShare * supScore;
    const memberAvg = memberEntries.reduce((s, e) => s + e.score, 0) / memberEntries.length;
    totalScore += (1 - supervisorShare) * memberAvg;
  } else if (supEntries.length > 0) {
    totalScore = supEntries[0].score;
  } else if (memberEntries.length > 0) {
    totalScore = memberEntries.reduce((s, e) => s + e.score, 0) / memberEntries.length;
  } else {
    return null;
  }

  return Math.round(totalScore * 100) / 100;
}

export async function checkAndCompleteReview(reviewId: string): Promise<boolean> {
  const db = getDb();

  const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
  if (!review || review.status === 'completed') return false;

  const activeUsers = db.select().from(users).where(eq(users.isActive, true)).all();
  const eligibleScorers = activeUsers.filter(u => u.id !== review.authorId);

  const reviewScores = db.select().from(scores).where(eq(scores.reviewId, reviewId)).all();
  const scoredUserIds = new Set(reviewScores.map(s => s.scorerId));

  const allScored = eligibleScorers.every(u => scoredUserIds.has(u.id));
  const heatScore = await calculateHeatScore(reviewId);

  if (allScored) {
    db.update(reviews)
      .set({ status: 'completed', heatScore, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(reviews.id, reviewId))
      .run();
    return true;
  }

  if (heatScore !== null) {
    db.update(reviews)
      .set({ heatScore, updatedAt: new Date().toISOString() })
      .where(eq(reviews.id, reviewId))
      .run();
  }
  return false;
}

export async function forceCompleteReview(reviewId: string): Promise<boolean> {
  const db = getDb();
  const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
  if (!review || review.status === 'completed') return false;

  const heatScore = await calculateHeatScore(reviewId);
  db.update(reviews)
    .set({ status: 'completed', heatScore, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
    .where(eq(reviews.id, reviewId))
    .run();
  return true;
}
