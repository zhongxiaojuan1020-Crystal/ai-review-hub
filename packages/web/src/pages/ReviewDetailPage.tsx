import React, { useEffect, useState } from 'react';
import { Card, Typography, Tag, Space, Button, Spin, Divider, message, Popconfirm } from 'antd';
import {
  ArrowLeftOutlined, FireOutlined, EditOutlined, DeleteOutlined,
  SendOutlined, LinkOutlined, ClockCircleOutlined,
} from '@ant-design/icons';
import { useParams, useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import ScoreAvatars from '../components/Scoring/ScoreAvatars';
import ScoringPanel from '../components/Scoring/ScoringPanel';
import CommentList from '../components/Comments/CommentList';
import { useAuthStore } from '../stores/authStore';
import DistributePreview from '../components/Distribution/DistributePreview';
import { ContentRenderer } from '../components/ContentRenderer';
import api from '../api/client';

const { Title, Text } = Typography;

const ReviewDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [review, setReview] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const fetchReview = async () => {
    try {
      const res = await api.get(`/api/reviews/${id}`);
      setReview(res.data);
    } catch {
      message.error('加载失败');
    }
    setLoading(false);
  };

  useEffect(() => { fetchReview(); }, [id]);

  const handleDelete = async () => {
    try {
      await api.delete(`/api/reviews/${id}`);
      message.success('已删除');
      navigate('/reviews');
    } catch (err: any) {
      message.error(err.response?.data?.error || '删除失败');
    }
  };

  const handleDistribute = async () => {
    setDistributing(true);
    try {
      await api.post('/api/distribute', { reviewId: id });
      message.success('分发成功');
      setPreviewOpen(false);
      fetchReview();
    } catch (err: any) {
      message.error(err.response?.data?.error || '分发失败');
    }
    setDistributing(false);
  };

  const handleGenerateLink = async () => {
    try {
      const res = await api.post(`/api/reviews/${id}/guest-link`);
      await navigator.clipboard.writeText(res.data.url);
      message.success('访客链接已复制到剪贴板');
    } catch {
      message.error('生成链接失败');
    }
  };

  if (loading) return <Spin style={{ display: 'block', marginTop: 100, textAlign: 'center' }} size="large" />;
  if (!review) return <div>短评不存在</div>;

  const isAuthor = user?.id === review.authorId;
  const isSupervisor = user?.role === 'supervisor';

  return (
    <div style={{ maxWidth: 960, margin: '0 auto' }}>
      <Button icon={<ArrowLeftOutlined />} type="text" onClick={() => navigate(-1)} style={{ marginBottom: 16 }}>
        返回
      </Button>

      <Card>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>{review.company}</Title>
            <Space style={{ marginTop: 8 }} wrap>
              <Text type="secondary">
                <ClockCircleOutlined /> {dayjs(review.createdAt).format('YYYY-MM-DD HH:mm')}
              </Text>
              <Text type="secondary">· {review.author?.name}</Text>
              {review.distributed && <Tag color="green" icon={<SendOutlined />}>已分发</Tag>}
              {review.updatedAt && review.updatedAt !== review.createdAt && (
                <Text type="secondary" style={{ fontSize: 12, opacity: 0.6 }}>
                  · 编辑于 {dayjs(review.updatedAt).format('MM/DD HH:mm')}
                </Text>
              )}
            </Space>
          </div>
          <Space>
            {review.heatScore !== null && (
              <div style={{ textAlign: 'center' }}>
                <FireOutlined style={{ color: '#FF6A00', fontSize: 20 }} />
                <div style={{ color: '#FF6A00', fontSize: 28, fontWeight: 700 }}>
                  {review.heatScore.toFixed(2)}
                </div>
                <Text type="secondary" style={{ fontSize: 12 }}>热度分</Text>
              </div>
            )}
          </Space>
        </div>

        {/* Tags */}
        <div style={{ margin: '12px 0' }}>
          {(review.tags as string[])?.map((tag: string) => (
            <Tag key={tag} style={{ borderColor: '#FFD591', background: '#FFF7E6', color: '#FF6A00' }}>
              #{tag}
            </Tag>
          ))}
        </div>

        <Divider />

        {/* Event Description */}
        <div style={{ marginBottom: 24 }}>
          <Text strong style={{ fontSize: 14, color: '#999' }}>事件描述</Text>
          <ContentRenderer
            content={review.description}
            style={{ fontSize: 15, marginTop: 8 }}
          />
        </div>

        {/* Sections */}
        {(review.sections as any[])?.map((section: any, idx: number) => (
          <Card
            key={idx}
            size="small"
            style={{ background: '#FFFAF0', borderColor: '#FFD591', marginBottom: 16 }}
          >
            <Text strong style={{ color: '#FF6A00' }}>{section.title}</Text>
            <ContentRenderer
              content={section.content}
              legacyImages={section.images}
              style={{ marginTop: 8 }}
            />
          </Card>
        ))}

        {/* Sources */}
        {review.sources?.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 14, color: '#999' }}>参考来源</Text>
            <ul style={{ marginTop: 4, paddingLeft: 20 }}>
              {(review.sources as string[]).map((src: string, i: number) => (
                <li key={i}>
                  <a href={src} target="_blank" rel="noopener noreferrer" style={{ color: '#FF6A00' }}>{src}</a>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Divider />

        {/* Scoring Progress */}
        <div style={{ marginBottom: 16 }}>
          <Text strong>评分进度 ({review.scoringProgress.completed}/{review.scoringProgress.total})</Text>
          <div style={{ marginTop: 8 }}>
            <ScoreAvatars reviewId={review.id} scorers={review.scoringProgress.scorers} />
          </div>
        </div>

        {/* Action buttons */}
        <Space style={{ marginTop: 16 }}>
          {(isAuthor || isSupervisor) && (
            <Button icon={<EditOutlined />} onClick={() => navigate(`/publish?edit=${review.id}`)}>
              编辑
            </Button>
          )}
          {isAuthor && (
            <Popconfirm title="确定删除这条短评？" onConfirm={handleDelete} okText="删除" cancelText="取消">
              <Button icon={<DeleteOutlined />} danger>删除</Button>
            </Popconfirm>
          )}
          {isSupervisor && review.status === 'completed' && !review.distributed && (
            <Button type="primary" icon={<SendOutlined />} onClick={() => setPreviewOpen(true)}>
              分发到钉钉
            </Button>
          )}
          {isSupervisor && (
            <Button icon={<LinkOutlined />} onClick={handleGenerateLink}>
              生成访客链接
            </Button>
          )}
        </Space>
      </Card>

      {/* Scoring Panel */}
      <div style={{ marginTop: 16 }}>
        <ScoringPanel reviewId={review.id} isAuthor={isAuthor} onScoreSubmitted={fetchReview} />
      </div>

      {/* Comments */}
      <div style={{ marginTop: 16 }}>
        <CommentList reviewId={review.id} />
      </div>

      <DistributePreview
        reviewId={id!}
        open={previewOpen}
        onCancel={() => setPreviewOpen(false)}
        loading={distributing}
        onConfirm={handleDistribute}
      />
    </div>
  );
};

export default ReviewDetailPage;
