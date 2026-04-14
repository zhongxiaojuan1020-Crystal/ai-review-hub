import React from 'react';

/**
 * Strip `<script>` tags & on* event-handler attributes (defence-in-depth).
 */
function sanitize(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

/**
 * Detect whether a string contains HTML markup (vs plain text).
 * Matches common tags produced by the RichEditor.
 */
function isHtml(text: string): boolean {
  return /<(?:p|br|ul|ol|li|img|h[1-6]|div|span|strong|em|b|i|u|a|blockquote|table)\b/i.test(text);
}

/**
 * Renders review content — intelligently handles both:
 * 1. **HTML content** (new RichEditor): rendered via dangerouslySetInnerHTML
 * 2. **Plain-text content** (legacy): preserves line breaks + [[IMG:...]] markers
 *
 * Also renders legacy `images[]` array if no inline markers found.
 */
export function ContentRenderer({
  content,
  legacyImages,
  style,
}: {
  content: string;
  legacyImages?: string[];
  style?: React.CSSProperties;
}) {
  if (!content) return null;

  // ── HTML content from RichEditor ──────────────────────────────
  if (isHtml(content)) {
    return (
      <div
        className="rich-body"
        style={{
          fontSize: 14,
          lineHeight: 1.9,
          color: '#333',
          ...style,
        }}
        dangerouslySetInnerHTML={{ __html: sanitize(content) }}
      />
    );
  }

  // ── Legacy plain-text with optional [[IMG:...]] markers ───────
  const parts = content.split(/(\[\[IMG:[^\]]*?\]\])/);
  const hasInlineImages = parts.some(p => p.startsWith('[[IMG:'));

  return (
    <div style={style}>
      {parts.map((part, i) => {
        const imgMatch = part.match(/^\[\[IMG:([\s\S]*?)\]\]$/);
        if (imgMatch) {
          return (
            <img
              key={i}
              src={imgMatch[1]}
              alt=""
              style={{ maxWidth: '100%', borderRadius: 6, margin: '8px 0', display: 'block' }}
            />
          );
        }
        return (
          <span key={i} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>
            {part}
          </span>
        );
      })}

      {/* Backward compat: if no inline markers but has legacy images[], show at end */}
      {!hasInlineImages && legacyImages && legacyImages.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {legacyImages.map((img, i) => (
            <img key={i} src={img} alt="" style={{ maxWidth: '100%', borderRadius: 6 }} />
          ))}
        </div>
      )}
    </div>
  );
}
