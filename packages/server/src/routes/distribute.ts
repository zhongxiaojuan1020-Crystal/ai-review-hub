import { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { reviews, users } from '../db/schema.js';
import { generateGuestToken } from '../services/guest-token.js';
import { sendDistributeNotification } from '../services/dingtalk.js';

/**
 * Resolve the public-facing base URL for links sent out to external users.
 *
 * Priority order:
 *   1) BASE_URL env var (explicit override)
 *   2) RAILWAY_PUBLIC_DOMAIN env var (Railway auto-injects this)
 *   3) Request headers (x-forwarded-host / host)
 *   4) localhost fallback (dev only)
 *
 * This fixes the case where an operator distributes from a Railway deployment
 * without setting BASE_URL and the DingTalk card points to localhost.
 */
function resolvePublicBaseUrl(request: FastifyRequest): string {
  const envBase = process.env.BASE_URL;
  if (envBase && !envBase.includes('localhost')) return envBase.replace(/\/$/, '');

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN;
  if (railwayDomain) return `https://${railwayDomain}`;

  const fwdHost = request.headers['x-forwarded-host'];
  const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) || request.headers.host;
  if (host) {
    const fwdProto = request.headers['x-forwarded-proto'];
    const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto)
      || (host.includes('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }

  return envBase || 'http://localhost:3000';
}

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
    const baseUrl = resolvePublicBaseUrl(request);
    const guestUrl = `${baseUrl}/guest/${token}`;

    // Look up the author for the card byline
    const author = review.authorId
      ? db.select().from(users).where(eq(users.id, review.authorId)).get()
      : null;

    // Mark as distributed
    db.update(reviews).set({
      distributed: true,
      distributedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }).where(eq(reviews.id, reviewId)).run();

    // Determine if body is real HTML or JSON metadata (descriptionImages).
    // JSON metadata starts with '{' and must not be sent as HTML content.
    const rawBody = review.body || '';
    const isHtmlBody = rawBody && !rawBody.startsWith('{');

    // Strip images arrays from sections — they are base64 and would blow the 20KB limit
    const sectionsForDt = ((review.sections as any[]) || []).map((s: any) => ({
      title: s.title || '',
      content: s.content || '',
    }));

    // Send DingTalk notification and surface any errcode/errmsg to the user
    const dtResult = await sendDistributeNotification({
      reviewTitle: review.company,
      authorName: author?.name || '',
      body: isHtmlBody ? rawBody : undefined,
      description: typeof review.description === 'string' ? review.description : '',
      sections: sectionsForDt,
      tags: (review.tags as string[]) || [],
      heatScore: review.heatScore,
      guestUrl,
    });

    return {
      success: true,
      guestUrl,
      dingtalk: dtResult, // { ok, errcode, errmsg, reason }
    };
  });

  // Generate guest link for a review
  app.post('/api/reviews/:id/guest-link', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const { id } = request.params as { id: string };
    const token = generateGuestToken(id);
    const baseUrl = resolvePublicBaseUrl(request);
    return { url: `${baseUrl}/guest/${token}` };
  });

  // Re-push an already-distributed review to DingTalk (supervisor only)
  app.post('/api/reviews/:id/repush', { preValidation: [app.authenticate] }, async (request, reply) => {
    const userRole = (request.user as any).role;
    if (userRole !== 'supervisor') return reply.status(403).send({ error: 'Supervisor only' });

    const { id } = request.params as { id: string };
    const db = getDb();

    const review = db.select().from(reviews).where(eq(reviews.id, id)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });
    if (!review.distributed) return reply.status(400).send({ error: 'Review has not been distributed yet' });

    // Generate a fresh guest token for the new push
    const token = generateGuestToken(id);
    const baseUrl = resolvePublicBaseUrl(request);
    const guestUrl = `${baseUrl}/guest/${token}`;

    const author = review.authorId
      ? db.select().from(users).where(eq(users.id, review.authorId)).get()
      : null;

    const rawBody = review.body || '';
    const isHtmlBody = rawBody && !rawBody.startsWith('{');
    const sectionsForDt = ((review.sections as any[]) || []).map((s: any) => ({
      title: s.title || '',
      content: s.content || '',
    }));

    const dtResult = await sendDistributeNotification({
      reviewTitle: review.company,
      authorName: author?.name || '',
      body: isHtmlBody ? rawBody : undefined,
      description: typeof review.description === 'string' ? review.description : '',
      sections: sectionsForDt,
      tags: (review.tags as string[]) || [],
      heatScore: review.heatScore,
      guestUrl,
    });

    return { success: true, guestUrl, dingtalk: dtResult };
  });

  // Distribution history
  app.get('/api/distribute/history', { preValidation: [app.authenticate] }, async () => {
    const db = getDb();
    return db.select().from(reviews)
      .where(eq(reviews.distributed, true))
      .all();
  });
}
