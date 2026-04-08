import React, { useEffect, useRef } from 'react';
import { Space, Button, Tooltip, Upload, Divider } from 'antd';
import {
  BoldOutlined, ItalicOutlined, UnderlineOutlined, PictureOutlined,
  UnorderedListOutlined, OrderedListOutlined, FontSizeOutlined,
} from '@ant-design/icons';

/**
 * Minimal Word-like rich text editor built on contenteditable + execCommand.
 *
 * Features: bold / italic / underline / heading / bullet & numbered list / inline image.
 * Value is HTML. Consumers should render via <HtmlRenderer html={value} /> for display.
 *
 * This is intentionally lightweight – no 3rd-party editor dependency – because
 * our authors just want basic formatting, not a full CMS.
 */
interface RichEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

const RichEditor: React.FC<RichEditorProps> = ({
  value = '',
  onChange,
  placeholder = '在这里开始写作… 支持加粗、斜体、插图等基础排版',
  minHeight = 320,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>('');

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

  const handleImageUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      editorRef.current?.focus();
      // Insert as a resized inline image
      const img = `<img src="${base64}" style="max-width:100%;border-radius:6px;margin:8px 0;" />`;
      document.execCommand('insertHTML', false, img);
      handleInput();
    };
    reader.readAsDataURL(file);
    return false;
  };

  const isEmpty = !value || value === '<br>' || value === '<div><br></div>';

  return (
    <div
      style={{
        border: '1px solid #FFD591',
        borderRadius: 8,
        background: '#fff',
        overflow: 'hidden',
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          padding: '6px 10px',
          borderBottom: '1px solid #FFE7BA',
          background: '#FFFAF0',
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 4,
        }}
      >
        <Tooltip title="标题">
          <Button type="text" size="small" icon={<FontSizeOutlined />} onClick={() => exec('formatBlock', '<h3>')} />
        </Tooltip>
        <Tooltip title="正文">
          <Button type="text" size="small" onClick={() => exec('formatBlock', '<p>')}>正文</Button>
        </Tooltip>
        <Divider type="vertical" style={{ margin: '0 4px' }} />
        <Tooltip title="加粗">
          <Button type="text" size="small" icon={<BoldOutlined />} onClick={() => exec('bold')} />
        </Tooltip>
        <Tooltip title="斜体">
          <Button type="text" size="small" icon={<ItalicOutlined />} onClick={() => exec('italic')} />
        </Tooltip>
        <Tooltip title="下划线">
          <Button type="text" size="small" icon={<UnderlineOutlined />} onClick={() => exec('underline')} />
        </Tooltip>
        <Divider type="vertical" style={{ margin: '0 4px' }} />
        <Tooltip title="无序列表">
          <Button type="text" size="small" icon={<UnorderedListOutlined />} onClick={() => exec('insertUnorderedList')} />
        </Tooltip>
        <Tooltip title="有序列表">
          <Button type="text" size="small" icon={<OrderedListOutlined />} onClick={() => exec('insertOrderedList')} />
        </Tooltip>
        <Divider type="vertical" style={{ margin: '0 4px' }} />
        <Tooltip title="插入图片">
          <Upload accept="image/*" showUploadList={false} beforeUpload={handleImageUpload}>
            <Button type="text" size="small" icon={<PictureOutlined />} />
          </Upload>
        </Tooltip>
        <div style={{ flex: 1 }} />
        <Space size={4}>
          <span style={{ fontSize: 11, color: '#bfbfbf' }}>
            支持 Word 式排版：加粗 / 斜体 / 图片
          </span>
        </Space>
      </div>

      {/* Editable canvas */}
      <div style={{ position: 'relative' }}>
        {isEmpty && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: 16,
              color: '#bfbfbf',
              pointerEvents: 'none',
              fontSize: 14,
            }}
          >
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          onBlur={handleInput}
          style={{
            minHeight,
            padding: '16px',
            outline: 'none',
            fontSize: 14,
            lineHeight: 1.8,
            color: '#333',
          }}
        />
      </div>
    </div>
  );
};

export default RichEditor;
