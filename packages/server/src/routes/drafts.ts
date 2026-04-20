import { FastifyInstance } from 'fastify';
import { getDb } from '../db/index.js';
import { drafts } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';

export async function draftRoutes(app: FastifyInstance) {
  // GET /api/drafts — list all drafts belonging to the current user
  // (used by "My Drafts" tab on the profile page).
  app.get(
    '/api/drafts',
    { preValidation: [app.authenticate] },
    async (request) => {
      const db = getDb();
      const userId = (request.user as any).id;
      const rows = await db.query.drafts.findMany({
        where: eq(drafts.userId, userId),
      });
      // Sort newest-first so the profile list shows recent work up top.
      return rows
        .slice()
        .sort((a: any, b: any) => String(b.savedAt).localeCompare(String(a.savedAt)));
    }
  );

  // GET /api/drafts/:draftKey — load user's draft
  app.get(
    '/api/drafts/:draftKey',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const db = getDb();
      const { draftKey } = request.params as { draftKey: string };
      const userId = (request.user as any).id;

      const row = await db.query.drafts.findFirst({
        where: and(eq(drafts.userId, userId), eq(drafts.draftKey, draftKey)),
      });
      if (!row) return reply.status(204).send();
      return row;
    }
  );

  // PUT /api/drafts/:draftKey — upsert draft
  app.put(
    '/api/drafts/:draftKey',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const db = getDb();
      const { draftKey } = request.params as { draftKey: string };
      const userId = (request.user as any).id;
      const { company, body, tags, sources } = request.body as any;

      const existing = await db.query.drafts.findFirst({
        where: and(eq(drafts.userId, userId), eq(drafts.draftKey, draftKey)),
      });

      if (existing) {
        db.update(drafts)
          .set({ company, body, tags, sources, savedAt: new Date().toISOString() })
          .where(and(eq(drafts.userId, userId), eq(drafts.draftKey, draftKey)))
          .run();
      } else {
        db.insert(drafts).values({
          id: randomUUID(),
          userId,
          draftKey,
          company,
          body,
          tags,
          sources,
          savedAt: new Date().toISOString(),
        }).run();
      }

      return reply.status(200).send({ ok: true });
    }
  );

  // DELETE /api/drafts/:draftKey — discard draft
  app.delete(
    '/api/drafts/:draftKey',
    { preValidation: [app.authenticate] },
    async (request, reply) => {
      const db = getDb();
      const { draftKey } = request.params as { draftKey: string };
      const userId = (request.user as any).id;

      db.delete(drafts)
        .where(and(eq(drafts.userId, userId), eq(drafts.draftKey, draftKey)))
        .run();

      return reply.status(200).send({ ok: true });
    }
  );
}
