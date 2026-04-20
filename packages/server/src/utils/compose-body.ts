/**
 * Server-side utility for converting legacy review storage
 * (description HTML + sections[] + descriptionImages[] + section.images[])
 * into the unified `body` HTML format used by the new editor.
 *
 * Mirrors `packages/web/src/utils/reviewBody.ts#composeBodyFromLegacy`, but
 * additionally inlines base64 images as `<img>` tags so a single `body` HTML
 * string is fully self-contained — exactly what the new editor produces.
 */

export const SECTION_TITLE_CLASS = 'section-title';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function stripOuterBlock(html: string): string {
  const trimmed = html.trim();
  const m = trimmed.match(/^<(p|div|h[1-6])\b[^>]*>([\s\S]*)<\/\1>$/i);
  return m ? m[2] : trimmed;
}

function imgTag(src: string): string {
  return `<p><img src="${src}" /></p>`;
}

/**
 * Compose legacy review data into the unified `body` HTML.
 *
 * @param description Legacy description HTML (or plain text)
 * @param sections    Legacy sections with optional inline images
 * @param descriptionImages Top-level description images (data URIs) — pulled
 *                    from the old `body` JSON's `descriptionImages` field.
 */
export function composeBodyFromLegacy(
  description: string | null | undefined,
  sections: Array<{ title?: string; content?: string; images?: string[] }> | null | undefined,
  descriptionImages?: string[] | null,
): string {
  const parts: string[] = [];

  const desc = (description || '').trim();
  if (desc) parts.push(desc);

  for (const img of descriptionImages || []) {
    if (img) parts.push(imgTag(img));
  }

  for (const sec of sections || []) {
    const title = (sec?.title || '').trim();
    const content = (sec?.content || '').trim();
    const images = Array.isArray(sec?.images) ? sec!.images! : [];
    if (!title && !content && images.length === 0) continue;

    if (title) {
      const inner = /<[^>]+>/.test(title) ? stripOuterBlock(title) : escapeHtml(title);
      parts.push(`<h3 class="${SECTION_TITLE_CLASS}">${inner}</h3>`);
    }
    if (content) parts.push(content);
    for (const img of images) {
      if (img) parts.push(imgTag(img));
    }
  }
  return parts.join('\n');
}

/** Does this review already use the new unified body format? */
export function hasNewBody(body: string | null | undefined): boolean {
  const b = (body || '').trim();
  return !!b && !b.startsWith('{');
}

/**
 * Extract `descriptionImages` from a legacy body JSON blob.
 * Returns [] if body is null, empty, non-JSON, or not the legacy shape.
 */
export function extractLegacyDescriptionImages(body: string | null | undefined): string[] {
  const raw = (body || '').trim();
  if (!raw || !raw.startsWith('{')) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.descriptionImages) ? parsed.descriptionImages : [];
  } catch {
    return [];
  }
}
