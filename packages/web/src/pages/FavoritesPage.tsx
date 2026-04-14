import React, { useEffect, useState } from 'react';
import { Empty, Spin, Typography } from 'antd';
import { StarFilled } from '@ant-design/icons';
import ReviewCard from '../components/Review/ReviewCard';
import ReviewDetailDrawer from '../components/ReviewDetailDrawer';
import api from '../api/client';

const { Title } = Typography;

const FavoritesPage: React.FC = () => {
  const [reviews, setReviews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerReviewId, setDrawerReviewId] = useState<string | null>(null);

  const fetchFavorites = async () => {
    setLoading(true);
    try {
      const res = await api.get('/api/favorites');
      setReviews(res.data);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchFavorites(); }, []);

  const TILTS = [-0.5, 0.4, -0.25];

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <StarFilled style={{ color: '#FF6900', fontSize: 20 }} />
        <Title level={4} style={{ margin: 0, color: '#FF6900' }}>我的收藏</Title>
      </div>

      {loading ? (
        <Spin style={{ display: 'block', margin: '80px auto' }} />
      ) : reviews.length === 0 ? (
        <Empty description="还没有收藏任何短评，去短评池里收藏吧 ✨" />
      ) : (
        reviews.map((r, i) => (
          <ReviewCard
            key={r.id}
            review={r}
            onClick={() => setDrawerReviewId(r.id)}
            tiltDeg={TILTS[i % TILTS.length]}
          />
        ))
      )}

      <ReviewDetailDrawer
        reviewId={drawerReviewId}
        open={!!drawerReviewId}
        onClose={() => setDrawerReviewId(null)}
        onChange={fetchFavorites}
      />
    </div>
  );
};

export default FavoritesPage;
