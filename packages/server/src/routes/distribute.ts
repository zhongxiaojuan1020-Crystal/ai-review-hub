import { FastifyInstance, FastifyRequest } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { reviews, users, config as configTable } from '../db/schema.js';
import { generateGuestToken } from '../services/guest-token.js';
import { sendDistributeNotification, sendPublishReminderNotification } from '../services/dingtalk.js';

/**
 * Read the supervisor-configured DingTalk base URL override from DB.
 * If set, all DingTalk message links (action buttons + image URLs) use
 * this URL instead of the auto-resolved Railway/host URL. Useful when
 * DingTalk can reach an IP-based URL but not the public domain.
 */
function getDingTalkBaseUrlOverride(): string | null {
  const db = getDb();
  const row = db.select().from(configTable)
    .where(eq(configTable.key, 'dingtalk_base_url')).get();
  const val = (row?.value as string | undefined)?.trim();
  if (!val) return null;
  return val.replace(/\/$/, '');
}

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

    // Generate guest token for the review.
    // For DingTalk links/images, prefer supervisor-configured `dingtalk_base_url`
    // so messages can use an IP-based URL when the public domain is unreachable.
    const token = generateGuestToken(reviewId);
    const dtBaseOverride = getDingTalkBaseUrlOverride();
    const baseUrl = dtBaseOverride || resolvePublicBaseUrl(request);
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

    // Keep section images info (only counts, not base64 data) for image URL generation
    const sectionsForDt = ((review.sections as any[]) || []).map((s: any) => ({
      title: s.title || '',
      content: s.content || '',
      images: Array.isArray(s.images) ? s.images : [],
    }));

    // Extract description images from body JSON metadata
    let descriptionImages: string[] = [];
    if (!isHtmlBody && rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        if (Array.isArray(parsed.descriptionImages)) descriptionImages = parsed.descriptionImages;
      } catch { /* not JSON */ }
    }

    // Send DingTalk notification and surface any errcode/errmsg to the user
    const dtResult = await sendDistributeNotification({
      reviewTitle: review.company,
      authorName: author?.name || '',
      body: isHtmlBody ? rawBody : undefined,
      description: typeof review.description === 'string' ? review.description : '',
      descriptionImages,
      sections: sectionsForDt,
      tags: (review.tags as string[]) || [],
      heatScore: review.heatScore,
      guestUrl,
      reviewId,
      baseUrl,
    });

    return {
      success: true,
      guestUrl,
      dingtalk: dtResult, // { ok, errcode, errmsg, reason }
    };
  });

  // Generate guest link for a review — any authenticated member can generate one
  // (not just supervisors) so authors can share their review before scoring completes.
  app.post('/api/reviews/:id/guest-link', { preValidation: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const db = getDb();
    const review = db.select().from(reviews).where(eq(reviews.id, id)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });

    const token = generateGuestToken(id);
    const dtBase = getDingTalkBaseUrlOverride();
    const baseUrl = dtBase || resolvePublicBaseUrl(request);
    return { url: `${baseUrl}/guest/${token}` };
  });

  // Send a publish-reminder notification to the DingTalk group.
  // Available to: the review author OR a supervisor.
  // Links to the internal review page (requires login) so members can score.
  app.post('/api/reviews/:id/notify', { preValidation: [app.authenticate] }, async (request, reply) => {
    const currentUser = request.user as any;
    const { id } = request.params as { id: string };
    const db = getDb();

    const review = db.select().from(reviews).where(eq(reviews.id, id)).get();
    if (!review) return reply.status(404).send({ error: 'Review not found' });

    // Only the author or a supervisor may trigger the reminder
    const isAuthor = review.authorId === currentUser.userId || review.authorId === currentUser.id;
    const isSupervisor = currentUser.role === 'supervisor';
    if (!isAuthor && !isSupervisor) {
      return reply.status(403).send({ error: '只有作者或主管可以发送提醒' });
    }

    // Build the internal app URL (members need to log in to score)
    const dtBase = getDingTalkBaseUrlOverride();
    const baseUrl = dtBase || resolvePublicBaseUrl(request);
    const reviewUrl = `${baseUrl}/reviews/${id}`;

    // Use author name from DB, fall back to the current user's name
    const author = review.authorId
      ? db.select().from(users).where(eq(users.id, review.authorId)).get()
      : null;
    const authorName = author?.name || currentUser.name || '成员';

    const dtResult = await sendPublishReminderNotification({
      authorName,
      reviewTitle: review.company,
      reviewUrl,
    });

    return { success: true, dingtalk: dtResult };
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
    const dtBaseOverride = getDingTalkBaseUrlOverride();
    const baseUrl = dtBaseOverride || resolvePublicBaseUrl(request);
    const guestUrl = `${baseUrl}/guest/${token}`;

    const author = review.authorId
      ? db.select().from(users).where(eq(users.id, review.authorId)).get()
      : null;

    const rawBody = review.body || '';
    const isHtmlBody = rawBody && !rawBody.startsWith('{');
    const sectionsForDt = ((review.sections as any[]) || []).map((s: any) => ({
      title: s.title || '',
      content: s.content || '',
      images: Array.isArray(s.images) ? s.images : [],
    }));

    let descriptionImages: string[] = [];
    if (!isHtmlBody && rawBody) {
      try {
        const parsed = JSON.parse(rawBody);
        if (Array.isArray(parsed.descriptionImages)) descriptionImages = parsed.descriptionImages;
      } catch { /* not JSON */ }
    }

    const dtResult = await sendDistributeNotification({
      reviewTitle: review.company,
      authorName: author?.name || '',
      body: isHtmlBody ? rawBody : undefined,
      description: typeof review.description === 'string' ? review.description : '',
      descriptionImages,
      sections: sectionsForDt,
      tags: (review.tags as string[]) || [],
      heatScore: review.heatScore,
      guestUrl,
      reviewId: id,
      baseUrl,
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
