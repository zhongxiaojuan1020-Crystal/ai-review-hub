import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Card, Form, Input, Button, Select, Typography, Space, message,
  Modal, Radio, Tag as AntTag, Collapse,
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
import { composeBodyFromLegacy, extractSectionTitles } from '../utils/reviewBody';

const { Title, Text } = Typography;

const AUTO_SAVE_INTERVAL = 30_000;

const PublishPage: React.FC = () => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit');
  const navigate = useNavigate();
  const { user } = useAuthStore();

  // Unified body (HTML) — contains paragraphs, images, and <h3 class="section-title">
  // subtitles all in one stream.
  const [body, setBody] = useState('');
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
  // Guard against StrictMode double-mount firing the restore modal twice
  const draftCheckedRef = useRef(false);
  const draftKey = editId ? `edit:${editId}` : 'publish';

  useEffect(() => { dirtyRef.current = true; }, [body, selectedTags]);

  const saveDraft = useCallback(async (silent = true) => {
    if (!dirtyRef.current) return;
    const company = form.getFieldValue('company');
    const sources = form.getFieldValue('sources');
    const hasContent = company || body;
    if (!hasContent) return;
    setSaving(true);
    try {
      await api.put(`/api/drafts/${draftKey}`, {
        company,
        // New format: store body HTML directly (no more JSON wrapping)
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
      // New format: `body` is raw HTML. Legacy format: stitch description + sections.
      // `body` may also be a JSON metadata blob from the very-old editor — ignore it
      // and rebuild from description + sections in that case.
      const rawBody = r.body || '';
      if (rawBody && !rawBody.startsWith('{')) {
        setBody(rawBody);
      } else {
        setBody(composeBodyFromLegacy(r.description, r.sections));
      }
      setResetKey(k => k + 1);
    }).catch(() => message.error('加载短评失败'));
  }, [editId]);

  // Restore draft on mount
  useEffect(() => {
    if (editId) return;
    // StrictMode may fire effects twice in dev; this ref guarantees the
    // confirm modal only pops up once per mount.
    if (draftCheckedRef.current) return;
    draftCheckedRef.current = true;
    api.get(`/api/drafts/${draftKey}`).then(res => {
      if (res.status === 204 || !res.data) return;
      const draft = res.data;
      // Treat the draft as empty when no company, no body text, no tags, no sources.
      const bodyStr: string = typeof draft.body === 'string' ? draft.body : '';
      const bodyHasText = (() => {
        if (!bodyStr) return false;
        // Old format stored JSON; peek into description/sections to see if it's hollow.
        if (bodyStr.trim().startsWith('{')) {
          try {
            const parsed = JSON.parse(bodyStr);
            const descText = String(parsed?.description || '').replace(/<[^>]*>/g, '').trim();
            const secHasText = Array.isArray(parsed?.sections)
              && parsed.sections.some((s: any) =>
                String(s?.title || '').replace(/<[^>]*>/g, '').trim()
                || String(s?.content || '').replace(/<[^>]*>/g, '').trim()
              );
            return !!(descText || secHasText);
          } catch {
            return bodyStr.trim().length > 0;
          }
        }
        // New format: raw HTML. Check for any text content.
        return bodyStr.replace(/<[^>]*>/g, '').trim().length > 0
          || /<img\b/i.test(bodyStr);
      })();
      const hasSources = Array.isArray(draft.sources)
        && draft.sources.some((s: string) => s && s.trim());
      const hasTags = Array.isArray(draft.tags) && draft.tags.length > 0;
      if (!draft.company?.trim() && !bodyHasText && !hasSources && !hasTags) {
        // Stale or empty draft record — silently discard and skip the modal.
        api.delete(`/api/drafts/${draftKey}`).catch(() => {});
        return;
      }
      Modal.confirm({
        title: '发现未完成草稿',
        content: `上次编辑于 ${dayjs(draft.savedAt).format('MM/DD HH:mm')}，是否恢复？`,
        okText: '恢复草稿',
        cancelText: '丢弃',
        onOk: () => {
          if (draft.company) form.setFieldValue('company', draft.company);
          if (Array.isArray(draft.tags)) setSelectedTags(draft.tags);
          if (Array.isArray(draft.sources) && draft.sources.length > 0) form.setFieldValue('sources', draft.sources);
          const b: string = typeof draft.body === 'string' ? draft.body : '';
          if (b) {
            if (b.trim().startsWith('{')) {
              // Legacy JSON-wrapped draft → migrate on-the-fly to unified body.
              try {
                const parsed = JSON.parse(b);
                setBody(composeBodyFromLegacy(parsed.description, parsed.sections));
              } catch {
                api.delete(`/api/drafts/${draftKey}`).catch(() => {});
                message.warning('旧格式草稿已丢弃，请重新编辑');
                return;
              }
            } else {
              setBody(b);
            }
            setResetKey(k => k + 1);
          }
          message.success('草稿已恢复');
        },
        onCancel: () => { api.delete(`/api/drafts/${draftKey}`).catch(() => {}); },
      });
    }).catch(() => {});
  }, [draftKey, editId]);

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
    if (!aiRawText || stripHtml(aiRawText).trim().length === 0) {
      message.warning('请先粘贴原始材料'); return;
    }
    setAiLoading(true);
    try {
      const res = await api.post('/api/ai/format', { rawText: aiRawText });
      const { title, description: aiDesc, sections: aiSections, sources: aiSources, _fallback, _reason } = res.data;
      if (title) form.setFieldValue('company', `【短评】${title}`);
      // Fold the AI's structured output into a single body HTML stream
      // (section titles become inline <h3 class="section-title">).
      setBody(composeBodyFromLegacy(aiDesc, aiSections));
      if (Array.isArray(aiSources) && aiSources.length > 0) {
        form.setFieldValue('sources', aiSources);
      }
      setResetKey(k => k + 1);
      if (_fallback) {
        message.warning(_reason || 'AI 解析失败，已填入原文供你手动整理');
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
    const bodyHasText = stripHtml(body).length > 0 || /<img\b/i.test(body);
    if (!bodyHasText) {
      message.warning('请填写正文内容'); return;
    }
    if (selectedTags.length === 0) {
      message.warning('请至少选择一个标签'); return;
    }
    setLoading(true);
    try {
      // New unified format: everything lives in `body` HTML. We clear
      // description/sections to keep the schema consistent — the backend
      // tolerates nullables.
      const payload = {
        company: values.company,
        body,
        description: '',
        sections: [],
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
  // For the preview modal: extract inline subtitles as a numbered list.
  const previewTitles = extractSectionTitles(body);

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
                  将已经写好的短评贴入下方（支持富文本、图片），AI 会拆解到标题、摘要、观点三类字段，原文一字不改。
                </Text>
                <div style={{ marginBottom: 12, background: '#FDFCF8' }}>
                  <RichTextEditor
                    key={`ai-input-${resetKey}`}
                    initialContent={aiRawText}
                    onChange={setAiRawText}
                    placeholder="粘贴原始材料（支持富文本和图片）..."
                    minHeight={140}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: '#A8906C' }}>
                    {stripHtml(aiRawText).length > 0 ? `${stripHtml(aiRawText).length} 字` : ''}
                  </Text>
                  <Button
                    type="primary"
                    icon={aiLoading ? <LoadingOutlined /> : <ThunderboltOutlined />}
                    onClick={handleAiFormat}
                    loading={aiLoading}
                    disabled={stripHtml(aiRawText).trim().length === 0}
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

          {/* 正文 — 单一富文本，子标题行内 */}
          <Form.Item label={
            <span>
              正文内容
              <Text type="secondary" style={{ fontSize: 11, marginLeft: 6 }}>
                选中一行后点击工具栏「子标题」按钮，可把它转为橙色小标题（如"观点一：…"）
              </Text>
            </span>
          }>
            <RichTextEditor
              key={`body-${resetKey}`}
              initialContent={body}
              onChange={setBody}
              placeholder={'贴入或撰写短评正文。用「子标题」工具按钮标记"观点一/技术亮点"等段落...'}
              minHeight={320}
              allowImages
              allowSectionTitle
            />
          </Form.Item>

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
                  <div
                    key={key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      marginTop: 8,
                      width: '100%',
                    }}
                  >
                    <Form.Item
                      {...rest}
                      name={name}
                      style={{ marginBottom: 0, flex: 1, minWidth: 0 }}
                    >
                      <Input placeholder="https://..." style={{ width: '100%' }} />
                    </Form.Item>
                    {fields.length > 1 && (
                      <MinusCircleOutlined
                        onClick={() => remove(name)}
                        style={{ color: '#999', flexShrink: 0 }}
                      />
                    )}
                  </div>
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
            // Card preview = first few paragraphs of body with HTML tags stripped
            dangerouslySetInnerHTML={{
              __html: (body || '（正文为空）')
                .replace(/<h3[^>]*class=['"][^'"]*section-title[^'"]*['"][^>]*>[\s\S]*?<\/h3>/gi, '')
            }}
          />
          {previewTitles.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {previewTitles.slice(0, 5).map((t, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                  <span style={{
                    flexShrink: 0, marginTop: 2,
                    width: 18, height: 18, borderRadius: '50%',
                    background: '#FF6A00', color: '#fff',
                    fontSize: 11, fontWeight: 700,
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }}>{t}</span>
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
