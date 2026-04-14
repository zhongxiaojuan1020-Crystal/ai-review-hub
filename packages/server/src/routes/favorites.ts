import { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { favorites, reviews, users, scores } from '../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function favoriteRoutes(app: FastifyInstance) {
  // GET /api/favorites/ids — return just the review IDs for fast hydration
  app.get(
    '/api/favorites/ids',
    { preValidation: [app.authenticate] },
    async (request) => {
      const db = getDb();
      const userId = (request.user as any).id;
      const rows = db.select({ reviewId: favorites.reviewId })
        .from(favorites)
        .where(eq(favorites.userId, userId))
        .all();
      return rows.map(r => r.reviewId);
    }
  );

  // GET /api/favorites — return full review objects that the user has favorited
  app.get(
    '/api/favorites',
    { preValidation: [app.authenticate] },
    async (request) => {
      const db = getDb();
      const userId = (request.user as any).id;

      const favRows = db.select({ reviewId: favorites.reviewId })
        .from(favorites)
        .where(eq(favorites.userId, userId))
        .all();

      if (favRows.length === 0) return [];

      const reviewIds = favRows.map(f => f.reviewId);
      const reviewRows = db.select().from(reviews)
        .where(inArray(reviews.id, reviewIds))
        .all();

      // Enrich with author info
      const allUserIds = [...new Set(reviewRows.map(r => r.authorId))];
      const authorRows = allUserIds.length > 0
        ? db.select().from(users).where(inArray(users.id, allUserIds)).all()
        : [];
      const authorMap = Object.fromEntries(authorRows.map(u => [u.id, u]));

      return reviewRows.map(r => ({
        ...r,
        author: authorMap[r.authorId] ? {
          id: authorMap[r.authorId].id,
          name: authorMap[r.authorId].name,
          avatarUrl: authorMap[r.authorId].avatarUrl,
        } : null,
        scoringProgress: { scorers: [] },
        hasUnresolvedRevision: false,
      }));
    }
  );

  // POST /api/favorites/:reviewId — add favorite
  app.post(
    '/api/favorites/:reviewId',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const db = getDb();
      const userId = (request.user as any).id;
      const { reviewId } = request.params as { reviewId: string };

      try {
        db.insert(favorites).values({
          id: randomUUID(),
          userId,
          reviewId,
          createdAt: new Date().toISOString(),
        }).run();
      } catch {
        // Already favorited — ignore unique constraint
      }

      return reply.status(200).send({ ok: true });
    }
  );

  // DELETE /api/favorites/:reviewId — remove favorite
  app.delete(
    '/api/favorites/:reviewId',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const db = getDb();
      const userId = (request.user as any).id;
      const { reviewId } = request.params as { reviewId: string };

      db.delete(favorites)
        .where(and(eq(favorites.userId, userId), eq(favorites.reviewId, reviewId)))
        .run();

      return reply.status(200).send({ ok: true });
    }
  );
}
