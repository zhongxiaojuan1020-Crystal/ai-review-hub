import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { reviews } from '../db/schema.js';

/**
 * Public (no-auth) image endpoints so DingTalk can render images
 * via `![](https://domain/api/public/review-image/...)` markdown.
 *
 * Extracts base64 images stored in the review data and serves them
 * as binary with the correct Content-Type.
 */
function parseDataUri(dataUri: string): { mime: string; buffer: Buffer } | null {
  const match = dataUri.match(/^data:(image\/[^;]+);base64,(.+)$/);
  if (!match) return null;
  return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

export async function publicImageRoutes(app: FastifyInstance) {
  // Serve description images: /api/public/review-image/:reviewId/desc/:idx
  app.get('/api/public/review-image/:reviewId/desc/:idx', async (request, reply) => {
    const { reviewId, idx } = request.params as { reviewId: string; idx: string };
    const db = getDb();
    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send('Not found');

    let images: string[] = [];
    if (review.body && typeof review.body === 'string') {
      try {
        const parsed = JSON.parse(review.body);
        if (Array.isArray(parsed.descriptionImages)) images = parsed.descriptionImages;
      } catch { /* not JSON */ }
    }

    const imgData = images[parseInt(idx, 10)];
    if (!imgData) return reply.status(404).send('Image not found');

    const parsed = parseDataUri(imgData);
    if (!parsed) return reply.status(400).send('Invalid image data');

    reply.header('Content-Type', parsed.mime);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(parsed.buffer);
  });

  // Serve section images: /api/public/review-image/:reviewId/sec/:secIdx/:imgIdx
  app.get('/api/public/review-image/:reviewId/sec/:secIdx/:imgIdx', async (request, reply) => {
    const { reviewId, secIdx, imgIdx } = request.params as { reviewId: string; secIdx: string; imgIdx: string };
    const db = getDb();
    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send('Not found');

    const sections = (review.sections as any[]) || [];
    const section = sections[parseInt(secIdx, 10)];
    if (!section) return reply.status(404).send('Section not found');

    const images: string[] = Array.isArray(section.images) ? section.images : [];
    const imgData = images[parseInt(imgIdx, 10)];
    if (!imgData) return reply.status(404).send('Image not found');

    const parsed = parseDataUri(imgData);
    if (!parsed) return reply.status(400).send('Invalid image data');

    reply.header('Content-Type', parsed.mime);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(parsed.buffer);
  });
}
