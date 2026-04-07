import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { reviews, users, comments } from '../db/schema.js';
import { validateGuestToken } from '../services/guest-token.js';

export async function guestRoutes(app: FastifyInstance) {
  // Get review in guest read-only mode
  app.get('/api/guest/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    const reviewId = validateGuestToken(token);
    if (!reviewId) return reply.status(403).send({ error: '链接已失效或不存在' });

    const db = getDb();
    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });

    const author = db.select().from(users).where(eq(users.id, review.authorId)).get();
    const reviewComments = db.select().from(comments).where(eq(comments.reviewId, reviewId)).all();

    // Get commenter names
    const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();
    const enrichedComments = reviewComments.map(c => ({
      ...c,
      authorName: c.authorId ? allUsers.find(u => u.id === c.authorId)?.name || '成员' : c.guestName || '游客',
    }));

    // Also return other distributed reviews for lateral browsing
    const otherDistributed = db.select().from(reviews)
      .where(eq(reviews.distributed, true))
      .all()
      .filter(r => r.id !== reviewId)
      .map(r => ({
        id: r.id,
        company: r.company,
        heatScore: r.heatScore,
        createdAt: r.createdAt,
      }));

    return {
      review: {
        id: review.id,
        company: review.company,
        description: review.description,
        sections: review.sections,
        tags: review.tags,
        sources: review.sources,
        heatScore: review.heatScore,
        createdAt: review.createdAt,
        author: author ? { name: author.name } : null,
      },
      comments: enrichedComments,
      otherReviews: otherDistributed,
      likeCount: reviewComments.filter(c => c.isLike).length,
    };
  });

  // Guest comment
  app.post('/api/guest/:token/comments', async (request, reply) => {
    const { token } = request.params as { token: string };
    const reviewId = validateGuestToken(token);
    if (!reviewId) return reply.status(403).send({ error: '链接已失效' });

    const { content, guestName } = request.body as { content: string; guestName: string };
    const db = getDb();
    const id = nanoid();
    db.insert(comments).values({ id, reviewId, guestName: guestName || '游客', content }).run();
    return { id };
  });

  // Guest like
  app.post('/api/guest/:token/like', async (request, reply) => {
    const { token } = request.params as { token: string };
    const reviewId = validateGuestToken(token);
    if (!reviewId) return reply.status(403).send({ error: '链接已失效' });

    const { guestName } = request.body as { guestName?: string };
    const db = getDb();
    const id = nanoid();
    db.insert(comments).values({
      id, reviewId, guestName: guestName || '游客', content: '👍', isLike: true,
    }).run();
    return { success: true };
  });
}
