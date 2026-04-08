import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';

const IS_PROD = process.env.NODE_ENV === 'production';

export async function authRoutes(app: FastifyInstance) {
  // Real password login (production + dev)
  app.post('/api/auth/login', async (request, reply) => {
    const { name, password } = request.body as { name: string; password: string };
    if (!name?.trim() || !password) {
      return reply.status(400).send({ error: '请输入姓名和密码' });
    }

    const db = getDb();
    const user = db.select().from(users)
      .where(eq(users.name, name.trim()))
      .get();

    if (!user || !user.isActive) {
      return reply.status(401).send({ error: '账号不存在或已停用' });
    }
    if (!user.passwordHash) {
      return reply.status(401).send({ error: '账号尚未设置密码，请联系主管' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: '密码错误' });
    }

    const token = app.jwt.sign({ id: user.id, role: user.role, name: user.name });
    return { token, user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl, role: user.role } };
  });

  // Dev-only: select a user to impersonate
  app.post('/api/auth/dev-login', async (request, reply) => {
    if (IS_PROD) return reply.status(403).send({ error: 'Disabled in production' });
    const { userId } = request.body as { userId: string };
    const db = getDb();
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return reply.status(404).send({ error: 'User not found' });
    const token = app.jwt.sign({ id: user.id, role: user.role, name: user.name });
    return { token, user: { id: user.id, name: user.name, avatarUrl: user.avatarUrl, role: user.role } };
  });

  // Change own password
  app.post('/api/auth/change-password', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { oldPassword, newPassword } = request.body as { oldPassword: string; newPassword: string };
    if (!oldPassword || !newPassword) {
      return reply.status(400).send({ error: '请输入旧密码和新密码' });
    }
    if (newPassword.length < 6) {
      return reply.status(400).send({ error: '新密码至少 6 位' });
    }
    const db = getDb();
    const userId = (request.user as any).id;
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user || !user.passwordHash) {
      return reply.status(404).send({ error: '用户不存在' });
    }
    const valid = await bcrypt.compare(oldPassword, user.passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: '旧密码错误' });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    db.update(users).set({ passwordHash: newHash }).where(eq(users.id, userId)).run();
    return { ok: true };
  });

  // Get current user info
  app.get('/api/auth/me', { preValidation: [app.authenticate] }, async (request) => {
    const db = getDb();
    const user = db.select().from(users).where(eq(users.id, (request.user as any).id)).get();
    if (!user) throw new Error('User not found');
    return { id: user.id, name: user.name, avatarUrl: user.avatarUrl, role: user.role };
  });

  // Dev-only: list users for picker
  app.get('/api/auth/users', async (request, reply) => {
    if (IS_PROD) return reply.status(403).send({ error: 'Disabled in production' });
    const db = getDb();
    return db.select({
      id: users.id, name: users.name,
      avatarUrl: users.avatarUrl, role: users.role,
    }).from(users).where(eq(users.isActive, true)).all();
  });
}
