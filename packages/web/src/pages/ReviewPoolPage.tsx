import React, { useEffect, useRef, useState } from 'react';
import { Tabs, Typography, Empty, Spin, Button, Badge, message } from 'antd';
import { FireOutlined, ClockCircleOutlined, CheckCircleOutlined, InboxOutlined } from '@ant-design/icons';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useAuthStore } from '../stores/authStore';
import { useFavoritesStore } from '../stores/favoritesStore';
import ArchiveDrawer from '../components/Archive/ArchiveDrawer';
import StatsPanel from '../components/Archive/StatsPanel';
import ReviewDetailDrawer from '../components/ReviewDetailDrawer';
import ReviewCard from '../components/Review/ReviewCard';
import api from '../api/client';

const TILTS = [-0.5, 0.4, -0.25];
const ESTIMATED_CARD_HEIGHT = 150;

/** A virtualized list of ReviewCards */
const VirtualReviewList: React.FC<{
  items: any[];
  onCardClick: (id: string) => void;
  extraSlot?: (review: any) => React.ReactNode;
}> = ({ items, onCardClick, extraSlot }) => {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
    overscan: 5,
  });

  return (
    <div
      ref={parentRef}
      style={{ height: 'calc(100vh - 200px)', overflowY: 'auto', overflowX: 'hidden' }}
    >
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {virtualizer.getVirtualItems().map(vItem => {
          const review = items[vItem.index];
          return (
            <div
              key={review.id}
              data-index={vItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${vItem.start}px)`,
                paddingBottom: 0,
              }}
            >
              <div style={{ position: 'relative' }}>
                <ReviewCard
                  review={review}
                  onClick={() => onCardClick(review.id)}
                  tiltDeg={TILTS[vItem.index % TILTS.length]}
                />
                {extraSlot?.(review)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ReviewPoolPage: React.FC = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('in_progress');
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [drawerReviewId, setDrawerReviewId] = useState<string | null>(null);
  const { user } = useAuthStore();
  const { hydrate } = useFavoritesStore();

  const fetchReviews = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/reviews');
      setReviews(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => {
    fetchReviews();
    hydrate(); // load favorite IDs once
  }, []);

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
              <VirtualReviewList
                items={inProgress}
                onCardClick={(id) => setDrawerReviewId(id)}
                extraSlot={(review) =>
                  user?.role === 'supervisor' && review.status === 'in_progress' ? (
                    <div
                      style={{
                        position: 'absolute',
                        bottom: 10,
                        right: 16,
                        zIndex: 1,
                      }}
                    >
                      <span
                        onClick={(e) => handleForceComplete(e, review.id)}
                        style={{
                          fontSize: 11,
                          color: '#bbb',
                          cursor: 'pointer',
                          padding: '2px 6px',
                          borderRadius: 3,
                          border: '1px solid #e8e8e8',
                          background: '#fafafa',
                          transition: 'all 0.2s',
                          userSelect: 'none',
                        }}
                        onMouseEnter={e => {
                          (e.currentTarget as HTMLElement).style.color = '#FF6A00';
                          (e.currentTarget as HTMLElement).style.borderColor = '#FF6A00';
                        }}
                        onMouseLeave={e => {
                          (e.currentTarget as HTMLElement).style.color = '#bbb';
                          (e.currentTarget as HTMLElement).style.borderColor = '#e8e8e8';
                        }}
                      >
                        结束评分
                      </span>
                    </div>
                  ) : null
                }
              />
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
              <VirtualReviewList
                items={completed}
                onCardClick={(id) => setDrawerReviewId(id)}
              />
            ),
          },
        ]}
      />
    </div>
  );
};

export default ReviewPoolPage;
