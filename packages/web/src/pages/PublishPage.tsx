import React, { useEffect, useRef, useState } from 'react';
import { Card, Form, Input, Button, Select, Typography, Space, message, Divider, Upload } from 'antd';
import { PlusOutlined, MinusCircleOutlined, PictureOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { DEFAULT_TAGS } from '@ai-review/shared';
import api from '../api/client';

const { Title, Text } = Typography;
const { TextArea } = Input;

const PublishPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const navigate = useNavigate();
  // Refs to native textarea elements per section, for cursor-position image insertion
  const textAreaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  const tagOptions = DEFAULT_TAGS.flatMap(cat => [
    { label: cat.label, value: cat.label },
    ...cat.children.map(child => ({ label: `${cat.label} > ${child}`, value: child })),
  ]);

  useEffect(() => {
    if (editId) {
      api.get(`/api/reviews/${editId}`).then(res => {
        const r = res.data;
        form.setFieldsValue({
          company: r.company,
          description: r.description,
          sections: (r.sections as any[])?.map((s: any) => ({
            title: s.title,
            content: s.content,
            images: s.images || [],
          })) || [{ title: '', content: '', images: [] }],
          tags: r.tags,
          sources: r.sources?.length > 0 ? r.sources : [''],
        });
      }).catch(() => message.error('加载短评失败'));
    }
  }, [editId]);

  const handleImageInsert = (sectionIndex: number, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result as string;
      const marker = `[[IMG:${base64}]]`;

      const sections = form.getFieldValue('sections') || [];
      const section = sections[sectionIndex] || {};
      const content: string = section.content || '';

      // Insert at cursor position if we have a ref, otherwise append
      const textarea = textAreaRefs.current[sectionIndex];
      let newContent: string;
      if (textarea && document.activeElement === textarea) {
        const pos = textarea.selectionStart ?? content.length;
        const before = content.slice(0, pos);
        const after = content.slice(pos);
        const prefix = before.length > 0 && !before.endsWith('\n') ? '\n' : '';
        const suffix = after.length > 0 && !after.startsWith('\n') ? '\n' : '';
        newContent = before + prefix + marker + suffix + after;
      } else {
        const prefix = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        newContent = content + prefix + marker;
      }

      sections[sectionIndex] = { ...section, content: newContent };
      form.setFieldsValue({ sections: [...sections] });
    };
    reader.readAsDataURL(file);
    return false;
  };

  const handleSubmit = async (values: any) => {
    setLoading(true);
    try {
      const sections = (values.sections || [])
        .filter((s: any) => s.title?.trim() || s.content?.trim())
        .map((s: any) => ({
          title: s.title?.trim() || '',
          content: s.content || '',
          images: [],
        }));

      if (sections.length === 0) {
        message.warning('请至少添加一个子段');
        setLoading(false);
        return;
      }

      const payload = {
        company: values.company,
        description: values.description,
        sections,
        tags: values.tags,
        sources: (values.sources || []).filter((s: string) => s?.trim()),
      };

      if (editId) {
        await api.put(`/api/reviews/${editId}`, payload);
        message.success('短评已更新');
        navigate(`/reviews/${editId}`);
      } else {
        const res = await api.post('/api/reviews', payload);
        message.success('短评发布成功');
        navigate(`/reviews/${res.data.id}`);
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '操作失败');
    }
    setLoading(false);
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <Card>
        <Title level={4} style={{ color: '#FF6A00' }}>
          {editId ? '编辑短评' : '发布短评'}
        </Title>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{
            sections: [{ title: '', content: '', images: [] }],
            sources: [''],
          }}
        >
          <Form.Item
            name="company"
            label="目标公司/事件"
            rules={[{ required: true, message: '请输入目标公司或事件' }]}
          >
            <Input placeholder="如：Unitree 宇树 / OpenAI GPT-5 发布" />
          </Form.Item>

          <Form.Item
            name="description"
            label="事件描述"
            rules={[{ required: true, message: '请输入事件描述' }]}
          >
            <TextArea rows={4} placeholder="简述控制在3-5句话，核心可加粗" />
          </Form.Item>

          <Divider orientation="left" style={{ color: '#FF6A00' }}>子段内容</Divider>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            自定义子段标题和内容，如"观点一"、"技术亮点"、"风险提示"等
          </Text>

          <Form.List name="sections">
            {(fields, { add, remove }) => (
              <div>
                {fields.map(({ key, name, ...rest }, index) => (
                  <Card
                    key={key}
                    size="small"
                    style={{ marginBottom: 12, background: '#FFFAF0', borderColor: '#FFD591' }}
                    title={
                      <Space>
                        <Text strong style={{ color: '#FF6A00' }}>子段 {index + 1}</Text>
                        {fields.length > 1 && (
                          <MinusCircleOutlined
                            onClick={() => remove(name)}
                            style={{ color: '#999', cursor: 'pointer' }}
                          />
                        )}
                      </Space>
                    }
                  >
                    <Form.Item
                      {...rest}
                      name={[name, 'title']}
                      label="标题"
                      rules={[{ required: true, message: '请输入子段标题' }]}
                    >
                      <Input placeholder="自定义标题，如：核心观点、技术亮点、风险分析..." />
                    </Form.Item>
                    <Form.Item
                      {...rest}
                      name={[name, 'content']}
                      label="内容"
                      rules={[{ required: true, message: '请输入子段内容' }]}
                      extra={
                        <Upload
                          accept="image/*"
                          showUploadList={false}
                          beforeUpload={(file) => handleImageInsert(name, file)}
                          style={{ marginTop: 6 }}
                        >
                          <Button icon={<PictureOutlined />} size="small" type="dashed" style={{ marginTop: 6 }}>
                            在光标处插入图片
                          </Button>
                        </Upload>
                      }
                    >
                      <TextArea
                        rows={4}
                        placeholder="控制在3-5句话，点击内容区域定位光标后再插入图片"
                        ref={(el) => {
                          if (el) {
                            const native = (el as any).resizableTextArea?.textArea;
                            if (native) textAreaRefs.current[name] = native;
                          }
                        }}
                      />
                    </Form.Item>
                  </Card>
                ))}
                <Button
                  type="dashed"
                  onClick={() => add({ title: '', content: '', images: [] })}
                  icon={<PlusOutlined />}
                  block
                  style={{ marginBottom: 16 }}
                >
                  添加子段
                </Button>
              </div>
            )}
          </Form.List>

          <Divider />

          <Form.Item
            name="tags"
            label="标签"
            rules={[{ required: true, message: '请至少选择一个标签' }]}
          >
            <Select
              mode="tags"
              placeholder="选择或输入自定义标签"
              options={tagOptions}
              tokenSeparators={[',']}
            />
          </Form.Item>

          <Form.List name="sources">
            {(fields, { add, remove }) => (
              <div>
                <Text strong>参考来源（选填）</Text>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} style={{ display: 'flex', marginTop: 8 }} align="start">
                    <Form.Item {...rest} name={name} style={{ marginBottom: 0, flex: 1, minWidth: 400 }}>
                      <Input placeholder="链接地址，如 https://..." />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#999', marginTop: 8 }} />
                    )}
                  </Space>
                ))}
                <Button type="dashed" onClick={() => add()} icon={<PlusOutlined />} style={{ marginTop: 8 }}>
                  添加来源
                </Button>
              </div>
            )}
          </Form.List>

          <Form.Item style={{ marginTop: 32 }}>
            <Space>
              <Button type="primary" htmlType="submit" loading={loading} size="large">
                {editId ? '更新短评' : '发布短评'}
              </Button>
              <Button onClick={() => navigate(-1)} size="large">取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default PublishPage;
