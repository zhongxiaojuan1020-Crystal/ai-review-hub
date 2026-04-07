import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDb } from '../db/index.js';
import { comments, reviews } from '../db/schema.js';

export async function commentRoutes(app: FastifyInstance) {
  // List comments for a review
  app.get('/api/reviews/:reviewId/comments', { preValidation: [app.authenticate] }, async (request) => {
    const { reviewId } = request.params as { reviewId: string };
    const db = getDb();
    return db.select().from(comments).where(eq(comments.reviewId, reviewId)).all();
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
}
