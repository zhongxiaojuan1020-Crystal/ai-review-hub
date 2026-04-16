import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { config } from '../db/schema.js';
import { sendTestNotification } from '../services/dingtalk.js';

const ALLOWED_KEYS = ['dingtalk_webhook', 'dingtalk_secret', 'dingtalk_base_url'] as const;

// ---- Custom tag storage (config key: 'custom_tags') -----------------------
// Stored as JSON string: Array<{ label: string; level: 'L1'|'L2'; parent?: string }>
interface CustomTag { label: string; level: 'L1' | 'L2'; parent?: string }

function loadCustomTags(): CustomTag[] {
  const db = getDb();
  const row = db.select().from(config).where(eq(config.key, 'custom_tags')).get();
  if (!row?.value) return [];
  try {
    const parsed = JSON.parse(row.value as string);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomTags(tags: CustomTag[]) {
  const db = getDb();
  const existing = db.select().from(config).where(eq(config.key, 'custom_tags')).get();
  const value = JSON.stringify(tags);
  if (existing) {
    db.update(config).set({ value, updatedAt: new Date().toISOString() })
      .where(eq(config.key, 'custom_tags')).run();
  } else {
    db.insert(config).values({ key: 'custom_tags', value }).run();
  }
}

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

  // ---------- Tags ----------
  // GET /api/tags — list user-custom tags (any logged-in user)
  app.get('/api/tags', { preValidation: [app.authenticate] }, async () => {
    return { customTags: loadCustomTags() };
  });

  // POST /api/tags — add a new custom tag (any logged-in user)
  app.post('/api/tags', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { label, level, parent } = request.body as { label?: string; level?: string; parent?: string };
    const trimmed = (label || '').trim();
    if (!trimmed) return reply.status(400).send({ error: '标签不能为空' });
    if (trimmed.length > 20) return reply.status(400).send({ error: '标签不能超过 20 字' });
    if (level !== 'L1' && level !== 'L2') {
      return reply.status(400).send({ error: '请指定 level: L1 或 L2' });
    }
    if (level === 'L2' && !parent) {
      return reply.status(400).send({ error: '二级标签必须指定一级标签' });
    }
    const existing = loadCustomTags();
    if (existing.some(t => t.label === trimmed)) {
      return reply.status(400).send({ error: '该标签已存在' });
    }
    const next: CustomTag[] = [
      ...existing,
      { label: trimmed, level, parent: level === 'L2' ? parent : undefined },
    ];
    saveCustomTags(next);
    return { customTags: next };
  });

  // POST /api/config/dingtalk/test — supervisor only
  // Send a small test message to verify webhook + sign secret config.
  app.post('/api/config/dingtalk/test', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });
    const result = await sendTestNotification();
    if (!result.ok) {
      return reply.status(400).send({
        ok: false,
        error: result.errmsg || result.reason || '发送失败',
        errcode: result.errcode,
      });
    }
    return { ok: true };
  });
}
