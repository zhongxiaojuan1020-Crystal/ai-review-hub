import React, { useEffect, useRef, useState } from 'react';
import { Button, Tooltip, Upload, Divider, Select } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, PictureOutlined,
  UnorderedListOutlined, OrderedListOutlined, ColumnWidthOutlined,
  AlignLeftOutlined, AlignCenterOutlined, AlignRightOutlined,
} from '@ant-design/icons';

/**
 * Sanitize pasted HTML: strip complex block wrappers (article/div/section/etc.)
 * and data-* / event attributes, keeping only safe formatting elements.
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof document === 'undefined') return html;

  const ALLOWED = new Set([
    'p','br','b','i','u','strong','em','s','sub','sup',
    'h1','h2','h3','h4','h5','h6',
    'ul','ol','li','blockquote',
    'img','a','span','table','thead','tbody','tr','td','th',
  ]);
  const SAFE_ATTRS: Record<string, string[]> = {
    img:  ['src','alt','width','height'],
    a:    ['href','target'],
    td:   ['colspan','rowspan'],
    th:   ['colspan','rowspan'],
    '*':  ['style'],
  };

  const root = document.createElement('div');
  root.innerHTML = html;

  function walk(node: Node): Node | null {
    if (node.nodeType === Node.TEXT_NODE) return node.cloneNode();
    if (node.nodeType !== Node.ELEMENT_NODE) return null;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    // Unwrap disallowed block elements — keep children
    if (!ALLOWED.has(tag)) {
      const frag = document.createDocumentFragment();
      Array.from(el.childNodes).forEach(c => {
        const r = walk(c);
        if (r) frag.appendChild(r);
      });
      return frag;
    }

    const out = document.createElement(tag);
    const safe = [...(SAFE_ATTRS[tag] || []), ...(SAFE_ATTRS['*'] || [])];
    Array.from(el.attributes).forEach(attr => {
      if (safe.includes(attr.name)) out.setAttribute(attr.name, attr.value);
    });

    // Image: ensure it looks good
    if (tag === 'img') {
      out.setAttribute('style',
        'width:100%;max-width:100%;border-radius:6px;margin:8px 0;display:block;');
    }

    Array.from(el.childNodes).forEach(c => {
      const r = walk(c);
      if (r) out.appendChild(r);
    });

    return out;
  }

  const result = document.createElement('div');
  Array.from(root.childNodes).forEach(c => {
    const r = walk(c);
    if (r) result.appendChild(r);
  });

  return result.innerHTML;
}

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
  minHeight = 120,
}) => {
  const editorRef  = useRef<HTMLDivElement>(null);
  const wrapRef    = useRef<HTMLDivElement>(null);
  const lastRef    = useRef<string>('');

  // Drag-resize state
  const [selImg,   setSelImg]   = useState<HTMLImageElement | null>(null);
  const [overlay,  setOverlay]  = useState<{top:number;left:number;width:number;height:number}|null>(null);

  // Sync external value → DOM
  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastRef.current) {
      editorRef.current.innerHTML = value || '';
      lastRef.current = value || '';
    }
  }, [value]);

  const emit = () => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastRef.current = html;
    onChange?.(html);
  };

  const exec = (cmd: string, arg?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, arg);
    emit();
  };

  const applyFontSize = (px: number) => {
    editorRef.current?.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    document.execCommand('fontSize', false, '7');
    editorRef.current!.querySelectorAll('font[size="7"]').forEach(font => {
      const span = document.createElement('span');
      span.style.fontSize = `${px}px`;
      span.innerHTML = (font as HTMLElement).innerHTML;
      font.parentNode?.replaceChild(span, font);
    });
    emit();
  };

  const insertImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      editorRef.current?.focus();
      document.execCommand('insertHTML', false,
        `<img src="${reader.result}" style="width:100%;max-width:100%;border-radius:6px;margin:8px 0;display:block;" />`);
      emit();
    };
    reader.readAsDataURL(file);
    return false;
  };

  const insertTwoColumn = () => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false,
      '<div class="col-2"><div><p>左栏内容</p></div><div><p>右栏内容</p></div></div><p><br></p>');
    emit();
  };

  // ── Image drag-resize ─────────────────────────────────────────

  const calcOverlay = (img: HTMLImageElement) => {
    const wrap = wrapRef.current;
    if (!wrap) return null;
    const wr = wrap.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    return { top: ir.top - wr.top, left: ir.left - wr.left, width: ir.width, height: ir.height };
  };

  const handleEditorClick = (e: React.MouseEvent) => {
    const t = e.target as HTMLElement;
    if (t.tagName === 'IMG') {
      const img = t as HTMLImageElement;
      setSelImg(img);
      setOverlay(calcOverlay(img));
    } else {
      setSelImg(null); setOverlay(null);
    }
  };

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (!selImg) return;
    const x0 = e.clientX;
    const w0 = selImg.offsetWidth;

    const onMove = (me: MouseEvent) => {
      const newPx = Math.max(40, w0 + (me.clientX - x0));
      selImg.style.width = `${newPx}px`;
      selImg.style.maxWidth = '100%';
      setOverlay(calcOverlay(selImg));
    };
    const onUp = () => {
      const cw = editorRef.current?.offsetWidth || 600;
      const pct = Math.min(100, Math.round((selImg.offsetWidth / cw) * 100));
      selImg.style.width = `${pct}%`;
      setOverlay(calcOverlay(selImg));
      emit();
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // ── Paste ─────────────────────────────────────────────────────

  const handlePaste = (e: React.ClipboardEvent) => {
    const items    = Array.from(e.clipboardData?.items || []);
    const htmlItem = items.find(i => i.type === 'text/html');
    const textItem = items.find(i => i.type === 'text/plain');
    const imgItems = items.filter(i => i.type.startsWith('image/'));

    // Pure screenshot / image copy (no associated text or HTML)
    if (imgItems.length > 0 && !htmlItem && !textItem) {
      e.preventDefault();
      const file = imgItems[0].getAsFile();
      if (!file) return;
      insertImage(file);
      return;
    }

    // HTML paste: sanitize to remove garbage data attributes and complex wrappers
    if (htmlItem) {
      e.preventDefault();
      htmlItem.getAsString(raw => {
        const clean = sanitizeHtml(raw);
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, clean);
        emit();
      });
      return;
    }

    // Plain-text fallback: preserve line breaks
    if (textItem) {
      e.preventDefault();
      textItem.getAsString(text => {
        const html = text
          .split('\n')
          .map(line => line.trim() ? `<p>${line}</p>` : '<p><br></p>')
          .join('');
        editorRef.current?.focus();
        document.execCommand('insertHTML', false, html);
        emit();
      });
    }
  };

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>';

  return (
    <div style={{ border: '1px solid #FFD591', borderRadius: 8, background: '#fff', overflow: 'hidden' }}>

      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div style={{
        padding: '6px 10px', borderBottom: '1px solid #FFE7BA', background: '#FFFAF0',
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4,
      }}>
        <Tooltip title="标题 1"><Button type="text" size="small" style={{ fontWeight: 800, fontSize: 15, padding: '0 6px' }} onClick={() => exec('formatBlock','<h1>')}>H1</Button></Tooltip>
        <Tooltip title="标题 2"><Button type="text" size="small" style={{ fontWeight: 700, fontSize: 13, padding: '0 6px' }} onClick={() => exec('formatBlock','<h2>')}>H2</Button></Tooltip>
        <Tooltip title="标题 3"><Button type="text" size="small" style={{ fontWeight: 700, fontSize: 11, padding: '0 6px' }} onClick={() => exec('formatBlock','<h3>')}>H3</Button></Tooltip>
        <Tooltip title="正文"><Button type="text" size="small" style={{ fontSize: 11, padding: '0 6px' }} onClick={() => exec('formatBlock','<p>')}>正文</Button></Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        <Tooltip title="字号">
          <Select size="small" style={{ width: 70 }} placeholder="字号" popupMatchSelectWidth={false}
            options={FONT_SIZES.map(s => ({ label: `${s} px`, value: s }))}
            onChange={(px: number) => applyFontSize(px)} />
        </Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        <Tooltip title="加粗"><Button type="text" size="small" icon={<BoldOutlined />} onClick={() => exec('bold')} /></Tooltip>
        <Tooltip title="斜体"><Button type="text" size="small" icon={<ItalicOutlined />} onClick={() => exec('italic')} /></Tooltip>
        <Tooltip title="下划线"><Button type="text" size="small" icon={<UnderlineOutlined />} onClick={() => exec('underline')} /></Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        <Tooltip title="左对齐"><Button type="text" size="small" icon={<AlignLeftOutlined />} onClick={() => exec('justifyLeft')} /></Tooltip>
        <Tooltip title="居中对齐"><Button type="text" size="small" icon={<AlignCenterOutlined />} onClick={() => exec('justifyCenter')} /></Tooltip>
        <Tooltip title="右对齐"><Button type="text" size="small" icon={<AlignRightOutlined />} onClick={() => exec('justifyRight')} /></Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        <Tooltip title="无序列表"><Button type="text" size="small" icon={<UnorderedListOutlined />} onClick={() => exec('insertUnorderedList')} /></Tooltip>
        <Tooltip title="有序列表"><Button type="text" size="small" icon={<OrderedListOutlined />} onClick={() => exec('insertOrderedList')} /></Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        <Tooltip title="插入两栏分栏"><Button type="text" size="small" icon={<ColumnWidthOutlined />} onClick={insertTwoColumn} /></Tooltip>

        <Divider type="vertical" style={{ margin: '0 2px', height: 16 }} />

        <Tooltip title="上传图片（也可直接粘贴截图）">
          <Upload accept="image/*" showUploadList={false} beforeUpload={insertImage}>
            <Button type="text" size="small" icon={<PictureOutlined />} />
          </Upload>
        </Tooltip>

        <div style={{ flex: 1 }} />
      </div>

      {/* ── Canvas ───────────────────────────────────────────────── */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        {isEmpty && placeholder && (
          <div style={{
            position: 'absolute', top: 16, left: 16, zIndex: 1,
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
          onInput={emit}
          onBlur={emit}
          onClick={handleEditorClick}
          onPaste={handlePaste}
          style={{ minHeight, padding: '16px', outline: 'none' }}
        />

        {/* Drag-resize overlay (shown when an image is selected) */}
        {overlay && selImg && (
          <div style={{
            position: 'absolute',
            top: overlay.top, left: overlay.left,
            width: overlay.width, height: overlay.height,
            border: '2px solid #FF6900', borderRadius: 3,
            pointerEvents: 'none', zIndex: 10,
          }}>
            {/* Decorative corner dots */}
            {[{t:-4,l:-4},{t:-4,r:-4},{b:-4,l:-4}].map((pos,i) => (
              <div key={i} style={{
                position:'absolute', width:8, height:8,
                background:'#FF6900', borderRadius:1, ...pos,
              }} />
            ))}
            {/* SE drag handle (interactive) */}
            <div
              onMouseDown={handleResizeStart}
              title="拖动调整大小"
              style={{
                position:'absolute', bottom:-6, right:-6,
                width:12, height:12, background:'#FF6900',
                borderRadius:2, cursor:'se-resize', pointerEvents:'all',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RichEditor;
