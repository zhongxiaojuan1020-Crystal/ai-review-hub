import React, { useCallback, useRef, useEffect } from 'react';
import { useEditor, EditorContent, Extension, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import ImageExt from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Button, Dropdown, Popover, Tooltip } from 'antd';
import type { MenuProps } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, StrikethroughOutlined,
  AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
  UnorderedListOutlined, OrderedListOutlined, PictureOutlined,
} from '@ant-design/icons';
import './RichTextEditor.css';

// ─── Font Size Extension ─────────────────────────────────────────────────────
// Adds fontSize attribute to TextStyle marks so we can set arbitrary px sizes.
const FontSizeExtension = Extension.create({
  name: 'fontSize',
  addGlobalAttributes() {
    return [{
      types: ['textStyle'],
      attributes: {
        fontSize: {
          default: null,
          parseHTML: (el: HTMLElement) => el.style.fontSize || null,
          renderHTML: (attrs: Record<string, any>) =>
            attrs.fontSize ? { style: `font-size: ${attrs.fontSize}` } : {},
        },
      },
    }];
  },
});

// ─── Custom Inline Image Extension ──────────────────────────────────────────
// Extends the default Image node to be inline (so medium/small images can
// appear side-by-side) and carries a `size` attribute (large/medium/small).
const CustomImage = ImageExt.extend({
  inline: true,
  group: 'inline',
  addAttributes() {
    return {
      ...this.parent?.(),
      size: {
        default: 'large',
        parseHTML: (el: HTMLElement) => {
          const cls = el.className || '';
          if (cls.includes('img-size-small')) return 'small';
          if (cls.includes('img-size-medium')) return 'medium';
          return 'large';
        },
        renderHTML: (attrs: Record<string, any>) => ({
          class: `img-size-${attrs.size || 'large'}`,
        }),
      },
    };
  },
});

// ─── Paste helpers ───────────────────────────────────────────────────────────

// Bullet-like characters at the very start (after optional whitespace).
const BULLET_RE = /^[\s\u00A0]*[•●▪▸▶►·・○◆■◦‣⁃∙]/;

// Tags whose content is just passed through — they're not part of TipTap's
// schema but their children usually are. Found in WeChat / DingTalk / Notion
// exports as structural wrappers.
const UNWRAP_TAGS = [
  'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
  'figure', 'figcaption', 'div', 'font', 'o:p',
];

// Strip font-family / font-size / line-height from any element with a style
// attr. We keep color / background / text-decoration etc.
function stripFontStylesOnEl(el: Element) {
  const style = el.getAttribute('style') || '';
  if (!style) return;
  const cleaned = style
    .split(';')
    .map((d) => d.trim())
    .filter((d) => {
      if (!d) return false;
      const lc = d.toLowerCase();
      return !lc.startsWith('font-family')
          && !lc.startsWith('font-size')
          && !lc.startsWith('line-height')
          && !lc.startsWith('font:');
    })
    .join('; ');
  if (cleaned) el.setAttribute('style', cleaned);
  else el.removeAttribute('style');
}

// Walk first non-empty text node under `node` and strip leading bullet char.
function stripBulletFromFirstText(node: Node) {
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  let t = walker.nextNode();
  while (t) {
    const text = t.textContent || '';
    if (text.trim()) {
      t.textContent = text.replace(/^[\s\u00A0]*[•●▪▸▶►·・○◆■◦‣⁃∙][\s\u00A0]*/, '');
      return;
    }
    t = walker.nextNode();
  }
}

