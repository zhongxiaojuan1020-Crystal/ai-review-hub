import React, { useEffect, useRef, useState } from 'react';
import { Button, Tooltip, Upload, Divider, Select, Modal, InputNumber } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, PictureOutlined,
  UnorderedListOutlined, OrderedListOutlined, ColumnWidthOutlined,
} from '@ant-design/icons';

/**
 * Rich text editor built on contenteditable + execCommand.
 *
 * Features:
 *   • H1 / H2 / H3 heading buttons (16 / 14 / 12 px)
 *   • Font-size picker (10 – 24 px) via the "fontSize hack"
 *   • Bold / Italic / Underline
 *   • Bullet & numbered lists
 *   • Two-column layout (inserts .col-2 grid div)
 *   • Inline image upload (base-64) with click-to-resize modal
 *
 * Value is HTML. Display via <HtmlRenderer html={value} />.
 */
interface RichEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 24];

const RichEditor: React.FC<RichEditorProps> = ({
  value = '',
  onChange,
  placeholder = '',
  minHeight = 320,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>('');

  // Image resize modal state
  const [selectedImg, setSelectedImg] = useState<HTMLImageElement | null>(null);
  const [imgWidth, setImgWidth] = useState(100);
  const [imgModalOpen, setImgModalOpen] = useState(false);

  // Sync external value → DOM (only when it differs, to preserve cursor)
  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastEmittedRef.current) {
      editorRef.current.innerHTML = value || '';
      lastEmittedRef.current = value || '';
    }
  }, [value]);

  const exec = (command: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, arg);
    handleInput();
  };

  const handleInput = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastEmittedRef.current = html;
    onChange?.(html);
  };

  /**
   * Apply a specific pixel font-size to the selection.
   * Uses the classic "fontSize=7 hack": set size=7, then find those <font> elements
   * and replace them with <span style="font-size: Xpx">.
   */
  const applyFontSize = (px: number) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    document.execCommand('fontSize', false, '7');
    const editor = editorRef.current!;
    editor.querySelectorAll('font[size="7"]').forEach(font => {
      const span = document.createElement('span');
      span.style.fontSize = `${px}px`;
      span.innerHTML = (font as HTMLElement).innerHTML;
      font.parentNode?.replaceChild(span, font);
    });
    handleInput();
  };

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      editorRef.current?.focus();
      const img = `<img src="${base64}" style="width:100%;max-width:100%;border-radius:6px;margin:8px 0;" />`;
      document.execCommand('insertHTML', false, img);
      handleInput();
    };
    reader.readAsDataURL(file);
    return false; // prevent default upload
  };

  /** Insert a two-column layout wrapper at the cursor. */
  const insertTwoColumn = () => {
    editorRef.current?.focus();
    const html = [
      '<div class="col-2">',
      '<div><p>左栏内容</p></div>',
      '<div><p>右栏内容</p></div>',
      '</div><p><br></p>',
    ].join('');
    document.execCommand('insertHTML', false, html);
    handleInput();
  };

  /** Click inside the editor: if an image was clicked, open the resize modal. */
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'IMG') {
      const img = target as HTMLImageElement;
      setSelectedImg(img);
      const containerWidth = editorRef.current?.offsetWidth || 600;
      const currentWidthPx = img.offsetWidth || containerWidth;
      setImgWidth(Math.round((currentWidthPx / containerWidth) * 100));
      setImgModalOpen(true);
    }
  };

  const applyImgResize = () => {
    if (selectedImg) {
      selectedImg.style.width = `${imgWidth}%`;
      selectedImg.style.maxWidth = '100%';
      handleInput();
    }
    setImgModalOpen(false);
    setSelectedImg(null);
  };

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>';

  return (
    <div style={{ border: '1px solid #FFD591', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div style={{
        padding: '6px 10px',
        borderBottom: '1px solid #FFE7BA',
        background: '#FFFAF0',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 4,
      }}>
        {/* Heading shortcuts */}
        <Tooltip title="标题 1（16 px）">
          <Button
            type="text" size="small"
            style={{ fontWeight: 800, fontSize: 15, lineHeight: 1, padding: '0 6px' }}
            onClick={() => exec('formatBlock', '<h1>')}
          >H1</Button>
        </Tooltip>
        <Tooltip title="标题 2（14 px）">
          <Button
            type="text" size="small"
            style={{ fontWeight: 700, fontSize: 13, lineHeight: 1, padding: '0 6px' }}
            onClick={() => exec('formatBlock', '<h2>')}
          >H2</Button>
        </Tooltip>
        <Tooltip title="标题 3（12 px）">
          <Button
            type="text" size="small"
            style={{ fontWeight: 700, fontSize: 11, lineHeight: 1, padding: '0 6px' }}
            onClick={() => exec('formatBlock', '<h3>')}
          >H3</Button>
        </Tooltip>
        <Tooltip title="正文">
          <Button
            type="text" size="small"
            style={{ fontSize: 11, padding: '0 6px' }}
            onClick={() => exec('formatBlock', '<p>')}
          >正文</Button>
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        {/* Font-size picker */}
        <Tooltip title="字号">
          <Select
            size="small"
            style={{ width: 70 }}
            placeholder="字号"
            popupMatchSelectWidth={false}
            options={FONT_SIZES.map(s => ({ label: `${s} px`, value: s }))}
            onChange={(px: number) => applyFontSize(px)}
          />
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        {/* Inline formatting */}
        <Tooltip title="加粗">
          <Button type="text" size="small" icon={<BoldOutlined />} onClick={() => exec('bold')} />
        </Tooltip>
        <Tooltip title="斜体">
          <Button type="text" size="small" icon={<ItalicOutlined />} onClick={() => exec('italic')} />
        </Tooltip>
        <Tooltip title="下划线">
          <Button type="text" size="small" icon={<UnderlineOutlined />} onClick={() => exec('underline')} />
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        {/* Lists */}
        <Tooltip title="无序列表">
          <Button type="text" size="small" icon={<UnorderedListOutlined />} onClick={() => exec('insertUnorderedList')} />
        </Tooltip>
        <Tooltip title="有序列表">
          <Button type="text" size="small" icon={<OrderedListOutlined />} onClick={() => exec('insertOrderedList')} />
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        {/* Two-column layout */}
        <Tooltip title="插入两栏分栏">
          <Button type="text" size="small" icon={<ColumnWidthOutlined />} onClick={insertTwoColumn} />
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        {/* Image upload */}
        <Tooltip title="插入图片（点击已插入图片可调整大小）">
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleImageUpload}>
            <Button type="text" size="small" icon={<PictureOutlined />} />
          </Upload>
        </Tooltip>

        <div style={{ flex: 1 }} />
      </div>

      {/* ── Canvas ───────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        {isEmpty && placeholder && (
          <div style={{
            position: 'absolute', top: 16, left: 16,
            color: '#bfbfbf', pointerEvents: 'none', fontSize: 12,
          }}>
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="rich-editor-canvas"
          onInput={handleInput}
          onBlur={handleInput}
          onClick={handleEditorClick}
          style={{ minHeight, padding: '16px', outline: 'none' }}
        />
      </div>

      {/* ── Image resize modal ───────────────────────────────────── */}
      <Modal
        open={imgModalOpen}
        title="调整图片大小"
        onOk={applyImgResize}
        onCancel={() => { setImgModalOpen(false); setSelectedImg(null); }}
        okText="确定"
        cancelText="取消"
        width={320}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
          <span style={{ fontSize: 13, whiteSpace: 'nowrap' }}>宽度（占容器 %）：</span>
          <InputNumber
            min={10}
            max={100}
            step={5}
            value={imgWidth}
            onChange={(v) => setImgWidth(v ?? 100)}
            style={{ width: 80 }}
          />
          <span style={{ fontSize: 13 }}>%</span>
        </div>
      </Modal>
    </div>
  );
};

export default RichEditor;
