import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { reviews } from '../db/schema.js';
import { generateGuestToken } from '../services/guest-token.js';
import { getConfig } from '../config.js';
import { sendDistributeNotification } from '../services/dingtalk.js';

export async function distributeRoutes(app: FastifyInstance) {
  // Distribute a single review (supervisor only)
  app.post('/api/distribute', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const { reviewId } = request.body as { reviewId: string };
    const db = getDb();

    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });
    if (review.status !== 'completed') return reply.status(400).send({ error: 'Review not completed yet' });

    // Generate guest token for the review
    const token = generateGuestToken(reviewId);
    const config = getConfig();
    const guestUrl = `${config.baseUrl}/guest/${token}`;

    // Mark as distributed
    db.update(reviews).set({
      distributed: true,
      distributedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(reviews.id, reviewId)).run();

    // Send DingTalk notification (async, don't block response)
    sendDistributeNotification({
      reviewTitle: review.company,
      description: typeof review.description === 'string' ? review.description : '',
      opinions: (review.sections as any[]).map((s: any) => s.title).filter(Boolean),
      tags: review.tags as string[],
      heatScore: review.heatScore,
      guestUrl,
    });

    return { success: true, guestUrl };
  });

  // Generate guest link for a review
  app.post('/api/reviews/:id/guest-link', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const { id } = request.params as { id: string };
    const token = generateGuestToken(id);
    const config = getConfig();
    return { url: `${config.baseUrl}/guest/${token}` };
  });

  // Distribution history
  app.get('/api/distribute/history', { preValidation: [app.authenticate] }, async () => {
    const db = getDb();
    return db.select().from(reviews)
      .where(eq(reviews.distributed, true))
      .all();
  });
}
