import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Form, Input, Button, Select, Typography, Space, message, Divider,
  Modal, Radio, Tag as AntTag, Collapse, Tooltip,
} from 'antd';
import {
  PlusOutlined, MinusCircleOutlined, ThunderboltOutlined, LoadingOutlined,
  EyeOutlined, IdcardOutlined, SaveOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  L1_TAGS, L2_TAGS, MAIN_DOMAINS, getTagColor, type TagDef,
} from '@ai-review/shared';
import dayjs from 'dayjs';
import api from '../api/client';
import RichEditor from '../components/RichEditor';
import HtmlRenderer from '../components/HtmlRenderer';
import ReviewCard from '../components/Review/ReviewCard';
import { useAuthStore } from '../stores/authStore';

const { Title, Text } = Typography;

const AUTO_SAVE_INTERVAL = 30_000; // 30 seconds

const PublishPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [body, setBody] = useState('');
  const [customTags, setCustomTags] = useState<TagDef[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  // AI assistant state
  const [aiRawText, setAiRawText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [pickerLevel, setPickerLevel] = useState<'L1' | 'L2'>('L1');

  // Custom tag modal
  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagLevel, setNewTagLevel] = useState<'L1' | 'L2'>('L2');
  const [newTagParent, setNewTagParent] = useState<string>(MAIN_DOMAINS[0]);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [newTagSubmitting, setNewTagSubmitting] = useState(false);

  // Preview modals
  const [articlePreviewOpen, setArticlePreviewOpen] = useState(false);
  const [cardPreviewOpen, setCardPreviewOpen] = useState(false);

  // Auto-save state
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);
  const draftKey = editId ? `edit:${editId}` : 'publish';

  // Mark dirty whenever content changes
  useEffect(() => { dirtyRef.current = true; }, [body, selectedTags]);

  const saveDraft = useCallback(async (silent = true) => {
    if (!dirtyRef.current) return;
    const company = form.getFieldValue('company');
    const sources = form.getFieldValue('sources');
    if (!company && !body) return; // nothing to save
    setSaving(true);
    try {
      await api.put(`/api/drafts/${draftKey}`, {
        company,
        body,
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
  }, [body, selectedTags, draftKey, form]);

  // Auto-save interval
  useEffect(() => {
    const timer = setInterval(() => saveDraft(true), AUTO_SAVE_INTERVAL);
    return () => clearInterval(timer);
  }, [saveDraft]);

  // Save on page unload
  useEffect(() => {
    const handler = () => { if (dirtyRef.current) saveDraft(true); };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [saveDraft]);

  useEffect(() => {
    api.get('/api/tags').then(res => {
      setCustomTags(res.data.customTags || []);
    }).catch(() => {});
  }, []);

  // Load existing review (edit mode)
  useEffect(() => {
    if (editId) {
      api.get(`/api/reviews/${editId}`).then(res => {
        const r = res.data;
        const company = r.company.startsWith('【短评】') ? r.company : `【短评】${r.company}`;
        form.setFieldsValue({ company, sources: r.sources?.length > 0 ? r.sources : [''] });
        setSelectedTags(r.tags || []);
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

  // Restore draft on mount (only for new reviews, not edits)
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
          if (draft.body) setBody(draft.body);
          if (Array.isArray(draft.tags)) setSelectedTags(draft.tags);
          if (Array.isArray(draft.sources) && draft.sources.length > 0) {
            form.setFieldValue('sources', draft.sources);
          }
          message.success('草稿已恢复');
        },
        onCancel: () => {
          api.delete(`/api/drafts/${draftKey}`).catch(() => {});
        },
      });
    }).catch(() => {});
  }, [draftKey, editId]);

  // Options for the right-hand tag dropdown, filtered by level
  const tagPickerOptions = useMemo(() => {
    if (pickerLevel === 'L1') {
      const l1 = [...L1_TAGS, ...customTags.filter(t => t.level === 'L1')];
      return l1.map(t => ({ label: t.label, value: t.label }));
    }
    const allL2 = [...L2_TAGS, ...customTags.filter(t => t.level === 'L2')];
    const allL1Custom = customTags.filter(t => t.level === 'L1').map(t => t.label);
    const domains = [...MAIN_DOMAINS, ...allL1Custom];
    return domains
      .map(d => ({ label: d, options: allL2.filter(t => t.parent === d).map(t => ({ label: t.label, value: t.label })) }))
      .filter(g => g.options.length > 0);
  }, [pickerLevel, customTags]);

  const toggleTag = (label: string) => {
    setSelectedTags(prev => prev.includes(label) ? prev.filter(t => t !== label) : [...prev, label]);
  };

  const handleAddCustomTag = async () => {
    const label = newTagLabel.trim();
    if (!label) { message.warning('请输入标签'); return; }
    setNewTagSubmitting(true);
    try {
      const res = await api.post('/api/tags', {
        label, level: newTagLevel,
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

  const handleAiFormat = async () => {
    if (!aiRawText.trim() || aiRawText.trim().length < 10) {
      message.warning('请先粘贴原始材料（至少10字）');
      return;
    }
    setAiLoading(true);
    try {
      const res = await api.post('/api/ai/format', { rawText: aiRawText });
      const { title, body: aiBody, suggestedTags } = res.data;
      if (title) form.setFieldValue('company', `【短评】${title}`);
      if (aiBody) setBody(aiBody);
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

  const handleSubmit = async (values: any) => {
    if (!body.trim() || body === '<br>' || body === '<p><br></p>') {
      message.warning('请输入短评内容'); return;
    }
    if (selectedTags.length === 0) {
      message.warning('请至少选择一个标签'); return;
    }
    setLoading(true);
    try {
      const tmp = document.createElement('div');
      tmp.innerHTML = body;
      const firstLine = (tmp.textContent || '').trim().slice(0, 120);
      const payload = {
        company: values.company,
        description: firstLine,
        body,
        sections: [],
        tags: selectedTags,
        sources: (values.sources || []).filter((s: string) => s?.trim()),
      };
      if (editId) {
        await api.put(`/api/reviews/${editId}`, payload);
        message.success('短评已更新');
      } else {
        const res = await api.post('/api/reviews', payload);
        message.success('短评发布成功');
        navigate(`/reviews/${res.data.id}`);
      }
      // Clear draft after successful publish
      api.delete(`/api/drafts/${draftKey}`).catch(() => {});
      if (editId) navigate(`/reviews/${editId}`);
    } catch (err: any) {
      message.error(err.response?.data?.error || '操作失败');
    }
    setLoading(false);
  };

  // Preview card mock
  const previewReview = {
    id: '_preview',
    company: form.getFieldValue('company') || '【短评】标题预览',
    body,
    description: '',
    sections: [],
    tags: selectedTags,
    status: 'completed',
    distributed: false,
    heatScore: 9.5,
    hasUnresolvedRevision: false,
    createdAt: new Date().toISOString(),
    author: { name: user?.name || '作者', avatarUrl: user?.avatarUrl },
    scoringProgress: { scorers: [] },
  };

  return (
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
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
            <Tooltip title="手动保存草稿">
              <Button
                size="small"
                icon={<SaveOutlined />}
                loading={saving}
                onClick={() => saveDraft(false)}
              >
                保存草稿
              </Button>
            </Tooltip>
            <Tooltip title="预览文章全文">
              <Button
                size="small"
                icon={<EyeOutlined />}
                onClick={() => setArticlePreviewOpen(true)}
              >
                全文预览
              </Button>
            </Tooltip>
            <Tooltip title="预览短评卡片样式">
              <Button
                size="small"
                icon={<IdcardOutlined />}
                onClick={() => setCardPreviewOpen(true)}
              >
                卡片预览
              </Button>
            </Tooltip>
          </Space>
        </div>

        {/* ── AI 排版助手 ─────────────────────────────────────── */}
        <Collapse
          ghost
          style={{ marginBottom: 20, border: '1px dashed #D4BF98', borderRadius: 4, background: 'rgba(255,252,248,0.6)' }}
          items={[{
            key: 'ai',
            label: (
              <span style={{ fontSize: 13, color: '#FF6900', fontWeight: 600 }}>
                <ThunderboltOutlined style={{ marginRight: 6 }} />
                AI 排版助手 — 贴入原文，一键生成短评
              </span>
            ),
            children: (
              <div style={{ paddingBottom: 4 }}>
                <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
                  将文章摘录、会议记录、要点笔记等原始材料贴入下方，AI 将自动提炼标题、正文结构和推荐标签。
                </Text>
                <Input.TextArea
                  value={aiRawText}
                  onChange={e => setAiRawText(e.target.value)}
                  placeholder="粘贴原始材料、文章内容或笔记要点..."
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
          <Form.Item
            name="company"
            label="主标题（目标公司 / 事件）"
            rules={[{ required: true, message: '请输入目标公司或事件' }]}
            getValueFromEvent={(e) => {
              const raw: string = e.target.value;
              if (!raw.startsWith('【短评】')) return '【短评】' + raw.replace(/^【短评】*/, '');
              return raw;
            }}
          >
            <Input size="large" />
          </Form.Item>

          <Form.Item label="正文">
            <RichEditor value={body} onChange={setBody} placeholder="" />
          </Form.Item>

          <Divider />

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
                  const def = [...L1_TAGS, ...L2_TAGS, ...customTags].find(d => d.label === t);
                  return def ? def.level === pickerLevel : pickerLevel === 'L2';
                })}
                onChange={(vals: string[]) => {
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

          <Form.List name="sources">
            {(fields, { add, remove }) => (
              <div>
                <Text strong>参考来源（选填）</Text>
                {fields.map(({ key, name, ...rest }) => (
                  <Space key={key} style={{ display: 'flex', marginTop: 8 }} align="start">
                    <Form.Item {...rest} name={name} style={{ marginBottom: 0, flex: 1, minWidth: 0, width: '100%' }}>
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
            <Space wrap>
              <Button type="primary" htmlType="submit" loading={loading} size="large">
                {editId ? '更新短评' : '发布短评'}
              </Button>
              <Button onClick={() => navigate(-1)} size="large">取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* ── Article preview modal ─────────────────────────────────── */}
      <Modal
        open={articlePreviewOpen}
        title="全文预览"
        onCancel={() => setArticlePreviewOpen(false)}
        footer={null}
        width={720}
        styles={{ body: { maxHeight: '75vh', overflowY: 'auto', padding: '24px 32px' } }}
      >
        <div style={{ marginBottom: 12 }}>
          <Text strong style={{ fontSize: 18 }}>{form.getFieldValue('company') || '（无标题）'}</Text>
        </div>
        {body ? <HtmlRenderer html={body} /> : <Text type="secondary">（正文为空）</Text>}
      </Modal>

      {/* ── Card preview modal ────────────────────────────────────── */}
      <Modal
        open={cardPreviewOpen}
        title="卡片预览"
        onCancel={() => setCardPreviewOpen(false)}
        footer={null}
        width={600}
        styles={{ body: { padding: '24px 20px' } }}
      >
        <Text type="secondary" style={{ display: 'block', fontSize: 11, marginBottom: 12 }}>
          这是短评在短评池中显示的卡片样式
        </Text>
        <ReviewCard review={previewReview} onClick={() => {}} />
      </Modal>

      {/* ── Custom tag modal ──────────────────────────────────────── */}
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
