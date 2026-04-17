import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Form, Input, Button, Select, Typography, Space, message, Divider,
  Modal, Radio, Tag as AntTag, Collapse, Tooltip,
} from 'antd';
import {
  PlusOutlined, MinusCircleOutlined, ThunderboltOutlined, LoadingOutlined,
  EyeOutlined, SaveOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  L1_TAGS, L2_TAGS, MAIN_DOMAINS, getTagColor, type TagDef,
} from '@ai-review/shared';
import dayjs from 'dayjs';
import api from '../api/client';
import { useAuthStore } from '../stores/authStore';
import RichTextEditor from '../components/RichTextEditor';

const { Title, Text } = Typography;
const { TextArea } = Input;

const AUTO_SAVE_INTERVAL = 30_000;

interface Section {
  title: string;   // rich HTML
  content: string; // rich HTML with inline images
}

const PublishPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Structured fields — description and sections.content are rich HTML strings
  const [description, setDescription] = useState('');
  const [sections, setSections] = useState<Section[]>([{ title: '', content: '' }]);
  const [customTags, setCustomTags] = useState<TagDef[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [pickerLevel, setPickerLevel] = useState<'L1' | 'L2'>('L1');

  // resetKey: incrementing this forces all RichTextEditors to remount with new content
  // (needed when loading an edit or filling from AI)
  const [resetKey, setResetKey] = useState(0);

  // Custom tag modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagLevel, setNewTagLevel] = useState<'L1' | 'L2'>('L2');
  const [newTagParent, setNewTagParent] = useState<string>(MAIN_DOMAINS[0]);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagSubmitting, setNewTagSubmitting] = useState(false);

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);

  // AI assistant
  const [aiRawText, setAiRawText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  // Auto-save
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const draftKey = editId ? `edit:${editId}` : 'publish';

  useEffect(() => { dirtyRef.current = true; }, [description, sections, selectedTags]);

  const saveDraft = useCallback(async (silent = true) => {
    if (!dirtyRef.current) return;
    const company = form.getFieldValue('company');
    const sources = form.getFieldValue('sources');
    const hasContent = company || description || sections.some(s => s.title || s.content);
    if (!hasContent) return;
    setSaving(true);
    try {
      await api.put(`/api/drafts/${draftKey}`, {
        company,
        body: JSON.stringify({ description, sections }),
        tags: selectedTags,
        sources: (sources || []).filter((s: string) => s?.trim()),
      });
      dirtyRef.current = false;
      setLastSaved(new Date());
      if (!silent) message.success('草稿已保存');
    } catch {
      if (!silent) message.error('草稿保存失败');
    }
    setSaving(false);
  }, [description, sections, selectedTags, draftKey, form]);

  useEffect(() => {
    const timer = setInterval(() => saveDraft(true), AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [saveDraft]);

  useEffect(() => {
    const handler = () => { if (dirtyRef.current) saveDraft(true); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveDraft]);

  useEffect(() => {
    api.get('/api/tags').then(res => setCustomTags(res.data.customTags || [])).catch(() => {});
  }, []);

  // Load existing review for editing
  useEffect(() => {
    if (!editId) return;
    api.get(`/api/reviews/${editId}`).then(res => {
      const r = res.data;
      const company = r.company.startsWith('【短评】') ? r.company : `【短评】${r.company}`;
      form.setFieldsValue({ company, sources: r.sources?.length > 0 ? r.sources : [''] });
      setSelectedTags(r.tags || []);
      setDescription(r.description || '');
      if (Array.isArray(r.sections) && r.sections.length > 0) {
        setSections(r.sections.map((s: any) => ({
          title: s.title || '',
          content: s.content || '',
        })));
      }
      // Force all editors to remount with loaded content
      setResetKey(k => k + 1);
    }).catch(() => message.error('加载短评失败'));
  }, [editId]);

  // Restore draft on mount
  useEffect(() => {
    if (editId) return;
    api.get(`/api/drafts/${draftKey}`).then(res => {
      if (res.status === 204 || !res.data) return;
      const draft = res.data;
      if (!draft.company && !draft.body) return;
      Modal.confirm({
        title: '发现未完成草稿',
        content: `上次编辑于 ${dayjs(draft.savedAt).format('MM/DD HH:mm')}，是否恢复？`,
        okText: '恢复草稿',
        cancelText: '丢弃',
        onOk: () => {
          if (draft.company) form.setFieldValue('company', draft.company);
          if (Array.isArray(draft.tags)) setSelectedTags(draft.tags);
          if (Array.isArray(draft.sources) && draft.sources.length > 0) form.setFieldValue('sources', draft.sources);
          if (draft.body) {
            try {
              const parsed = JSON.parse(draft.body);
              if (typeof parsed.description === 'string') setDescription(parsed.description);
              if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
                setSections(parsed.sections.map((s: any) => ({
                  title: s.title || '',
                  content: s.content || '',
                })));
              }
              setResetKey(k => k + 1);
            } catch {
              api.delete(`/api/drafts/${draftKey}`).catch(() => {});
              message.warning('旧格式草稿已丢弃，请重新编辑');
              return;
            }
          }
          message.success('草稿已恢复');
        },
        onCancel: () => { api.delete(`/api/drafts/${draftKey}`).catch(() => {}); },
      });
    }).catch(() => {});
  }, [draftKey, editId]);

  // Section helpers
  const addSection = () => setSections(s => [...s, { title: '', content: '' }]);
  const removeSection = (i: number) => setSections(s => s.filter((_, idx) => idx !== i));
  const updateSection = (i: number, field: keyof Section, val: string) =>
    setSections(s => s.map((sec, idx) => idx === i ? { ...sec, [field]: val } : sec));

  // Tag picker
  const tagPickerOptions = useMemo(() => {
    if (pickerLevel === 'L1') {
      return [...L1_TAGS, ...customTags.filter(t => t.level === 'L1')].map(t => ({ label: t.label, value: t.label }));
    }
    const allL2 = [...L2_TAGS, ...customTags.filter(t => t.level === 'L2')];
    const domains = [...MAIN_DOMAINS, ...customTags.filter(t => t.level === 'L1').map(t => t.label)];
    return domains
      .map(d => ({ label: d, options: allL2.filter(t => t.parent === d).map(t => ({ label: t.label, value: t.label })) }))
      .filter(g => g.options.length > 0);
  }, [pickerLevel, customTags]);

  const toggleTag = (label: string) =>
    setSelectedTags(prev => prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]);

  const handleAddCustomTag = async () => {
    const label = newTagLabel.trim();
    if (!label) { message.warning('请输入标签'); return; }
    setNewTagSubmitting(true);
    try {
      const res = await api.post('/api/tags', { label, level: newTagLevel, parent: newTagLevel === 'L2' ? newTagParent : undefined });
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

  const handleAiFormat = async () => {
    if (!aiRawText.trim() || aiRawText.trim().length < 10) {
      message.warning('请先粘贴原始材料（至少10字）'); return;
    }
    setAiLoading(true);
    try {
      const res = await api.post('/api/ai/format', { rawText: aiRawText });
      const { title, description: aiDesc, sections: aiSections, suggestedTags } = res.data;
      if (title) form.setFieldValue('company', `【短评】${title}`);
      if (aiDesc) setDescription(aiDesc);
      if (Array.isArray(aiSections) && aiSections.length > 0) {
        setSections(aiSections.map((s: any) => ({
          title: s.title || '',
          content: s.content || '',
        })));
      }
      // Force editors to remount with AI-filled content
      setResetKey(k => k + 1);
      if (Array.isArray(suggestedTags) && suggestedTags.length > 0) {
        setSelectedTags(suggestedTags);
        message.success(`AI 已生成内容，推荐标签：${suggestedTags.join('、')}`);
      } else {
        message.success('AI 排版完成，请检查并微调内容');
      }
    } catch (err: any) {
      message.error(err?.response?.data?.error || 'AI 生成失败，请检查 API Key 配置');
    }
    setAiLoading(false);
  };

  // Strip HTML tags to get plain text for validation
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, '').trim();

  const handleSubmit = async (values: any) => {
    const hasDesc = stripHtml(description).length > 0;
    const hasSections = sections.some(s => stripHtml(s.title).length > 0 || stripHtml(s.content).length > 0);
    if (!hasDesc && !hasSections) {
      message.warning('请填写摘要或至少一个观点'); return;
    }
    if (selectedTags.length === 0) {
      message.warning('请至少选择一个标签'); return;
    }
    setLoading(true);
    try {
      // Filter out completely empty sections
      const cleanSections = sections
        .filter(s => stripHtml(s.title).length > 0 || stripHtml(s.content).length > 0)
        .map(s => ({
          title: s.title,
          content: s.content,
        }));

      const payload = {
        company: values.company,
        description,
        sections: cleanSections,
        body: null, // images embedded inline in the HTML content
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
      api.delete(`/api/drafts/${draftKey}`).catch(() => {});
    } catch (err: any) {
      message.error(err.response?.data?.error || '操作失败');
    }
    setLoading(false);
  };

  const company = form.getFieldValue('company') || '【短评】标题预览';
  const validSections = sections.filter(s => stripHtml(s.title).length > 0 || stripHtml(s.content).length > 0);

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <Card>
        {/* Header row */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <Title level={4} style={{ color: '#FF6900', margin: 0 }}>
            {editId ? '编辑短评' : '发布短评'}
          </Title>
          <Space size={8}>
            {lastSaved && (
              <Text type="secondary" style={{ fontSize: 11 }}>
                <SaveOutlined style={{ marginRight: 4 }} />
                {saving ? '保存中...' : `已保存 ${dayjs(lastSaved).format('HH:mm:ss')}`}
              </Text>
            )}
            <Button size="small" icon={<SaveOutlined />} loading={saving} onClick={() => saveDraft(false)}>
              保存草稿
            </Button>
            <Button size="small" icon={<EyeOutlined />} onClick={() => setPreviewOpen(true)}>
              预览卡片
            </Button>
          </Space>
        </div>

        {/* AI 排版助手 */}
        <Collapse
          ghost
          style={{ marginBottom: 24, border: '1px dashed #D4BF98', borderRadius: 4, background: 'rgba(255,252,248,0.6)' }}
          items={[{
            key: 'ai',
            label: (
              <span style={{ fontSize: 13, color: '#FF6900', fontWeight: 600 }}>
                <ThunderboltOutlined style={{ marginRight: 6 }} />
                AI 排版助手 — 贴入原文，一键生成结构化短评
              </span>
            ),
            children: (
              <div style={{ paddingBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  将文章摘录、会议记录、要点笔记等贴入下方，AI 自动提炼标题、摘要和观点列表。
                </Text>
                <TextArea
                  value={aiRawText}
                  onChange={e => setAiRawText(e.target.value)}
                  placeholder="粘贴原始材料..."
                  autoSize={{ minRows: 5, maxRows: 14 }}
                  style={{ fontSize: 12, marginBottom: 12, background: '#FDFCF8', borderColor: '#D4BF98' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#A8906C' }}>
                    {aiRawText.length > 0 ? `${aiRawText.length} 字` : ''}
                  </Text>
                  <Button
                    type="primary"
                    icon={aiLoading ? <LoadingOutlined /> : <ThunderboltOutlined />}
                    onClick={handleAiFormat}
                    loading={aiLoading}
                    disabled={aiRawText.trim().length < 10}
                  >
                    {aiLoading ? 'AI 正在整理...' : '一键生成短评'}
                  </Button>
                </div>
              </div>
            ),
          }]}
        />

        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ sources: [''], company: '【短评】' }}
        >
          {/* 标题 */}
          <Form.Item
            name="company"
            label="主标题（目标公司 / 事件）"
            rules={[{ required: true, message: '请输入目标公司或事件' }]}
            getValueFromEvent={(e) => {
              const raw: string = e.target.value;
              return raw.startsWith('【短评】') ? raw : '【短评】' + raw.replace(/^【短评】*/, '');
            }}
          >
            <Input size="large" />
          </Form.Item>

          {/* 事件摘要 — rich text */}
          <Form.Item label={
            <span>
              事件摘要
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                支持加粗、颜色、图片（光标处插入）等格式
              </Text>
            </span>
          }>
            <RichTextEditor
              key={`desc-${resetKey}`}
              initialContent={description}
              onChange={setDescription}
              placeholder="概括核心事件或背景..."
              minHeight={120}
              allowImages
            />
          </Form.Item>

          <Divider style={{ margin: '16px 0' }} />

          {/* 观点块 */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <Text strong>
                观点 / 技术亮点
                <Text type="secondary" style={{ fontSize: 11, fontWeight: 400, marginLeft: 6 }}>
                  每个编辑框均支持富文本格式和内联图片
                </Text>
              </Text>
              <Button
                type="dashed"
                size="small"
                icon={<PlusOutlined />}
                onClick={addSection}
                disabled={sections.length >= 8}
              >
                添加观点
              </Button>
            </div>

            {sections.map((sec, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  gap: 10,
                  marginBottom: 16,
                  padding: '12px 14px',
                  background: '#FDFCF8',
                  border: '1px solid #EDE0C4',
                  borderRadius: 4,
                  borderLeft: '3px solid #FF6900',
                }}
              >
                {/* Circle number */}
                <div style={{
                  flexShrink: 0,
                  width: 24, height: 24, borderRadius: '50%',
                  background: '#FF6A00', color: '#fff',
                  fontSize: 12, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  marginTop: 6,
                }}>
                  {i + 1}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Section title — compact rich editor (no images) */}
                  <div style={{ marginBottom: 8 }}>
                    <RichTextEditor
                      key={`sec-title-${i}-${resetKey}`}
                      initialContent={sec.title}
                      onChange={val => updateSection(i, 'title', val)}
                      placeholder={`副标题（如"技术亮点${i + 1}"、"观点${i + 1}"等）`}
                      minHeight={40}
                      allowImages={false}
                    />
                  </div>
                  {/* Section content — full rich editor with images */}
                  <RichTextEditor
                    key={`sec-content-${i}-${resetKey}`}
                    initialContent={sec.content}
                    onChange={val => updateSection(i, 'content', val)}
                    placeholder="详细说明，可插入图片..."
                    minHeight={80}
                    allowImages
                  />
                </div>

                {sections.length > 1 && (
                  <Tooltip title="删除此观点">
                    <MinusCircleOutlined
                      onClick={() => removeSection(i)}
                      style={{ color: '#ccc', fontSize: 16, marginTop: 6, cursor: 'pointer', flexShrink: 0 }}
                    />
                  </Tooltip>
                )}
              </div>
            ))}
          </div>

          <Divider style={{ margin: '16px 0' }} />

          {/* 标签 */}
          <Form.Item label="标签" required>
            <Space.Compact style={{ width: '100%' }}>
              <Select
                value={pickerLevel}
                onChange={setPickerLevel}
                style={{ width: 130, flexShrink: 0 }}
                options={[{ label: '一级标签', value: 'L1' }, { label: '二级标签', value: 'L2' }]}
              />
              <Select
                mode="multiple"
                style={{ flex: 1 }}
                placeholder=""
                value={selectedTags.filter(t => {
                  const def = [...L1_TAGS, ...L2_TAGS, ...customTags].find(d => d.label === t);
                  return def ? def.level === pickerLevel : pickerLevel === 'L2';
                })}
                onChange={(vals: string[]) => {
                  const other = selectedTags.filter(t => {
                    const def = [...L1_TAGS, ...L2_TAGS, ...customTags].find(d => d.label === t);
                    return (def ? def.level : 'L2') !== pickerLevel;
                  });
                  setSelectedTags([...other, ...vals]);
                }}
                options={tagPickerOptions as any}
                tagRender={(props) => {
                  const { label, value, closable, onClose } = props;
                  const c = getTagColor(value as string, customTags);
                  return (
                    <AntTag closable={closable} onClose={onClose}
                      style={{ marginInlineEnd: 4, background: c.bg, color: c.text, borderColor: c.border }}>
                      {label}
                    </AntTag>
                  );
                }}
              />
              <Button icon={<PlusOutlined />} onClick={() => setTagModalOpen(true)}>自定义</Button>
            </Space.Compact>
            {selectedTags.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>已选：</Text>
                <Space size={4} wrap style={{ marginLeft: 6 }}>
                  {selectedTags.map(t => {
                    const c = getTagColor(t, customTags);
                    return (
                      <AntTag key={t} closable onClose={() => toggleTag(t)}
                        style={{ background: c.bg, color: c.text, borderColor: c.border }}>
                        {t}
                      </AntTag>
                    );
                  })}
                </Space>
              </div>
            )}
          </Form.Item>

          {/* 来源 */}
          <Form.List name="sources">
            {(fields, { add, remove }) => (
              <div>
                <Text strong>参考来源（选填）</Text>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} style={{ display: 'flex', marginTop: 8 }} align="start">
                    <Form.Item {...rest} name={name} style={{ marginBottom: 0, flex: 1, minWidth: 0, width: '100%' }}>
                      <Input placeholder="https://..." />
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
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={loading} size="large">
                {editId ? '更新短评' : '发布短评'}
              </Button>
              <Button onClick={() => navigate(-1)} size="large">取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* Preview modal */}
      <Modal
        open={previewOpen}
        title="卡片预览"
        onCancel={() => setPreviewOpen(false)}
        footer={null}
        width={640}
        styles={{ body: { padding: '20px 24px' } }}
      >
        <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 12 }}>
          短评卡片在短评池中显示的样式
        </Text>
        <div style={{
          border: '1px solid #D4BF98',
          borderLeft: '4px solid #FF6900',
          borderRadius: 3,
          background: '#FDFCF8',
          padding: '16px 20px',
          boxShadow: '2px 3px 0 #C8AE80',
        }}>
          <Text strong style={{ fontSize: 15 }}>{company}</Text>
          <div
            style={{ color: '#888', fontSize: 13, margin: '8px 0 10px', lineHeight: 1.6,
              overflow: 'hidden', display: '-webkit-box',
              WebkitLineClamp: 3, WebkitBoxOrient: 'vertical' }}
            dangerouslySetInnerHTML={{ __html: description || '（摘要为空）' }}
          />
          {validSections.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {validSections.slice(0, 5).map((sec, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    flexShrink: 0, marginTop: 2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#FF6A00', color: '#fff',
                    fontSize: 11, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}
                    dangerouslySetInnerHTML={{ __html: sec.title || '（无标题）' }} />
                </div>
              ))}
            </div>
          )}
          <div style={{ borderTop: '1px solid #f5f5f5', paddingTop: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {selectedTags.map(tag => {
              const c = getTagColor(tag, customTags);
              return (
                <AntTag key={tag} style={{ borderColor: c.border, background: c.bg, color: c.text, fontSize: 11, margin: 0 }}>
                  #{tag}
                </AntTag>
              );
            })}
            <Text type="secondary" style={{ fontSize: 12, marginLeft: 'auto' }}>
              {user?.name} · {dayjs().format('MM/DD HH:mm')}
            </Text>
          </div>
        </div>
      </Modal>

      {/* Custom tag modal */}
      <Modal
        open={tagModalOpen}
        title="新增自定义标签"
        onCancel={() => setTagModalOpen(false)}
        onOk={handleAddCustomTag}
        confirmLoading={newTagSubmitting}
        okText="添加" cancelText="取消"
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