// Normalize clipboard HTML so TipTap's schema-based parser preserves more of
// the source. Handles:
//  - Unknown wrappers (<section>, <div>, <font>, etc.) — unwrapped
//  - Inline font-family / font-size / line-height — stripped
//  - Paragraphs whose text starts with bullet chars — wrapped into <ul><li>
//  - Orphan <li> elements — grouped into <ul>
function normalizePastedHTML(html: string): string {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<div id="__root">${html}</div>`, 'text/html');
  } catch {
    return html;
  }
  const root = doc.getElementById('__root');
  if (!root) return html;

  // ① Unwrap structural wrappers repeatedly until none remain.
  const unwrapOnce = () => {
    let did = false;
    for (const tag of UNWRAP_TAGS) {
      const els = Array.from(root.getElementsByTagName(tag));
      for (const el of els) {
        const parent = el.parentNode;
        if (!parent) continue;
        while (el.firstChild) parent.insertBefore(el.firstChild, el);
        parent.removeChild(el);
        did = true;
      }
    }
    return did;
  };
  let guard = 0;
  while (unwrapOnce() && guard++ < 10) { /* keep unwrapping nested wrappers */ }

  // ② Strip font-family/size/line-height from every [style] element
  for (const el of Array.from(root.querySelectorAll('[style]'))) {
    stripFontStylesOnEl(el);
  }

  // ③ Convert direct children whose text starts with a bullet char into <li>
  //    inside a contiguous <ul>.
  const children = Array.from(root.children);
  let currentList: HTMLUListElement | null = null;
  for (const child of children) {
    const txt = (child.textContent || '').trim();
    const isBullet = BULLET_RE.test(txt);
    if (isBullet) {
      stripBulletFromFirstText(child);
      const li = doc.createElement('li');
      // Wrap inner content in <p> so TipTap's <li> schema (which expects
      // block children) accepts it cleanly.
      const p = doc.createElement('p');
      while (child.firstChild) p.appendChild(child.firstChild);
      li.appendChild(p);
      if (!currentList) {
        currentList = doc.createElement('ul');
        child.parentNode?.insertBefore(currentList, child);
      }
      currentList.appendChild(li);
      child.remove();
    } else {
      currentList = null;
    }
  }

  // ④ Wrap orphan <li> elements (those whose parent is not <ul>/<ol>)
  //    into a <ul>. Group consecutive orphans together.
  const orphanLis = Array.from(root.querySelectorAll('li')).filter((li) => {
    const p = li.parentNode as Element | null;
    return !p || (p.nodeName !== 'UL' && p.nodeName !== 'OL');
  });
  const groups: HTMLLIElement[][] = [];
  for (const li of orphanLis) {
    const last = groups[groups.length - 1];
    if (last && last[last.length - 1].nextElementSibling === li) {
      last.push(li as HTMLLIElement);
    } else {
      groups.push([li as HTMLLIElement]);
    }
  }
  for (const group of groups) {
    const ul = doc.createElement('ul');
    group[0].parentNode?.insertBefore(ul, group[0]);
    for (const li of group) ul.appendChild(li);
  }

  return root.innerHTML;
}

// ─── Constants ───────────────────────────────────────────────────────────────
const FONT_SIZES = ['12px', '13px', '14px', '15px', '16px', '18px', '20px', '24px'];

const PRESET_COLORS = [
  '#000000', '#434343', '#666666',
  '#cc0000', '#e06c00', '#d4a017',
  '#0b6e0b', '#1155cc', '#6600cc',
  '#cc0099', '#ffffff',
];

// ─── Sub-components ──────────────────────────────────────────────────────────
const ToolBtn: React.FC<{
  icon: React.ReactNode;
  title: string;
  active?: boolean;
  onClick: () => void;
}> = ({ icon, title, active, onClick }) => (
  <Tooltip title={title} mouseEnterDelay={0.8}>
    <Button
      type="text"
      size="small"
      onClick={onClick}
      style={{
        width: 28, height: 28, padding: 0,
        color: active ? '#ff6900' : '#555',
        background: active ? '#fff3e6' : 'transparent',
        border: 'none',
        borderRadius: 4,
      }}
    >
      {icon}
    </Button>
  </Tooltip>
);

const TDivider = () => (
  <div style={{ width: 1, height: 18, background: '#e8e8e8', margin: '0 4px', flexShrink: 0 }} />
);

// ─── Props ───────────────────────────────────────────────────────────────────
export interface RichTextEditorProps {
  /** Initial HTML content (uncontrolled — change `key` to reset from outside). */
  initialContent?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  /** If false, hides the image-insert button and bullet/ordered list buttons. */
  allowImages?: boolean;
}

// ─── Component ───────────────────────────────────────────────────────────────
const RichTextEditor: React.FC<RichTextEditorProps> = ({
  initialContent = '',
  onChange,
  placeholder = '在此输入内容...',
  minHeight = 100,
  allowImages = true,
}) => {
  const fileInputRefs = useRef<{ large: HTMLInputElement | null; medium: HTMLInputElement | null; small: HTMLInputElement | null }>({
    large: null, medium: null, small: null,
  });

  // Ref held separately so editorProps.handlePaste (baked in at init time)
  // can always reach the latest editor instance.
  const editorRef = useRef<Editor | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false }),
      UnderlineExt,
      TextAlign.configure({ types: ['paragraph'] }),
      TextStyle,
      FontSizeExtension,
      Color,
      ...(allowImages ? [CustomImage] : []),
      Placeholder.configure({ placeholder }),
    ],
    content: initialContent,
    onUpdate({ editor }) {
      onChange?.(editor.getHTML());
    },
    editorProps: {
      // Intercept paste: if the clipboard only has an image (e.g. screenshot),
      // convert it to a base64 <img> and insert at cursor. Otherwise let the
      // default HTML/text paste flow proceed.
      handlePaste(_view, event) {
        const cb = event.clipboardData;
        if (!cb) return false;
        const hasHtml = !!cb.getData('text/html')?.trim();
        const hasText = !!cb.getData('text/plain')?.trim();
        if (hasHtml || hasText) return false;
        const items = Array.from(cb.items || []);
        const imgItem = items.find(i => i.type.startsWith('image/'));
        if (!imgItem) return false;
        const file = imgItem.getAsFile();
        if (!file) return false;
        event.preventDefault();
        const reader = new FileReader();
        reader.onload = (ev) => {
          const src = ev.target?.result as string;
          if (editorRef.current && allowImages) {
            // Insert and then select the image so the size toolbar shows up
            // immediately — user can switch 大/中/小 right away.
            const ed = editorRef.current;
            ed.chain().focus().setImage({ src, size: 'large' } as any).run();
            // Move selection back onto the just-inserted image node.
            const pos = ed.state.selection.from - 1;
            if (pos >= 0) {
              try { ed.commands.setNodeSelection(pos); } catch { /* no-op */ }
            }
          }
        };
        reader.readAsDataURL(file);
        return true;
      },
      // Normalize HTML before ProseMirror parses it: preserves more of the
      // source formatting (colors/lists/images) from WeChat/DingTalk etc.
      transformPastedHTML(html) {
        const out = normalizePastedHTML(html);
        // Debug log — open DevTools > Console to inspect what clipboard gave us
        // and what we hand to ProseMirror. Helps trace lost content.
        try {
          console.log('%c[Paste IN ]', 'color:#1677ff;font-weight:bold', html);
          console.log('%c[Paste OUT]', 'color:#ff6900;font-weight:bold', out);
        } catch { /* ignore */ }
        return out;
      },
    },
  });

  // Keep editorRef in sync for handlePaste to use
  useEffect(() => { editorRef.current = editor; }, [editor]);

  const setFontSize = useCallback((size: string) => {
    editor?.chain().focus().setMark('textStyle', { fontSize: size } as any).run();
  }, [editor]);

  const setColor = useCallback((color: string | null) => {
    if (!color) {
      editor?.chain().focus().unsetColor().run();
    } else {
      editor?.chain().focus().setColor(color).run();
    }
  }, [editor]);

  const insertImage = useCallback((size: 'large' | 'medium' | 'small', file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      editor?.chain().focus().setImage({ src, size } as any).run();
    };
    reader.readAsDataURL(file);
  }, [editor]);

  const triggerFileInput = useCallback((size: 'large' | 'medium' | 'small') => {
    const el = fileInputRefs.current[size];
    if (el) { el.value = ''; el.click(); }
  }, []);

  if (!editor) return null;

  const activeColor = editor.getAttributes('textStyle').color as string | undefined;
  const activeFontSize = (editor.getAttributes('textStyle') as any).fontSize as string | undefined;
  const isImageSelected = editor.isActive('image');
  const activeImageSize = (editor.getAttributes('image') as any)?.size as string | undefined;

  // Change size of the currently selected image (works for uploads, pastes, etc.)
  const setImageSize = (size: 'large' | 'medium' | 'small') => {
    editor.chain().focus().updateAttributes('image', { size }).run();
  };

  // ── Dropdown menus ──
  const fontSizeItems: MenuProps['items'] = FONT_SIZES.map(size => ({
    key: size,
    label: <span style={{ fontSize: size }}>{size.replace('px', '')} px</span>,
    onClick: () => setFontSize(size),
  }));

  const imageMenuItems: MenuProps['items'] = [
    {
      key: 'large',
      label: <span><PictureOutlined /> 大图（全宽）</span>,
      onClick: () => triggerFileInput('large'),
    },
    {
      key: 'medium',
      label: <span><PictureOutlined /> 中图（1/2 宽，两张并排）</span>,
      onClick: () => triggerFileInput('medium'),
    },
    {
      key: 'small',
      label: <span><PictureOutlined /> 小图（1/3 宽，三张并排）</span>,
      onClick: () => triggerFileInput('small'),
    },
  ];

  // ── Color picker ──
  const colorPicker = (
    <div style={{ width: 168 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
        {PRESET_COLORS.map(c => (
          <div
            key={c}
            onClick={() => setColor(c)}
            title={c}
            style={{
              width: 22, height: 22, borderRadius: 4, cursor: 'pointer',
              background: c,
              border: c === activeColor
                ? '2px solid #ff6900'
                : c === '#ffffff' ? '1px solid #d9d9d9' : '1px solid transparent',
              boxSizing: 'border-box',
              transition: 'transform 0.1s',
            }}
            onMouseOver={e => (e.currentTarget.style.transform = 'scale(1.2)')}
            onMouseOut={e => (e.currentTarget.style.transform = 'scale(1)')}
          />
        ))}
      </div>
      <div
        onClick={() => setColor(null)}
        style={{
          fontSize: 12, color: '#888', cursor: 'pointer', textAlign: 'center',
          padding: '3px 0', borderTop: '1px solid #f0f0f0',
        }}
      >
        移除颜色
      </div>
    </div>
  );

  return (
    <div className="rich-editor-wrapper">
      {/* ── Toolbar ── */}
      <div className="rich-editor-toolbar">
        {/* Formatting */}
        <ToolBtn icon={<BoldOutlined />} title="加粗 (Ctrl+B)"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()} />
        <ToolBtn icon={<ItalicOutlined />} title="斜体 (Ctrl+I)"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()} />
        <ToolBtn icon={<UnderlineOutlined />} title="下划线 (Ctrl+U)"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()} />
        <ToolBtn icon={<StrikethroughOutlined />} title="删除线"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()} />

        <TDivider />

        {/* Font size */}
        <Dropdown menu={{ items: fontSizeItems }} trigger={['click']}>
          <Tooltip title="字体大小" mouseEnterDelay={0.8}>
            <Button type="text" size="small" style={{
              height: 28, padding: '0 6px', fontSize: 12,
              color: '#555', border: 'none', borderRadius: 4,
              minWidth: 48,
            }}>
              {activeFontSize ? activeFontSize.replace('px', '') + 'px' : '字号'} ▾
            </Button>
          </Tooltip>
        </Dropdown>

        {/* Color */}
        <Popover content={colorPicker} trigger="click" placement="bottomLeft">
          <Tooltip title="文字颜色" mouseEnterDelay={0.8}>
            <Button type="text" size="small" style={{
              width: 32, height: 28, padding: 0,
              border: 'none', borderRadius: 4,
            }}>
              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#333', fontFamily: 'serif', lineHeight: 1 }}>A</span>
                <span style={{
                  width: 14, height: 3, borderRadius: 1,
                  background: activeColor || '#000',
                  marginTop: 2,
                }} />
              </span>
            </Button>
          </Tooltip>
        </Popover>

        <TDivider />

        {/* Alignment */}
        <ToolBtn icon={<AlignLeftOutlined />} title="左对齐"
          active={editor.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()} />
        <ToolBtn icon={<AlignCenterOutlined />} title="居中对齐"
          active={editor.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()} />
        <ToolBtn icon={<AlignRightOutlined />} title="右对齐"
          active={editor.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()} />

        {allowImages && (
          <>
            <TDivider />

            {/* Lists */}
            <ToolBtn icon={<UnorderedListOutlined />} title="无序列表"
              active={editor.isActive('bulletList')}
              onClick={() => editor.chain().focus().toggleBulletList().run()} />
            <ToolBtn icon={<OrderedListOutlined />} title="有序列表"
              active={editor.isActive('orderedList')}
              onClick={() => editor.chain().focus().toggleOrderedList().run()} />

            <TDivider />

            {/* Image insert dropdown */}
            <Dropdown menu={{ items: imageMenuItems }} trigger={['click']}>
              <Tooltip title="在光标处插入图片（也可直接粘贴截图）" mouseEnterDelay={0.8}>
                <Button type="text" size="small" style={{
                  height: 28, padding: '0 8px', fontSize: 12,
                  color: '#555', border: 'none', borderRadius: 4,
                }}>
                  <PictureOutlined style={{ marginRight: 3 }} />图片 ▾
                </Button>
              </Tooltip>
            </Dropdown>

            {/* Size selector for currently-selected image (any insert method) */}
            {isImageSelected && (
              <>
                <TDivider />
                <span style={{ fontSize: 11, color: '#999', marginLeft: 2, marginRight: 2 }}>尺寸</span>
                {(['large', 'medium', 'small'] as const).map((s) => {
                  const labels = { large: '大', medium: '中', small: '小' };
                  const active = activeImageSize === s;
                  return (
                    <Tooltip
                      key={s}
                      title={s === 'large' ? '大图（全宽）'
                          : s === 'medium' ? '中图（1/2 宽）'
                          : '小图（1/3 宽）'}
                      mouseEnterDelay={0.5}
                    >
                      <Button
                        type="text"
                        size="small"
                        onClick={() => setImageSize(s)}
                        style={{
                          width: 28, height: 28, padding: 0,
                          fontSize: 12, fontWeight: active ? 700 : 400,
                          color: active ? '#ff6900' : '#555',
                          background: active ? '#fff3e6' : 'transparent',
                          border: 'none', borderRadius: 4,
                        }}
                      >
                        {labels[s]}
                      </Button>
                    </Tooltip>
                  );
                })}
              </>
            )}

            {/* Hidden file inputs — one per size */}
            {(['large', 'medium', 'small'] as const).map(size => (
              <input
                key={size}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                ref={el => { fileInputRefs.current[size] = el; }}
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) insertImage(size, file);
                }}
              />
            ))}
          </>
        )}
      </div>

      {/* ── Content ── */}
      <div className="rich-editor-content" style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
};

export default RichTextEditor;
