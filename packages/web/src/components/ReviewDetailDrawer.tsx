import React, { useEffect, useState } from 'react';
import {
  Drawer, Card, Typography, Tag, Space, Button, Spin, Divider, message, Popconfirm,
} from 'antd';
import {
  FireOutlined, EditOutlined, DeleteOutlined, SendOutlined, LinkOutlined, ClockCircleOutlined,
  RedoOutlined, BellOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import ScoreAvatars from './Scoring/ScoreAvatars';
import ScoringPanel from './Scoring/ScoringPanel';
import CommentList from './Comments/CommentList';
import { useAuthStore } from '../stores/authStore';
import DistributePreview from './Distribution/DistributePreview';
import { ContentRenderer } from './ContentRenderer';
import HtmlRenderer from './HtmlRenderer';
import { getTagColor } from '@ai-review/shared';
import api from '../api/client';

const { Title, Text } = Typography;

interface Props {
  reviewId: string | null;
  open: boolean;
  onClose: () => void;
  /** Optional: refresh parent list after edit/delete/distribute */
  onChange?: () => void;
}

/**
 * Right-side drawer that renders a full review inline — replaces
 * navigating to /reviews/:id. Used by ReviewPool, Ranking, Archive,
 * Profile, etc. to keep users in their current context.
 */
const ReviewDetailDrawer: React.FC<Props> = ({ reviewId, open, onClose, onChange }) => {
  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [repushing, setRepushing] = useState(false);
  const [notifying, setNotifying] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const fetchReview = async () => {
    if (!reviewId) return;
    setLoading(true);
    try {
      const res = await api.get(`/api/reviews/${reviewId}`);
      setReview(res.data);
    } catch {
      message.error('加载失败');
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && reviewId) {
      fetchReview();
    } else {
      setReview(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, reviewId]);

  const handleDelete = async () => {
    if (!reviewId) return;
    try {
      await api.delete(`/api/reviews/${reviewId}`);
      message.success('已删除');
      onChange?.();
      onClose();
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  const handleDistribute = async () => {
    if (!reviewId) return;
    setDistributing(true);
    try {
      const res = await api.post('/api/distribute', { reviewId });
      const dt = res.data?.dingtalk;
      if (dt && !dt.ok) {
        message.warning(`已标记为已分发，但钉钉推送失败：${dt.errmsg || dt.reason || '未知错误'}`, 6);
      } else {
        message.success('分发成功，已推送到钉钉群聊');
      }
      setPreviewOpen(false);
      fetchReview();
      onChange?.();
    } catch (err: any) {
      message.error(err.response?.data?.error || '分发失败');
    }
    setDistributing(false);
  };

  const handleRepush = async () => {
    if (!reviewId) return;
    setRepushing(true);
    try {
      const res = await api.post(`/api/reviews/${reviewId}/repush`);
      const dt = res.data?.dingtalk;
      if (dt && !dt.ok) {
        message.warning(`钉钉推送失败：${dt.errmsg || dt.reason || '未知错误'}`, 6);
      } else {
        message.success('已再次推送到钉钉群聊');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '推送失败');
    }
    setRepushing(false);
  };

  const handleGenerateLink = async () => {
    if (!reviewId) return;
    try {
      const res = await api.post(`/api/reviews/${reviewId}/guest-link`);
      await navigator.clipboard.writeText(res.data.url);
      message.success('分享链接已复制到剪贴板');
    } catch {
      message.error('生成链接失败');
    }
  };

  const handleNotify = async () => {
    if (!reviewId) return;
    setNotifying(true);
    try {
      const res = await api.post(`/api/reviews/${reviewId}/notify`);
      const dt = res.data?.dingtalk;
      if (dt && !dt.ok) {
        message.warning(`发布提醒发送失败：${dt.errmsg || dt.reason || '未知错误'}`, 6);
      } else {
        message.success('已在钉钉群发送发布提醒');
      }
    } catch (err: any) {
      message.error(err.response?.data?.error || '发送失败');
    }
    setNotifying(false);
  };

  const isAuthor = !!(review && user?.id === review.authorId);
  const isSupervisor = user?.role === 'supervisor';

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="50%"
      title={null}
      closable
      destroyOnClose
      styles={{ body: { padding: '16px 20px', background: '#fafafa' } }}
    >
      {loading || !review ? (
        <Spin style={{ display: 'block', marginTop: 100, textAlign: 'center' }} size="large" />
      ) : (
        <>
          <Card>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <Title level={4} style={{ margin: 0 }}>{review.company}</Title>
                <Space style={{ marginTop: 8 }} wrap>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined /> {dayjs(review.createdAt).format('YYYY-MM-DD HH:mm')}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>· {review.author?.name}</Text>
                  {review.distributed && <Tag color="green" icon={<SendOutlined />}>已分发</Tag>}
                </Space>
              </div>
              {review.heatScore !== null && (
                <div style={{ textAlign: 'center', flexShrink: 0, marginLeft: 12 }}>
                  <FireOutlined style={{ color: '#FF6A00', fontSize: 18 }} />
                  <div style={{ color: '#FF6A00', fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
                    {review.heatScore.toFixed(2)}
                  </div>
                  <Text type="secondary" style={{ fontSize: 11 }}>热度分</Text>
                </div>
              )}
            </div>

            {/* Tags */}
            <div style={{ margin: '12px 0' }}>
              {(review.tags as string[])?.map((tag: string) => {
                const c = getTagColor(tag);
                return (
                  <Tag key={tag} style={{ borderColor: c.border, background: c.bg, color: c.text }}>
                    #{tag}
                  </Tag>
                );
              })}
            </div>

            <Divider style={{ margin: '12px 0' }} />

            {/* Body: HTML (old rich editor) or structured (description + sections) */}
            {review.body && !review.body.startsWith('{') ? (
              <div style={{ marginBottom: 20 }}>
                <HtmlRenderer html={review.body} />
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 20 }}>
                  <Text strong style={{ fontSize: 13, color: '#999' }}>事件描述</Text>
                  <ContentRenderer
                    content={review.description}
                    legacyImages={(() => { try { return review.body ? JSON.parse(review.body).descriptionImages : undefined; } catch { return undefined; } })()}
                    style={{ fontSize: 14, marginTop: 6 }}
                  />
                </div>
                {(review.sections as any[])?.map((section: any, idx: number) => (
                  <Card
                    key={idx}
                    size="small"
                    style={{ background: '#FFFAF0', borderColor: '#FFD591', marginBottom: 12 }}
                  >
                    <Text strong style={{ color: '#FF6A00' }}>{section.title}</Text>
                    <ContentRenderer
                      content={section.content}
                      legacyImages={section.images}
                      style={{ marginTop: 6 }}
                    />
                  </Card>
                ))}
              </>
            )}

            {/* Sources */}
            {review.sources?.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <Text strong style={{ fontSize: 13, color: '#999' }}>参考来源</Text>
                <ul style={{ marginTop: 4, paddingLeft: 20 }}>
                  {(review.sources as string[]).map((src: string, i: number) => (
                    <li key={i}>
                      <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: '#FF6A00', fontSize: 13 }}>{src}</a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Divider style={{ margin: '12px 0' }} />

            {/* Scoring Progress */}
            <div style={{ marginBottom: 12 }}>
              <Text strong style={{ fontSize: 13 }}>
                评分进度 ({review.scoringProgress.completed}/{review.scoringProgress.total})
              </Text>
              <div style={{ marginTop: 6 }}>
                <ScoreAvatars reviewId={review.id} scorers={review.scoringProgress.scorers} />
              </div>
            </div>

            {/* Action buttons */}
            <Space wrap style={{ marginTop: 12 }}>
              {(isAuthor || isSupervisor) && (
                <Button size="small" icon={<EditOutlined />} onClick={() => { onClose(); navigate(`/publish?edit=${review.id}`); }}>
                  编辑
                </Button>
              )}
              {isAuthor && (
                <Popconfirm title="确定删除这条短评？" onConfirm={handleDelete} okText="删除" cancelText="取消">
                  <Button size="small" icon={<DeleteOutlined />} danger>删除</Button>
                </Popconfirm>
              )}
              {isSupervisor && review.status === 'completed' && !review.distributed && (
                <Button size="small" type="primary" icon={<SendOutlined />} onClick={() => setPreviewOpen(true)}>
                  分发到钉钉
                </Button>
              )}
              {isSupervisor && review.distributed && (
                <Button
                  size="small"
                  icon={<RedoOutlined />}
                  loading={repushing}
                  onClick={handleRepush}
                  style={{ color: '#888', borderColor: '#d9d9d9' }}
                >
                  再次推送
                </Button>
              )}
              {(isAuthor || isSupervisor) && (
                <Button size="small" icon={<BellOutlined />} loading={notifying} onClick={handleNotify}>
                  发布提醒
                </Button>
              )}
              {(isAuthor || isSupervisor) && (
                <Button size="small" icon={<LinkOutlined />} onClick={handleGenerateLink}>
                  生成分享链接
                </Button>
              )}
            </Space>
          </Card>

          {/* Scoring Panel */}
          <div style={{ marginTop: 12 }}>
            <ScoringPanel reviewId={review.id} isAuthor={isAuthor} onScoreSubmitted={() => { fetchReview(); onChange?.(); }} />
          </div>

          {/* Comments */}
          <div style={{ marginTop: 12 }}>
            <CommentList
              reviewId={review.id}
              reviewAuthorId={review.authorId}
              onRevisionResolved={() => { fetchReview(); onChange?.(); }}
            />
          </div>

          <DistributePreview
            reviewId={reviewId!}
            open={previewOpen}
            onCancel={() => setPreviewOpen(false)}
            loading={distributing}
            onConfirm={handleDistribute}
          />
        </>
      )}
    </Drawer>
  );
};

export default ReviewDetailDrawer;
