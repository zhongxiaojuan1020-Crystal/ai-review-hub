/**
 * One-shot, idempotent data migration: normalize every legacy review so that
 * its full content lives in the unified `body` HTML field. Runs on server
 * startup — re-running is a no-op once all rows are migrated.
 *
 * Legacy shapes this handles:
 *   - body = null / '' and description+sections populated (original schema)
 *   - body = '{"descriptionImages":[...]}' JSON metadata (interim shape)
 *
 * After migration:
 *   - reviews.body    = unified HTML (inline <h3 class="section-title">,
 *                      inline <img src="data:..."> for legacy images)
 *   - reviews.description = ''
 *   - reviews.sections    = []
 *
 * This lets every future renderer / editor speak a single format, and means
 * UI changes only ever need to handle the new shape.
 */
import Database from 'better-sqlite3';
import { composeBodyFromLegacy, hasNewBody, extractLegacyDescriptionImages } from '../utils/compose-body.js';

interface ReviewRow {
  id: string;
  description: string | null;
  body: string | null;
  sections: string | null;
}

export function migrateReviewsToUnifiedBody(sqlite: Database.Database): void {
  const rows = sqlite.prepare(
    `SELECT id, description, body, sections FROM reviews`
  ).all() as ReviewRow[];

  const update = sqlite.prepare(
    `UPDATE reviews SET body = ?, description = '', sections = '[]', updated_at = datetime('now') WHERE id = ?`
  );

  let migrated = 0;
  let skipped = 0;
  const tx = sqlite.transaction((reviews: ReviewRow[]) => {
    for (const r of reviews) {
      // Already in new format — leave alone.
      if (hasNewBody(r.body)) { skipped++; continue; }

      let sections: Array<{ title?: string; content?: string; images?: string[] }> = [];
      try {
        const parsed = r.sections ? JSON.parse(r.sections) : [];
        if (Array.isArray(parsed)) sections = parsed;
      } catch { /* treat as empty */ }

      const descriptionImages = extractLegacyDescriptionImages(r.body);

      const newBody = composeBodyFromLegacy(r.description, sections, descriptionImages).trim();

      // If absolutely nothing to migrate (empty desc, no sections, no imgs),
      // still flip body to '' and clear sections/desc so the row has a
      // canonical shape. Record this as migrated either way.
      update.run(newBody, r.id);
      migrated++;
    }
  });
  tx(rows);

  console.log(`[migrate-reviews-to-body] migrated=${migrated} already_migrated=${skipped} total=${rows.length}`);
}
