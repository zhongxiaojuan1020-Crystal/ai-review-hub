import { FastifyInstance } from 'fastify';
import { eq, desc } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { reviews, users, scores, config } from '../db/schema.js';

export async function rankingRoutes(app: FastifyInstance) {
  // Get heat-ranked reviews
  app.get('/api/ranking', { preValidation: [app.authenticate] }, async (request) => {
    const db = getDb();

    const completedReviews = db.select().from(reviews)
      .where(eq(reviews.status, 'completed'))
      .orderBy(desc(reviews.heatScore))
      .all();

    const allUsers = db.select().from(users).where(eq(users.isActive, true)).all();

    return completedReviews.map(review => {
      const author = allUsers.find(u => u.id === review.authorId);
      return {
        ...review,
        author: author ? { id: author.id, name: author.name, avatarUrl: author.avatarUrl, role: author.role } : null,
      };
    });
  });

  // Get ranking config
  app.get('/api/ranking/config', { preValidation: [app.authenticate] }, async () => {
    const db = getDb();
    const supShareRow = db.select().from(config).where(eq(config.key, 'supervisor_share')).get();
    return {
      supervisorShare: supShareRow?.value ?? 0.4,
    };
  });

  // Update ranking config (supervisor only)
  app.put('/api/ranking/config', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const body = request.body as { supervisorShare?: number };
    const db = getDb();

    if (body.supervisorShare !== undefined) {
      const clamped = Math.min(0.7, Math.max(0.1, body.supervisorShare));
      const existing = db.select().from(config).where(eq(config.key, 'supervisor_share')).get();
      if (existing) {
        db.update(config).set({ value: clamped as any, updatedAt: new Date().toISOString() })
          .where(eq(config.key, 'supervisor_share')).run();
      } else {
        db.insert(config).values({ key: 'supervisor_share', value: clamped as any }).run();
      }
    }

    return { success: true };
  });
}
