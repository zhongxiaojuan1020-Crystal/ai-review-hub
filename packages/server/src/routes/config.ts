import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { config } from '../db/schema.js';

const ALLOWED_KEYS = ['dingtalk_webhook'] as const;

export async function configRoutes(app: FastifyInstance) {
  // GET /api/config — supervisor only
  app.get('/api/config', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const db = getDb();
    const result: Record<string, any> = {};
    for (const key of ALLOWED_KEYS) {
      const row = db.select().from(config).where(eq(config.key, key)).get();
      result[key] = row?.value ?? '';
    }
    return result;
  });

  // PUT /api/config — supervisor only
  app.put('/api/config', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const body = request.body as Record<string, any>;
    const db = getDb();

    for (const key of ALLOWED_KEYS) {
      if (key in body) {
        const val = body[key];
        const existing = db.select().from(config).where(eq(config.key, key)).get();
        if (existing) {
          db.update(config).set({ value: val, updatedAt: new Date().toISOString() })
            .where(eq(config.key, key)).run();
        } else {
          db.insert(config).values({ key, value: val }).run();
        }
      }
    }

    return { success: true };
  });
}
