import React, { useEffect, useState } from 'react';
import { Tabs, Card, Tag, Typography, Space, Empty, Spin, Button, Badge, Avatar, Tooltip, message } from 'antd';
import { FireOutlined, ClockCircleOutlined, CheckCircleOutlined, SendOutlined, UserOutlined, InboxOutlined, ToolOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useAuthStore } from '../stores/authStore';
import ArchiveDrawer from '../components/Archive/ArchiveDrawer';
import StatsPanel from '../components/Archive/StatsPanel';
import ReviewDetailDrawer from '../components/ReviewDetailDrawer';
import { getTagColor } from '@ai-review/shared';
import api from '../api/client';

const { Text, Paragraph } = Typography;

const MiniScoreAvatars: React.FC<{ scorers: any[] }> = ({ scorers }) => (
  <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
    {scorers.map((s: any) => (
      <Tooltip key={s.userId} title={`${s.name}${s.hasScored ? ' (已评)' : ''}`}>
        <Avatar
          size={22}
          icon={<UserOutlined />}
          src={s.avatarUrl}
          style={s.hasScored
            ? { backgroundColor: '#FF6A00', fontSize: 10 }
            : { filter: 'grayscale(1)', opacity: 0.3, fontSize: 10 }
          }
        >
          {s.name?.[0]}
        </Avatar>
      </Tooltip>
    ))}
  </div>
);

/** Strip HTML tags and extract plain text from a rich-text body. */
function plainTextFromHtml(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined') return html.replace(/<[^>]*>/g, '');
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || '').trim();
}

const ReviewCard: React.FC<{ review: any; onClick: () => void }> = ({ review, onClick }) => {
  const progress = review.scoringProgress;
  const sections: any[] = review.sections || [];
  const hasBody = !!review.body;
  const bodyPreview = hasBody ? plainTextFromHtml(review.body) : '';

  return (
    <Card
      hoverable
      onClick={onClick}
      className="paper-card"
      style={{
        marginBottom: 16,
        borderLeft: '4px solid #FF6900',
        background: '#FDFCF8',
      }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      {/* Row 1: title + status badge + heat score */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ flex: 1, marginRight: 16 }}>
          <Space size={8} wrap>
            <Text strong style={{ fontSize: 15, lineHeight: 1.4 }}>{review.company}</Text>
            {review.distributed && <Tag color="green" icon={<SendOutlined />} style={{ margin: 0 }}>已分发</Tag>}
            {review.status === 'completed' && !review.distributed && (
              <Tag color="orange" icon={<CheckCircleOutlined />} style={{ margin: 0 }}>待审阅</Tag>
            )}
            {review.hasUnresolvedRevision && (
              <Badge dot color="red" offset={[0, 0]}>
                <Tag icon={<ToolOutlined />} color="error" style={{ margin: 0 }}>修改建议</Tag>
              </Badge>
            )}
          </Space>
        </div>
        {review.status === 'completed' && review.heatScore !== null && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            <FireOutlined style={{ color: '#FF6A00', fontSize: 14 }} />
            <Text style={{ color: '#FF6A00', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>
              {review.heatScore.toFixed(2)}
            </Text>
          </div>
        )}
      </div>

      {/* Row 2: event description */}
      <Paragraph
        ellipsis={{ rows: 2 }}
        style={{ color: '#888', fontSize: 13, marginBottom: 10, lineHeight: 1.6 }}
      >
        {hasBody ? bodyPreview : review.description}
      </Paragraph>

      {/* Row 3: section titles as viewpoint pills (legacy reviews only) */}
      {!hasBody && sections.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 10 }}>
          {sections.map((sec: any, i: number) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{
                flexShrink: 0, marginTop: 2,
                width: 18, height: 18, borderRadius: '50%',
                background: '#FF6A00', color: '#fff',
                fontSize: 11, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {i + 1}
              </span>
              <Text style={{ fontSize: 13, color: '#333', lineHeight: 1.5 }} ellipsis>
                {sec.title}
              </Text>
            </div>
          ))}
        </div>
      )}

      {/* Row 4: tags + author + avatars */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f5f5f5', paddingTop: 10 }}>
        <Space size={4} wrap>
          {(review.tags as string[])?.map((tag: string) => {
            const c = getTagColor(tag);
            return (
              <Tag key={tag} style={{ borderColor: c.border, background: c.bg, color: c.text, fontSize: 11, margin: 0 }}>
                #{tag}
              </Tag>
            );
          })}
        </Space>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, marginLeft: 12 }}>
          <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            {review.author?.name} · {dayjs(review.createdAt).format('MM/DD HH:mm')}
          </Text>
          <MiniScoreAvatars scorers={progress.scorers} />
        </div>
      </div>
    </Card>
  );
};

