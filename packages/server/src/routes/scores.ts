import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { scores, reviews, users, comments } from '../db/schema.js';
import { checkAndCompleteReview } from '../services/scoring.js';

export async function scoreRoutes(app: FastifyInstance) {
  // Submit or update score (new 2-dim system)
  app.post('/api/reviews/:reviewId/scores', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { reviewId } = request.params as { reviewId: string };
    const body = request.body as {
      quality_score: number;
      importance_score: number;
      needs_revision?: boolean;
      revision_note?: string;
    };
    const userId = (request.user as any).id;
    const db = getDb();

    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });
    if (review.authorId === userId) return reply.status(403).send({ error: '不能给自己的短评打分' });

    // Validate 0-3 star range
    for (const dim of ['quality_score', 'importance_score'] as const) {
      const v = body[dim];
      if (v === undefined || v === null || v < 0 || v > 3) {
        return reply.status(400).send({ error: `${dim} must be between 0 and 3` });
      }
      body[dim] = Math.round(v * 2) / 2; // round to 0.5 steps
    }

    const needsRevision = !!body.needs_revision;
    const revisionNote = needsRevision ? (body.revision_note || '').trim() : null;

    const existing = db.select().from(scores)
      .where(and(eq(scores.reviewId, reviewId), eq(scores.scorerId, userId)))
      .get();

    if (existing) {
      db.update(scores).set({
        qualityScore: body.quality_score,
        importanceScore: body.importance_score,
        needsRevision,
        revisionNote,
        updatedAt: new Date().toISOString(),
      }).where(eq(scores.id, existing.id)).run();
    } else {
      db.insert(scores).values({
        id: nanoid(),
        reviewId,
        scorerId: userId,
        relevance: 0,
        necessity: 0,
        importance: 0,
        urgency: 0,
        logic: 0,
        qualityScore: body.quality_score,
        importanceScore: body.importance_score,
        needsRevision,
        revisionNote,
      }).run();
    }

    // If needs_revision with a note, create/update a revision-request comment
    if (needsRevision && revisionNote) {
      const scorer = db.select().from(users).where(eq(users.id, userId)).get();
      const scorerName = scorer?.name || '评分者';
      const commentContent = `[修改建议] ${revisionNote}`;

      // Look for an existing revision comment from this scorer on this review
      const existingComment = db.select().from(comments)
        .where(and(eq(comments.reviewId, reviewId), eq(comments.authorId, userId), eq(comments.isRevisionRequest, true)))
        .get();

      if (existingComment) {
        db.update(comments).set({
          content: commentContent,
          isResolved: false,
        }).where(eq(comments.id, existingComment.id)).run();
      } else {
        db.insert(comments).values({
          id: nanoid(),
          reviewId,
          authorId: userId,
          content: commentContent,
          isRevisionRequest: true,
          isResolved: false,
        }).run();
      }
    } else if (!needsRevision) {
      // If scorer un-checks needs_revision, mark their existing revision comment as resolved
      const existingRevComment = db.select().from(comments)
        .where(and(eq(comments.reviewId, reviewId), eq(comments.authorId, userId), eq(comments.isRevisionRequest, true)))
        .get();
      if (existingRevComment && !existingRevComment.isResolved) {
        db.update(comments).set({ isResolved: true }).where(eq(comments.id, existingRevComment.id)).run();
      }
    }

    await checkAndCompleteReview(reviewId);
    return { success: true };
  });

  // Get scores summary for a review
  app.get('/api/reviews/:reviewId/scores', { preValidation: [app.authenticate] }, async (request) => {
    const { reviewId } = request.params as { reviewId: string };
    const db = getDb();

    const reviewScores = db.select().from(scores).where(eq(scores.reviewId, reviewId)).all();
    const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();

    return reviewScores.map(s => {
      const scorer = allUsers.find(u => u.id === s.scorerId);
      // Prefer new scoring if available
      const totalScore = (s.qualityScore != null && s.importanceScore != null)
        ? ((s.qualityScore + s.importanceScore) / 2)
        : (s.relevance + s.necessity + s.importance + s.urgency + s.logic);
      return {
        scorerId: s.scorerId,
        scorerName: scorer?.name || 'Unknown',
        scorerAvatar: scorer?.avatarUrl || null,
        totalScore,
      };
    });
  });

  // Get current user's score for a review
  app.get('/api/reviews/:reviewId/my-score', { preValidation: [app.authenticate] }, async (request) => {
    const { reviewId } = request.params as { reviewId: string };
    const userId = (request.user as any).id;
    const db = getDb();

    const score = db.select().from(scores)
      .where(and(eq(scores.reviewId, reviewId), eq(scores.scorerId, userId)))
      .get();

    if (!score) return null;

    return {
      quality_score: score.qualityScore ?? 0,
      importance_score: score.importanceScore ?? 0,
      needs_revision: score.needsRevision ?? false,
      revision_note: score.revisionNote ?? '',
      updatedAt: score.updatedAt,
    };
  });
}
