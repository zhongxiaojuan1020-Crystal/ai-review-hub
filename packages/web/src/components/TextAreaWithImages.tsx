import React from 'react';
import { Input, Upload, Button, Tooltip } from 'antd';
import { PictureOutlined } from '@ant-design/icons';

const { TextArea } = Input;

interface TextAreaWithImagesProps {
  text: string;
  images: string[];
  onTextChange: (text: string) => void;
  onImagesChange: (images: string[]) => void;
  placeholder?: string;
  minRows?: number;
}

/**
 * A plain-text TextArea with image upload/paste support.
 *
 * Images are stored as a separate array (not embedded in text).
 * Supports:
 *   - Pasting screenshots from clipboard
 *   - Uploading via file picker
 *   - Removing individual images by clicking X
 */
const TextAreaWithImages: React.FC<TextAreaWithImagesProps> = ({
  text,
  images,
  onTextChange,
  onImagesChange,
  placeholder,
  minRows = 3,
}) => {
  const addImage = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      onImagesChange([...images, reader.result as string]);
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData?.items || []);
    const imgItem = items.find(i => i.type.startsWith('image/'));
    if (imgItem) {
      e.preventDefault();
      const file = imgItem.getAsFile();
      if (file) addImage(file);
    }
  };

  const handleUpload = (file: File) => {
    addImage(file);
    return false; // prevent auto upload
  };

  const removeImage = (index: number) => {
    onImagesChange(images.filter((_, i) => i !== index));
  };

  return (
    <div>
      <TextArea
        value={text}
        onChange={e => onTextChange(e.target.value)}
        onPaste={handlePaste}
        placeholder={placeholder}
        autoSize={{ minRows, maxRows: 20 }}
        style={{ fontSize: 13 }}
      />

      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
        <Upload accept="image/*" showUploadList={false} beforeUpload={handleUpload}>
          <Button size="small" type="dashed" icon={<PictureOutlined />}>
            插入图片
          </Button>
        </Upload>
        <span style={{ fontSize: 11, color: '#bbb' }}>也可直接粘贴截图</span>
      </div>

      {images.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {images.map((img, i) => (
            <div key={i} style={{ position: 'relative', display: 'inline-block' }}>
              <img
                src={img}
                alt=""
                style={{
                  width: 140,
                  height: 90,
                  objectFit: 'cover',
                  borderRadius: 4,
                  border: '1px solid #eee',
                }}
              />
              <Tooltip title="删除图片">
                <span
                  onClick={() => removeImage(i)}
                  style={{
                    position: 'absolute', top: -6, right: -6,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#ff4d4f', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, cursor: 'pointer',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }}
                >
                  ✕
                </span>
              </Tooltip>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default TextAreaWithImages;
