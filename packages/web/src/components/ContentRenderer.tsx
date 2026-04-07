import React from 'react';

/**
 * Renders text content preserving line breaks and inline images.
 * Images are embedded in text as [[IMG:base64data]] markers.
 * Falls back to rendering legacy images[] array at the end if no markers found.
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
