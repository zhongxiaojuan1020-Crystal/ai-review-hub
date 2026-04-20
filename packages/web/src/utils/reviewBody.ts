/**
 * Review body format helpers.
 *
 * Background
 * ──────────
 * The review data model used to be split: `description` (HTML) + `sections`
 * (array of `{title, content}`). As of batch C we unify everything into a
 * single `body` HTML string that embeds subtitles inline via
 * `<h3 class="section-title">`. This allows authors to freely interleave
 * paragraphs, images, and subtitles in one editor.
 *
 * These helpers make the migration painless:
 *   - `composeBodyFromLegacy(d, s)` converts legacy data → unified body HTML
 *   - `extractSectionTitles(body)` pulls `<h3 class="section-title">` titles
 *     back out so card previews can still show the numbered circle list
 *   - `getDisplayBody(review)` picks the right format for a given review
 */

export const SECTION_TITLE_CLASS = 'section-title';

/**
 * Stitch legacy `description` + `sections[]` into a single body HTML string.
 * Each section title becomes `<h3 class="section-title">…</h3>`, followed by
 * its content block.
 */
export function composeBodyFromLegacy(
  description: string | null | undefined,
  sections: Array<{ title?: string; content?: string }> | null | undefined
): string {
  const parts: string[] = [];
  const desc = (description || '').trim();
  if (desc) parts.push(desc);
  for (const sec of sections || []) {
    const title = (sec?.title || '').trim();
    const content = (sec?.content || '').trim();
    if (!title && !content) continue;
    if (title) {
      // If the title already contains HTML tags, strip the outer wrapping
      // block and re-wrap inside an <h3 class="section-title">; otherwise
      // treat as plain text.
      const inner = /<[^>]+>/.test(title) ? stripOuterBlock(title) : escapeHtml(title);
      parts.push(`<h3 class="${SECTION_TITLE_CLASS}">${inner}</h3>`);
    }
    if (content) parts.push(content);
  }
  return parts.join('\n');
}

/**
 * Extract the text of every `<h3 class="section-title">` subtitle in `body`.
 * Used by the review card preview to render the numbered circle list.
 */
export function extractSectionTitles(body: string | null | undefined): string[] {
  if (!body) return [];
  const titles: string[] = [];
  // Non-greedy match; strip inner tags to get plain text.
  const re = /<h3[^>]*class=(['"])([^'"]*)\1[^>]*>([\s\S]*?)<\/h3>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const classAttr = m[2] || '';
    if (!classAttr.split(/\s+/).includes(SECTION_TITLE_CLASS)) continue;
    const text = m[3].replace(/<[^>]+>/g, '').trim();
    if (text) titles.push(text);
  }
  return titles;
}

/**
 * Resolve a review to the best body-HTML string for display.
 *
 * Priority:
 *   1. New reviews: `review.body` is an HTML string (not JSON metadata)
 *   2. Legacy reviews: stitch `description` + `sections`
 *
 * Note: legacy `body` fields that happen to be JSON (e.g. `{"descriptionImages":...}`)
 * are ignored here — callers handle those via the old ContentRenderer path.
 */
export function getDisplayBody(review: {
  body?: string | null;
  description?: string | null;
  sections?: Array<{ title?: string; content?: string }> | null;
}): string {
  const body = review.body || '';
  if (body && !body.startsWith('{')) return body;
  return composeBodyFromLegacy(review.description, review.sections);
}

/** Is this review stored in the new unified `body` format? */
export function hasNewBody(review: { body?: string | null }): boolean {
  const b = review.body || '';
  return !!b && !b.startsWith('{');
}

// ─── Internals ─────────────────────────────────────────────────────────────

/**
 * For legacy titles that were HTML (e.g. "<p>观点一：xxx</p>"), drop the
 * outer block tag so it sits cleanly inside an <h3>. Keeps inline tags.
 */
function stripOuterBlock(html: string): string {
  const trimmed = html.trim();
  const m = trimmed.match(/^<(p|div|h[1-6])\b[^>]*>([\s\S]*)<\/\1>$/i);
  return m ? m[2] : trimmed;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
