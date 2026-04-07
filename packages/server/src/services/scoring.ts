import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { scores, reviews, users, config } from '../db/schema.js';
import {
  DEFAULT_DIMENSION_WEIGHTS,
  SUPERVISOR_SCORE_SHARE,
  TAG_DOMAIN_MAP,
} from '@ai-review/shared';
import type { DimensionKey } from '@ai-review/shared';

interface DimensionWeights {
  relevance: number;
  necessity: number;
  importance: number;
  urgency: number;
  logic: number;
}

const DIMENSIONS: DimensionKey[] = ['relevance', 'necessity', 'importance', 'urgency', 'logic'];

/** Compute a single scorer's weighted dimension score (0–5). */
function computeDimensionScore(
  score: Record<string, any>,
  dimWeights: DimensionWeights
): number {
  const weightSum = Object.values(dimWeights).reduce((a, b) => a + b, 0);
  let total = 0;
  for (const dim of DIMENSIONS) {
    total += score[dim] * (dimWeights[dim as keyof DimensionWeights] ?? 0.2);
  }
  return total / weightSum;
}

/**
 * Determine a member's domain relevance weight for a review.
 * We take the max expertise weight across the review's matched domains.
 * Falls back to 0.3 (passing familiarity) if no domain matches.
 */
function memberDomainRelevance(
  reviewTags: string[],
  userDomainWeights: Record<string, number> | null | undefined
): number {
  if (!userDomainWeights) return 0.5; // default if no expertise configured

  const reviewDomains = new Set(
    reviewTags.map(tag => TAG_DOMAIN_MAP[tag]).filter(Boolean)
  );

  if (reviewDomains.size === 0) return 0.5; // no recognizable domain — neutral

  let maxRelevance = 0;
  for (const domain of reviewDomains) {
    const w = userDomainWeights[domain];
    if (w !== undefined && w > maxRelevance) maxRelevance = w;
  }
  return maxRelevance > 0 ? maxRelevance : 0.3;
}

export async function calculateHeatScore(reviewId: string): Promise<number | null> {
  const db = getDb();

  const reviewScores = db.select().from(scores).where(eq(scores.reviewId, reviewId)).all();
  if (reviewScores.length === 0) return null;

  // Get review tags for domain matching
  const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
  const reviewTags: string[] = (review?.tags as string[]) ?? [];

  // Get dimension weights from config (falls back to equal weights)
  const weightsRow = db.select().from(config).where(eq(config.key, 'dimension_weights')).get();
  const dimWeights: DimensionWeights = weightsRow
    ? (weightsRow.value as DimensionWeights)
    : DEFAULT_DIMENSION_WEIGHTS;

  // Get supervisor share from config (falls back to constant)
  const supShareRow = db.select().from(config).where(eq(config.key, 'supervisor_share')).get();
  const supervisorShare: number = supShareRow
    ? (supShareRow.value as number)
    : SUPERVISOR_SCORE_SHARE;

  // Get all users for role + domain weight lookup
  const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();
  const userMap = new Map(allUsers.map(u => [u.id, u]));

  // Separate supervisor score from member scores
  let supervisorDimScore: number | null = null;
  const memberEntries: { dimScore: number; domainRelevance: number }[] = [];

  for (const score of reviewScores) {
    const user = userMap.get(score.scorerId);
    if (!user) continue;

    const dimScore = computeDimensionScore(score, dimWeights);

    if (user.role === 'supervisor') {
      supervisorDimScore = dimScore;
    } else {
      const domainRelevance = memberDomainRelevance(reviewTags, user.domainWeights as Record<string, number> | null);
      memberEntries.push({ dimScore, domainRelevance });
    }
  }

  // Build final weighted score
  // - Supervisor always gets SUPERVISOR_SCORE_SHARE (40%) of total if they have scored
  // - Remaining share (60%) distributed among members by their domain relevance weights
  // - If supervisor hasn't scored yet, members share 100%
  // - If no members have scored, supervisor gets 100%

  let totalScore = 0;

  if (supervisorDimScore !== null && memberEntries.length > 0) {
    // Normal case: supervisor gets supervisorShare, members share the rest
    totalScore += supervisorShare * supervisorDimScore;

    const memberRawTotal = memberEntries.reduce((s, m) => s + m.domainRelevance, 0);
    const memberShare = 1 - supervisorShare;
    for (const m of memberEntries) {
      const weight = (m.domainRelevance / memberRawTotal) * memberShare;
      totalScore += weight * m.dimScore;
    }
  } else if (supervisorDimScore !== null) {
    // Only supervisor has scored
    totalScore = supervisorDimScore;
  } else if (memberEntries.length > 0) {
    // No supervisor score yet — normalize members to 100%
    const memberRawTotal = memberEntries.reduce((s, m) => s + m.domainRelevance, 0);
    for (const m of memberEntries) {
      totalScore += (m.domainRelevance / memberRawTotal) * m.dimScore;
    }
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

  if (allScored) {
    const heatScore = await calculateHeatScore(reviewId);
    db.update(reviews)
      .set({ status: 'completed', heatScore, completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
      .where(eq(reviews.id, reviewId))
      .run();
    return true;
  }

  // Update real-time heat score even if not all scored
  const heatScore = await calculateHeatScore(reviewId);
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
