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

  // Serve body-HTML inline images (new unified editor format):
  // /api/public/review-image/:reviewId/body/:idx
  // Extracts the Nth base64 <img> from the body HTML and serves it as binary.
  app.get('/api/public/review-image/:reviewId/body/:idx', async (request, reply) => {
    const { reviewId, idx } = request.params as { reviewId: string; idx: string };
    const db = getDb();
    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send('Not found');

    const body: string = typeof review.body === 'string' ? review.body : '';
    if (!body || body.startsWith('{')) return reply.status(404).send('No body images');

    // Extract all data: URI src attributes from <img> tags in order.
    const images: string[] = [];
    const re = /<img\b[^>]*\bsrc=(['"])(data:[^'"]+)\1[^>]*>/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) images.push(m[2]);

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

  // ── Inline base64 images in legacy description HTML ─────────────────
  // /api/public/review-image/:reviewId/desc-inline/:idx
  // Extracts the Nth <img src="data:..."> embedded in the description field.
  // Needed for reviews published with the RichTextEditor where images are
  // stored as inline data-URIs inside the description HTML.
  app.get('/api/public/review-image/:reviewId/desc-inline/:idx', async (request, reply) => {
    const { reviewId, idx } = request.params as { reviewId: string; idx: string };
    const db = getDb();
    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send('Not found');

    const html = typeof review.description === 'string' ? review.description : '';
    const imgs = extractInlineDataUris(html);
    const imgData = imgs[parseInt(idx, 10)];
    if (!imgData) return reply.status(404).send('Image not found');

    const parsed = parseDataUri(imgData);
    if (!parsed) return reply.status(400).send('Invalid image data');

    reply.header('Content-Type', parsed.mime);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(parsed.buffer);
  });

  // ── Inline base64 images in legacy section content HTML ─────────────
  // /api/public/review-image/:reviewId/sec-inline/:secIdx/:imgIdx
  app.get('/api/public/review-image/:reviewId/sec-inline/:secIdx/:imgIdx', async (request, reply) => {
    const { reviewId, secIdx, imgIdx } = request.params as {
      reviewId: string; secIdx: string; imgIdx: string;
    };
    const db = getDb();
    const review = db.select().from(reviews).where(eq(reviews.id, reviewId)).get();
    if (!review) return reply.status(404).send('Not found');

    const sections = (review.sections as any[]) || [];
    const section = sections[parseInt(secIdx, 10)];
    if (!section) return reply.status(404).send('Section not found');

    const imgs = extractInlineDataUris(String(section.content || ''));
    const imgData = imgs[parseInt(imgIdx, 10)];
    if (!imgData) return reply.status(404).send('Image not found');

    const parsed = parseDataUri(imgData);
    if (!parsed) return reply.status(400).send('Invalid image data');

    reply.header('Content-Type', parsed.mime);
    reply.header('Cache-Control', 'public, max-age=86400');
    return reply.send(parsed.buffer);
  });
}

/** Extract all `<img src="data:...">` URIs from HTML in document order. */
function extractInlineDataUris(html: string): string[] {
  const out: string[] = [];
  if (!html) return out;
  const re = /<img\b[^>]*\bsrc=(['"])(data:[^'"]+)\1[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) out.push(m[2]);
  return out;
}
