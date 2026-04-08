import React from 'react';

/**
 * Render rich-text HTML body from the new editor.
 *
 * Since author content is trusted (internal team), we don't hard-sanitize,
 * but we do strip the most obviously dangerous tags (`<script>`, inline event
 * handlers) as a defense-in-depth measure.
 */
interface HtmlRendererProps {
  html: string;
  style?: React.CSSProperties;
}

function sanitize(html: string): string {
  return (html || '')
    // strip script tags and their content
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // strip on* event handler attributes
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '');
}

const HtmlRenderer: React.FC<HtmlRendererProps> = ({ html, style }) => {
  return (
    <div
      className="rich-body"
      style={{
        fontSize: 14,
        lineHeight: 1.9,
        color: '#333',
        ...style,
      }}
      dangerouslySetInnerHTML={{ __html: sanitize(html) }}
    />
  );
};

export default HtmlRenderer;
