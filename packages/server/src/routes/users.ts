import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';
import { MAIN_DOMAINS } from '@ai-review/shared';

export async function userRoutes(app: FastifyInstance) {
  // List all team members (supervisor only)
  app.get('/api/users', { preValidation: [app.authenticate] }, async (request, reply) => {
    if ((request.user as any).role !== 'supervisor') {
      return reply.status(403).send({ error: 'Supervisor only' });
    }
    const db = getDb();
    return db.select({
      id: users.id,
      name: users.name,
      role: users.role,
      isActive: users.isActive,
      domainWeights: users.domainWeights,
      dingtalkUserId: users.dingtalkUserId,
      createdAt: users.createdAt,
    }).from(users).all();
  });

  // Add a new team member (supervisor only)
  app.post('/api/users', { preValidation: [app.authenticate] }, async (request, reply) => {
    if ((request.user as any).role !== 'supervisor') {
      return reply.status(403).send({ error: 'Supervisor only' });
    }
    const { name, dingtalkUserId, role = 'member', primaryDomain, secondaryDomain } = request.body as {
      name: string;
      dingtalkUserId: string;
      role?: 'member' | 'supervisor';
      primaryDomain?: string;
      secondaryDomain?: string;
    };

    if (!name?.trim() || !dingtalkUserId?.trim()) {
      return reply.status(400).send({ error: '姓名和钉钉账号不能为空' });
    }

    // Build domain weights from primary/secondary selections
    const domainWeights: Record<string, number> = {};
    for (const domain of MAIN_DOMAINS) {
      if (domain === primaryDomain) domainWeights[domain] = 1.0;
      else if (domain === secondaryDomain) domainWeights[domain] = 0.7;
      else domainWeights[domain] = 0.3;
    }

    const db = getDb();
    const id = `user_${nanoid(8)}`;
    try {
      db.insert(users).values({
        id,
        name: name.trim(),
        dingtalkUserId: dingtalkUserId.trim(),
        role,
        domainWeights,
      }).run();
    } catch (e: any) {
      if (e.message?.includes('UNIQUE')) {
        return reply.status(400).send({ error: '该钉钉账号已存在' });
      }
      throw e;
    }

    return { id, name, role, domainWeights };
  });

  // Set / reset a member's password (supervisor only)
  app.put('/api/users/:id/password', { preValidation: [app.authenticate] }, async (request, reply) => {
    if ((request.user as any).role !== 'supervisor') {
      return reply.status(403).send({ error: 'Supervisor only' });
    }
    const { id } = request.params as { id: string };
    const { password } = request.body as { password: string };
    if (!password || password.length < 6) {
      return reply.status(400).send({ error: '密码至少6位' });
    }
    const db = getDb();
    const hash = await bcrypt.hash(password, 10);
    db.update(users).set({ passwordHash: hash } as any).where(eq(users.id, id)).run();
    return { success: true };
  });

  // Toggle member active status (supervisor only)
  app.put('/api/users/:id/toggle', { preValidation: [app.authenticate] }, async (request, reply) => {
    if ((request.user as any).role !== 'supervisor') {
      return reply.status(403).send({ error: 'Supervisor only' });
    }
    const { id } = request.params as { id: string };
    const db = getDb();
    const user = db.select().from(users).where(eq(users.id, id)).get();
    if (!user) return reply.status(404).send({ error: 'User not found' });

    db.update(users).set({ isActive: !user.isActive }).where(eq(users.id, id)).run();
    return { success: true, isActive: !user.isActive };
  });
}
