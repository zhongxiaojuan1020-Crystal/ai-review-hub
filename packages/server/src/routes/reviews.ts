import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { reviews, users, scores } from '../db/schema.js';
import { AUTO_COMPLETE_HOURS } from '@ai-review/shared';
import { getConfig } from '../config.js';
import { sendPublishNotification } from '../services/dingtalk.js';

function buildScoringProgress(allUsers: any[], review: any, reviewScores: any[]) {
  const eligibleScorers = allUsers.filter(u => u.id !== review.authorId);
  const scoredIds = new Set(reviewScores.map((s: any) => s.scorerId));
  return {
    total: eligibleScorers.length,
    completed: reviewScores.length,
    scorers: eligibleScorers.map(u => {
      const userScore = reviewScores.find((s: any) => s.scorerId === u.id);
      // Use current dimension column names
      const totalScore = userScore
        ? userScore.relevance + userScore.necessity + userScore.importance + userScore.urgency + userScore.logic
        : null;
      return {
        userId: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        hasScored: scoredIds.has(u.id),
        totalScore,
      };
    }),
  };
}

export async function reviewRoutes(app: FastifyInstance) {
  // List reviews with filtering
  app.get('/api/reviews', { preValidation: [app.authenticate] }, async (request) => {
    const { status, authorId } = request.query as { status?: string; authorId?: string };
    const db = getDb();

    const allReviews = db.select().from(reviews).orderBy(desc(reviews.createdAt)).all();
    let filtered = allReviews;
    if (status) filtered = filtered.filter(r => r.status === status);
    if (authorId) filtered = filtered.filter(r => r.authorId === authorId);

    const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();
    const allScores = db.select().from(scores).all();

    return filtered.map(review => {
      const author = allUsers.find(u => u.id === review.authorId);
      const reviewScores = allScores.filter((s: any) => s.reviewId === review.id);
      return {
        ...review,
        author: author ? { id: author.id, name: author.name, avatarUrl: author.avatarUrl, role: author.role } : null,
        scoringProgress: buildScoringProgress(allUsers, review, reviewScores),
        canForceComplete: review.status === 'in_progress' &&
          new Date(review.createdAt).getTime() + AUTO_COMPLETE_HOURS * 3600000 < Date.now(),
      };
    });
  });

  // Get single review detail
  app.get('/api/reviews/:id', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();

    const review = db.select().from(reviews).where(eq(reviews.id, id)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });

    const author = db.select().from(users).where(eq(users.id, review.authorId)).get();
    const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();
    const reviewScores = db.select().from(scores).where(eq(scores.reviewId, id)).all();

    return {
      ...review,
      author: author ? { id: author.id, name: author.name, avatarUrl: author.avatarUrl, role: author.role } : null,
      scoringProgress: buildScoringProgress(allUsers, review, reviewScores),
      canForceComplete: review.status === 'in_progress' &&
        new Date(review.createdAt).getTime() + AUTO_COMPLETE_HOURS * 3600000 < Date.now(),
    };
  });

  // Create review
  app.post('/api/reviews', { preValidation: [app.authenticate] }, async (request) => {
    const body = request.body as any;
    const db = getDb();
    const id = nanoid();
    const userId = (request.user as any).id;
    const userName = (request.user as any).name || '成员';

    db.insert(reviews).values({
      id,
      authorId: userId,
      company: body.company,
      description: body.description,
      sections: body.sections || [],
      tags: body.tags || [],
      sources: body.sources || [],
    }).run();

    // Async DingTalk notification — don't await so response is fast
    const { baseUrl } = getConfig();
    sendPublishNotification({
      authorName: userName,
      reviewTitle: body.company,
      reviewId: id,
      appBaseUrl: baseUrl,
    });

    return { id };
  });

  // Update review
  app.put('/api/reviews/:id', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const db = getDb();
    const userId = (request.user as any).id;

    const review = db.select().from(reviews).where(eq(reviews.id, id)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });
    const userRole = (request.user as any).role;
    if (review.authorId !== userId && userRole !== 'supervisor') {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    db.update(reviews).set({
      company: body.company ?? review.company,
      description: body.description ?? review.description,
      sections: body.sections ?? review.sections,
      tags: body.tags ?? review.tags,
      sources: body.sources ?? review.sources,
      updatedAt: new Date().toISOString(),
    }).where(eq(reviews.id, id)).run();

    return { success: true };
  });

  // Delete review
  app.delete('/api/reviews/:id', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const userId = (request.user as any).id;
    const userRole = (request.user as any).role;

    const review = db.select().from(reviews).where(eq(reviews.id, id)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });
    if (review.authorId !== userId && userRole !== 'supervisor') {
      return reply.status(403).send({ error: 'Not authorized' });
    }

    db.delete(reviews).where(eq(reviews.id, id)).run();
    return { success: true };
  });

  // Force complete a review (supervisor only)
  app.post('/api/reviews/:id/complete', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const { forceCompleteReview } = await import('../services/scoring.js');
    const completed = await forceCompleteReview(id);
    if (!completed) return reply.status(400).send({ error: 'Cannot complete this review' });
    return { success: true };
  });
}
