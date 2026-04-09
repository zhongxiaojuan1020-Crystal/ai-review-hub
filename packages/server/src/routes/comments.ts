import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { comments, reviews, users } from '../db/schema.js';

export async function commentRoutes(app: FastifyInstance) {
  // List comments for a review (include revision-request metadata)
  app.get('/api/reviews/:reviewId/comments', { preValidation: [app.authenticate] }, async (request) => {
    const { reviewId } = request.params as { reviewId: string };
    const db = getDb();
    const rows = db.select().from(comments).where(eq(comments.reviewId, reviewId)).all();
    const allUsers = db.select().from(users).all();
    const userMap = new Map(allUsers.map(u => [u.id, u]));

    return rows.map(c => ({
      ...c,
      authorName: c.authorId ? (userMap.get(c.authorId)?.name || '成员') : (c.guestName || '游客'),
      authorAvatar: c.authorId ? userMap.get(c.authorId)?.avatarUrl : null,
    }));
  });

  // Add comment (authenticated user)
  app.post('/api/reviews/:reviewId/comments', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { reviewId } = request.params as { reviewId: string };
    const { content } = request.body as { content: string };
    const userId = (request.user as any).id;
    const db = getDb();

    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });

    const id = nanoid();
    db.insert(comments).values({ id, reviewId, authorId: userId, content }).run();
    return { id };
  });

  // Resolve a revision-request comment (author only)
  app.put('/api/reviews/:reviewId/comments/:commentId/resolve', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { reviewId, commentId } = request.params as { reviewId: string; commentId: string };
    const userId = (request.user as any).id;
    const db = getDb();

    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });
    if (review.authorId !== userId && (request.user as any).role !== 'supervisor') {
      return reply.status(403).send({ error: '只有作者可以解决修改建议' });
    }

    const comment = db.select().from(comments)
      .where(and(eq(comments.id, commentId), eq(comments.reviewId, reviewId)))
      .get();
    if (!comment) return reply.status(404).send({ error: 'Comment not found' });

    db.update(comments).set({ isResolved: true }).where(eq(comments.id, commentId)).run();
    return { success: true };
  });
}
