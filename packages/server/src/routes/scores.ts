import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { scores, reviews, users } from '../db/schema.js';
import { checkAndCompleteReview } from '../services/scoring.js';

export async function scoreRoutes(app: FastifyInstance) {
  // Submit or update score
  app.post('/api/reviews/:reviewId/scores', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { reviewId } = request.params as { reviewId: string };
    const body = request.body as {
      relevance: number; necessity: number; importance: number;
      urgency: number; logic: number;
    };
    const userId = (request.user as any).id;
    const db = getDb();

    // Check review exists
    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });

    // No self-scoring
    if (review.authorId === userId) {
      return reply.status(403).send({ error: '不能给自己的短评打分' });
    }

    // Validate scores 0-5, one decimal
    for (const dim of ['relevance', 'necessity', 'importance', 'urgency', 'logic'] as const) {
      const v = body[dim];
      if (v === undefined || v === null || v < 0 || v > 5) {
        return reply.status(400).send({ error: `${dim} must be between 0 and 5` });
      }
      // Round to 1 decimal place
      body[dim] = Math.round(v * 10) / 10;
    }

    // Upsert score
    const existing = db.select().from(scores)
      .where(and(eq(scores.reviewId, reviewId), eq(scores.scorerId, userId)))
      .get();

    if (existing) {
      db.update(scores).set({
        relevance: body.relevance,
        necessity: body.necessity,
        importance: body.importance,
        urgency: body.urgency,
        logic: body.logic,
        updatedAt: new Date().toISOString(),
      }).where(eq(scores.id, existing.id)).run();
    } else {
      db.insert(scores).values({
        id: nanoid(),
        reviewId,
        scorerId: userId,
        relevance: body.relevance,
        necessity: body.necessity,
        importance: body.importance,
        urgency: body.urgency,
        logic: body.logic,
      }).run();
    }

    // Check if all scored and auto-complete
    await checkAndCompleteReview(reviewId);

    return { success: true };
  });

  // Get scores summary for a review (total visible, dimensions hidden)
  app.get('/api/reviews/:reviewId/scores', { preValidation: [app.authenticate] }, async (request) => {
    const { reviewId } = request.params as { reviewId: string };
    const db = getDb();

    const reviewScores = db.select().from(scores).where(eq(scores.reviewId, reviewId)).all();
    const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();

    return reviewScores.map(s => {
      const scorer = allUsers.find(u => u.id === s.scorerId);
      return {
        scorerId: s.scorerId,
        scorerName: scorer?.name || 'Unknown',
        scorerAvatar: scorer?.avatarUrl || null,
        totalScore: s.relevance + s.necessity + s.importance + s.urgency + s.logic,
      };
    });
  });

  // Get dimension breakdown for a specific scorer (click avatar to see)
  app.get('/api/reviews/:reviewId/scores/:scorerId', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { reviewId, scorerId } = request.params as { reviewId: string; scorerId: string };
    const db = getDb();

    const score = db.select().from(scores)
      .where(and(eq(scores.reviewId, reviewId), eq(scores.scorerId, scorerId)))
      .get();

    if (!score) return reply.status(404).send({ error: 'Score not found' });

    const scorer = db.select().from(users).where(eq(users.id, scorerId)).get();

    return {
      scorerName: scorer?.name || 'Unknown',
      scorerAvatar: scorer?.avatarUrl || null,
      relevance: score.relevance,
      necessity: score.necessity,
      importance: score.importance,
      urgency: score.urgency,
      logic: score.logic,
      totalScore: score.relevance + score.necessity + score.importance + score.urgency + score.logic,
    };
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
      relevance: score.relevance,
      necessity: score.necessity,
      importance: score.importance,
      urgency: score.urgency,
      logic: score.logic,
      updatedAt: score.updatedAt,
    };
  });
}
