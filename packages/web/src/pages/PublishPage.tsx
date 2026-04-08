import React, { useEffect, useMemo, useState } from 'react';
import {
  Card, Form, Input, Button, Select, Typography, Space, message, Divider,
  Modal, Radio, Tag as AntTag,
} from 'antd';
import { PlusOutlined, MinusCircleOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  L1_TAGS, L2_TAGS, MAIN_DOMAINS, getTagColor, type TagDef,
} from '@ai-review/shared';
import api from '../api/client';
import RichEditor from '../components/RichEditor';

const { Title, Text } = Typography;

const PublishPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const navigate = useNavigate();

  const [body, setBody] = useState('');
  const [customTags, setCustomTags] = useState<TagDef[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pickerLevel, setPickerLevel] = useState<'L1' | 'L2'>('L1');

  // Custom tag modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagLevel, setNewTagLevel] = useState<'L1' | 'L2'>('L2');
  const [newTagParent, setNewTagParent] = useState<string>(MAIN_DOMAINS[0]);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagSubmitting, setNewTagSubmitting] = useState(false);

  useEffect(() => {
    api.get('/api/tags').then(res => {
      setCustomTags(res.data.customTags || []);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (editId) {
      api.get(`/api/reviews/${editId}`).then(res => {
        const r = res.data;
        form.setFieldsValue({
          company: r.company,
          sources: r.sources?.length > 0 ? r.sources : [''],
        });
        setSelectedTags(r.tags || []);
        // Prefer new-style body; fall back to migrating old sections → HTML
        if (r.body) {
          setBody(r.body);
        } else if (Array.isArray(r.sections) && r.sections.length > 0) {
          const migrated = (r.sections as any[]).map((s: any) => {
            const title = s.title ? `<h3>${s.title}</h3>` : '';
            const content = (s.content || '')
              .replace(/\[\[IMG:([^\]]+)\]\]/g, '<img src="$1" style="max-width:100%;border-radius:6px;margin:8px 0;" />')
              .split('\n').map((line: string) => `<p>${line}</p>`).join('');
            return title + content;
          }).join('');
          const desc = r.description ? `<p>${r.description}</p>` : '';
          setBody(desc + migrated);
        } else if (r.description) {
          setBody(`<p>${r.description}</p>`);
        }
      }).catch(() => message.error('加载短评失败'));
    }
  }, [editId]);

  // Options for the right-hand tag dropdown, filtered by level
  const tagPickerOptions = useMemo(() => {
    if (pickerLevel === 'L1') {
      const l1 = [
        ...L1_TAGS,
        ...customTags.filter(t => t.level === 'L1'),
      ];
      return l1.map(t => ({ label: t.label, value: t.label }));
    }
    // L2: group by parent domain for readability
    const allL2 = [...L2_TAGS, ...customTags.filter(t => t.level === 'L2')];
    const allL1Custom = customTags.filter(t => t.level === 'L1').map(t => t.label);
    const domains = [...MAIN_DOMAINS, ...allL1Custom];
    return domains
      .map(d => ({
        label: d,
        options: allL2
          .filter(t => t.parent === d)
          .map(t => ({ label: t.label, value: t.label })),
      }))
      .filter(g => g.options.length > 0);
  }, [pickerLevel, customTags]);

  const toggleTag = (label: string) => {
    setSelectedTags(prev =>
      prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]
    );
  };

  const handleAddCustomTag = async () => {
    const label = newTagLabel.trim();
    if (!label) {
      message.warning('请输入标签');
      return;
    }
    setNewTagSubmitting(true);
    try {
      const res = await api.post('/api/tags', {
        label,
        level: newTagLevel,
        parent: newTagLevel === 'L2' ? newTagParent : undefined,
      });
      setCustomTags(res.data.customTags || []);
      setSelectedTags(prev => [...prev, label]);
      message.success('已添加自定义标签');
      setNewTagLabel('');
      setTagModalOpen(false);
    } catch (err: any) {
      message.error(err?.response?.data?.error || '添加失败');
    }
    setNewTagSubmitting(false);
  };

  const handleSubmit = async (values: any) => {
    if (!body.trim() || body === '<br>' || body === '<p><br></p>') {
      message.warning('请输入短评内容');
      return;
    }
    if (selectedTags.length === 0) {
      message.warning('请至少选择一个标签');
      return;
    }

    setLoading(true);
    try {
      // Derive a short description from the first text block of body
      const tmp = document.createElement('div');
      tmp.innerHTML = body;
      const firstLine = (tmp.textContent || '').trim().slice(0, 120);

      const payload = {
        company: values.company,
        description: firstLine,
        body,
        sections: [], // new editor stores content in body
        tags: selectedTags,
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
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <Card>
        <Title level={4} style={{ color: '#FF6A00' }}>
          {editId ? '编辑短评' : '发布短评'}
        </Title>

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ sources: [''] }}
        >
          <Form.Item
            name="company"
            label="主标题（目标公司 / 事件）"
            rules={[{ required: true, message: '请输入目标公司或事件' }]}
          >
            <Input size="large" />
          </Form.Item>

          <Form.Item label="正文">
            <RichEditor value={body} onChange={setBody} placeholder="" />
          </Form.Item>

          <Divider />

          {/* Compact tag picker: level dropdown + tag multi-select */}
          <Form.Item label="标签" required>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                value={pickerLevel}
                onChange={setPickerLevel}
                style={{ width: 130, flexShrink: 0 }}
                options={[
                  { label: '一级标签', value: 'L1' },
                  { label: '二级标签', value: 'L2' },
                ]}
              />
              <Select
                mode="multiple"
                style={{ flex: 1 }}
                placeholder=""
                value={selectedTags.filter(t => {
                  // Show only the subset matching the current level in the input
                  const def = [...L1_TAGS, ...L2_TAGS, ...customTags].find(d => d.label === t);
                  return def ? def.level === pickerLevel : pickerLevel === 'L2';
                })}
                onChange={(vals: string[]) => {
                  // Merge: keep selected tags from the *other* level, replace this level
                  const otherLevel = selectedTags.filter(t => {
                    const def = [...L1_TAGS, ...L2_TAGS, ...customTags].find(d => d.label === t);
                    const lvl = def ? def.level : 'L2';
                    return lvl !== pickerLevel;
                  });
                  setSelectedTags([...otherLevel, ...vals]);
                }}
                options={tagPickerOptions as any}
                tagRender={(props) => {
                  const { label, value, closable, onClose } = props;
                  const c = getTagColor(value as string, customTags);
                  return (
                    <AntTag
                      closable={closable}
                      onClose={onClose}
                      style={{
                        marginInlineEnd: 4,
                        background: c.bg,
                        color: c.text,
                        borderColor: c.border,
                      }}
                    >
                      {label}
                    </AntTag>
                  );
                }}
              />
              <Button icon={<PlusOutlined />} onClick={() => setTagModalOpen(true)}>
                自定义
              </Button>
            </Space.Compact>
            {selectedTags.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>已选：</Text>
                <Space size={4} wrap style={{ marginLeft: 6 }}>
                  {selectedTags.map(t => {
                    const c = getTagColor(t, customTags);
                    return (
                      <AntTag
                        key={t}
                        closable
                        onClose={() => toggleTag(t)}
                        style={{ background: c.bg, color: c.text, borderColor: c.border }}
                      >
                        {t}
                      </AntTag>
                    );
                  })}
                </Space>
              </div>
            )}
          </Form.Item>

          <Form.List name="sources">
            {(fields, { add, remove }) => (
              <div>
                <Text strong>参考来源（选填）</Text>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} style={{ display: 'flex', marginTop: 8 }} align="start">
                    <Form.Item {...rest} name={name} style={{ marginBottom: 0, flex: 1, minWidth: 400 }}>
                      <Input />
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

      {/* Add custom tag modal */}
      <Modal
        open={tagModalOpen}
        title="新增自定义标签"
        onCancel={() => setTagModalOpen(false)}
        onOk={handleAddCustomTag}
        confirmLoading={newTagSubmitting}
        okText="添加"
        cancelText="取消"
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div>
            <Text style={{ fontSize: 12, color: '#999' }}>级别</Text>
            <div style={{ marginTop: 4 }}>
              <Radio.Group value={newTagLevel} onChange={e => setNewTagLevel(e.target.value)}>
                <Radio.Button value="L1">一级标签（领域）</Radio.Button>
                <Radio.Button value="L2">二级标签（子类）</Radio.Button>
              </Radio.Group>
            </div>
          </div>
          {newTagLevel === 'L2' && (
            <div>
              <Text style={{ fontSize: 12, color: '#999' }}>所属一级标签</Text>
              <Select
                value={newTagParent}
                onChange={setNewTagParent}
                style={{ width: '100%', marginTop: 4 }}
                options={[
                  ...MAIN_DOMAINS.map(d => ({ label: d, value: d })),
                  ...customTags.filter(t => t.level === 'L1').map(t => ({ label: t.label, value: t.label })),
                ]}
              />
            </div>
          )}
          <div>
            <Text style={{ fontSize: 12, color: '#999' }}>标签名</Text>
            <Input
              value={newTagLabel}
              onChange={e => setNewTagLabel(e.target.value)}
              placeholder="输入标签名称"
              style={{ marginTop: 4 }}
              maxLength={20}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
};

export default PublishPage;