const ReviewPoolPage: React.FC = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('in_progress');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [drawerReviewId, setDrawerReviewId] = useState<string | null>(null);
  const { user } = useAuthStore();

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/reviews');
      setReviews(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchReviews(); }, []);

  const inProgress = reviews.filter(r => r.status === 'in_progress');
  const completed = reviews.filter(r => r.status === 'completed');

  const handleForceComplete = async (e: React.MouseEvent, reviewId: string) => {
    e.stopPropagation();
    try {
      await api.post(`/api/reviews/${reviewId}/complete`);
      message.success('已完成');
      fetchReviews();
    } catch (err: any) {
      message.error(err.response?.data?.error || '操作失败');
    }
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Stats panel */}
      <StatsPanel reviews={reviews} />

      {/* Floating archive button */}
      <Button
        onClick={() => setArchiveOpen(true)}
        icon={<InboxOutlined />}
        style={{
          position: 'fixed', right: 24, bottom: 80, zIndex: 100,
          background: '#f5f5f5', border: '1px solid #ddd', color: '#666',
          boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          display: 'flex', alignItems: 'center', gap: 4,
          height: 40, borderRadius: 20, padding: '0 16px',
        }}
      >
        全部短评
      </Button>

      <ArchiveDrawer
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onReviewClick={(id: string) => setDrawerReviewId(id)}
      />

      <ReviewDetailDrawer
        reviewId={drawerReviewId}
        open={!!drawerReviewId}
        onClose={() => setDrawerReviewId(null)}
        onChange={fetchReviews}
      />

      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'in_progress',
            label: (
              <Badge count={inProgress.length} offset={[12, -2]} color="#FF6A00">
                <span><ClockCircleOutlined /> 进行中</span>
              </Badge>
            ),
            children: loading ? <Spin /> : inProgress.length === 0 ? (
              <Empty description="暂无进行中的短评" />
            ) : (
              inProgress.map(r => (
                <div key={r.id} style={{ position: 'relative' }}>
                  <ReviewCard review={r} onClick={() => setDrawerReviewId(r.id)} />
                  {user?.role === 'supervisor' && r.status === 'in_progress' && (
                    <Button
                      size="small"
                      type="link"
                      style={{ position: 'absolute', top: 14, right: 16, color: '#FF6A00' }}
                      onClick={(e) => handleForceComplete(e, r.id)}
                    >
                      强制结束评分
                    </Button>
                  )}
                </div>
              ))
            ),
          },
          {
            key: 'completed',
            label: (
              <Badge count={completed.length} offset={[12, -2]} color="#52c41a">
                <span><CheckCircleOutlined /> 已完成</span>
              </Badge>
            ),
            children: loading ? <Spin /> : completed.length === 0 ? (
              <Empty description="暂无已完成的短评" />
            ) : (
              completed.map(r => (
                <ReviewCard key={r.id} review={r} onClick={() => setDrawerReviewId(r.id)} />
              ))
            ),
          },
        ]}
      />
    </div>
  );
};

export default ReviewPoolPage;
