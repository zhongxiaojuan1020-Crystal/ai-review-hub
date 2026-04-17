import React, { useCallback, useRef } from 'react';
import { useEditor, EditorContent, Extension } from '@tiptap/react';
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
  });

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
              <Tooltip title="在光标处插入图片" mouseEnterDelay={0.8}>
                <Button type="text" size="small" style={{
                  height: 28, padding: '0 8px', fontSize: 12,
                  color: '#555', border: 'none', borderRadius: 4,
                }}>
                  <PictureOutlined style={{ marginRight: 3 }} />图片 ▾
                </Button>
              </Tooltip>
            </Dropdown>

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
